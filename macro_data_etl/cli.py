"""CLI for the global macro data ETL pipeline."""

from __future__ import annotations

from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from macro_data_etl.src.orchestration.pipeline import Pipeline

app = typer.Typer(
    name="macro-etl",
    help="Global Macro Data ETL — World Bank inflation, BIS policy rates, IMF, CME FedWatch",
    no_args_is_help=True,
    add_completion=False,
)
console = Console()


def _pipeline() -> Pipeline:
    return Pipeline()


def _manifest_table(run) -> Table:
    table = Table(title=f"Run {run.run_id}", show_lines=False, expand=True)
    table.add_column("Stage", style="cyan")
    table.add_column("Source", style="magenta")
    table.add_column("Status")
    table.add_column("Rows", justify="right")
    table.add_column("Details", overflow="fold")
    for s in run.log:
        status = s["status"]
        color = {"ok": "green", "error": "red", "warning": "yellow"}.get(status, "white")
        table.add_row(
            s["stage"], s["source"], f"[{color}]{status}[/{color}]",
            str(s["rows"]), s["details"] or s["path"],
        )
    return table


@app.command()
def extract(
    source: str = typer.Argument(..., help="world_bank | bis | imf | cme | all"),
    start_year: int = typer.Option(2000, help="Start year for extraction"),
) -> None:
    """Extract raw data from a source into data/raw/."""
    pipe = _pipeline()
    console.print(f"[bold]Extracting[/bold] {source} from {start_year}…")
    if source == "all":
        infl = pipe.extractor.extract_world_bank_inflation(pipe.countries, start_year)
        rates = pipe.extractor.extract_bis_policy_rates(pipe._bis_ref_areas(), f"{start_year}-01")
        console.print(f"  world_bank -> {infl}")
        console.print(f"  bis        -> {rates}")
    elif source == "world_bank":
        console.print(pipe.extractor.extract_world_bank_inflation(pipe.countries, start_year))
    elif source == "bis":
        console.print(pipe.extractor.extract_bis_policy_rates(pipe._bis_ref_areas(), f"{start_year}-01"))
    elif source == "imf":
        isos = [c["iso3"] for c in pipe.countries if c.get("iso3")]
        console.print(pipe.extractor.extract_imf_fallback("PCPIPCH", isos))
    elif source == "cme":
        console.print(pipe.extractor.extract_cme_futures())
    else:
        console.print(f"[red]Unknown source: {source}[/red]")
        raise typer.Exit(1)
    console.print("[green]✓ extract complete[/green]")


@app.command()
def transform(
    layer: str = typer.Argument("all", help="bronze | silver | gold | all"),
) -> None:
    """Transform raw data through bronze -> silver -> gold."""
    pipe = _pipeline()
    t = pipe.transformer
    infl = pipe.extractor.latest_raw("world_bank", "inflation")
    rates = pipe.extractor.latest_raw("bis", "policy_rates")
    if not infl and not rates:
        console.print("[red]No raw extracts found — run `extract` first.[/red]")
        raise typer.Exit(1)

    infl_bronze = t.bronze_inflation(infl) if infl else None
    rates_bronze = t.bronze_policy_rates(rates) if rates else None
    if infl_bronze is None:
        infl_bronze = pipe.data_path / "bronze" / "inflation.parquet"
        t._empty_bronze().write_parquet(infl_bronze)
    if rates_bronze is None:
        rates_bronze = pipe.data_path / "bronze" / "policy_rates.parquet"
        t._empty_bronze().write_parquet(rates_bronze)
    console.print(f"[green]✓ bronze[/green] {infl_bronze}, {rates_bronze}")

    if layer in ("silver", "gold", "all"):
        silver = t.silver_merge(infl_bronze, rates_bronze)
        console.print(f"[green]✓ silver[/green] {silver}")
        if layer in ("gold", "all"):
            gold = t.build_all_gold(silver)
            for name, p in gold.items():
                console.print(f"[green]✓ gold[/green] {name} -> {p}")


@app.command()
def load(
    target: str = typer.Argument("duckdb", help="duckdb | postgres"),
) -> None:
    """Load gold + silver tables into the database."""
    pipe = _pipeline()
    if target != "duckdb":
        console.print("[yellow]Only duckdb wired in this CLI; use the API for postgres.[/yellow]")
        raise typer.Exit(1)
    run = pipe.rebuild_gold()
    console.print(_manifest_table(run))


@app.command()
def run(
    source: str = typer.Option("all", help="all | world_bank | bis | imf | cme"),
    start_year: int = typer.Option(2000, help="Start year"),
) -> None:
    """Run the full ETL pipeline (extract -> transform -> quality -> load)."""
    pipe = _pipeline()
    console.print(Panel.fit(f"Running ETL · source={source} · from {start_year}", style="bold cyan"))
    run_obj = pipe.run_full(start_year) if source == "all" else pipe.run_source(source, start_year)
    console.print(_manifest_table(run_obj))
    if run_obj.quality:
        n_fail = sum(1 for q in run_obj.quality if not q["passed"] and q["severity"] == "error")
        console.print(f"Quality: {len(run_obj.quality)} checks · {n_fail} failures")


@app.command()
def backfill(
    source: str = typer.Argument(..., help="Source to backfill"),
    start_year: int = typer.Argument(..., help="Start year"),
    end_year: int = typer.Argument(..., help="End year"),
) -> None:
    """Backfill historical data for a source."""
    pipe = _pipeline()
    run_obj = pipe.backfill(source, start_year, end_year)
    console.print(_manifest_table(run_obj))


@app.command("rebuild-gold")
def rebuild_gold() -> None:
    """Rebuild all gold tables from existing silver."""
    pipe = _pipeline()
    run_obj = pipe.rebuild_gold()
    console.print(_manifest_table(run_obj))


@app.command()
def fedwatch() -> None:
    """Run the CME FedWatch probability engine."""
    pipe = _pipeline()
    console.print(Panel.fit("CME FedWatch — Fed Funds Futures probabilities", style="bold cyan"))
    run_obj = pipe.run_cme()
    console.print(_manifest_table(run_obj))

    prob_path = pipe.data_path / "gold" / "fed_probabilities.parquet"
    if prob_path.exists():
        import polars as pl

        df = pl.read_parquet(prob_path)
        table = Table(title="FOMC Meeting Probabilities", expand=True)
        table.add_column("Meeting", style="cyan")
        table.add_column("Cut %", justify="right", style="green")
        table.add_column("Hold %", justify="right")
        table.add_column("Hike %", justify="right", style="red")
        table.add_column("Exp. Rate", justify="right", style="amber" if False else "yellow")
        table.add_column("Move bps", justify="right")
        for r in df.iter_rows(named=True):
            table.add_row(
                str(r["meeting_date"]),
                f"{r['cut_prob'] * 100:.1f}",
                f"{r['hold_prob'] * 100:.1f}",
                f"{r['hike_prob'] * 100:.1f}",
                f"{r['expected_rate']:.2f}",
                f"{r['implied_move_bps']:+.1f}",
            )
        console.print(table)


@app.command()
def status() -> None:
    """Show pipeline status, table counts, and latest run."""
    pipe = _pipeline()
    from macro_data_etl.src.load.loaders import DuckDBLoader

    manifests = sorted((pipe.data_path / "manifest").glob("run_*.json"))
    console.print(f"[bold]Data path:[/bold] {pipe.data_path}")
    console.print(f"[bold]Manifests:[/bold] {len(manifests)}")
    if manifests:
        console.print(f"[bold]Latest run:[/bold] {manifests[-1].name}")

    if Path(pipe.db_path).exists():
        with DuckDBLoader(pipe.db_path) as db:
            counts = db.table_counts()
        table = Table(title="DuckDB tables")
        table.add_column("Table", style="cyan")
        table.add_column("Rows", justify="right")
        for name, n in sorted(counts.items()):
            table.add_row(name, f"{n:,}")
        console.print(table)
    else:
        console.print("[yellow]No DuckDB database yet — run the pipeline first.[/yellow]")


@app.command()
def query(sql: str = typer.Argument(..., help="SQL to run against the macro DuckDB")) -> None:
    """Run a SQL query against the macro database."""
    pipe = _pipeline()
    from macro_data_etl.src.load.loaders import DuckDBLoader

    if not Path(pipe.db_path).exists():
        console.print("[red]No database yet — run the pipeline first.[/red]")
        raise typer.Exit(1)
    with DuckDBLoader(pipe.db_path) as db:
        df = db.query(sql)
    console.print(df)


@app.command()
def export(
    table: str = typer.Argument("country_macro_latest", help="Gold table to export"),
    out: Path = typer.Option(Path("./data/export"), help="Output directory"),
) -> None:
    """Export a gold table to JSON for the terminal data feed."""
    pipe = _pipeline()
    from macro_data_etl.src.load.loaders import DuckDBLoader

    with DuckDBLoader(pipe.db_path) as db:
        path = db.export_json(table, out / f"{table}.json")
    console.print(f"[green]✓ exported[/green] {path}")


if __name__ == "__main__":
    app()
