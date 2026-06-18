"""Pipeline orchestration — coordinates extract -> transform -> load + quality.

A :class:`PipelineRun` records every stage to a JSON manifest so a run is fully
auditable. :class:`Pipeline` wires the layers together and exposes the
operations the CLI calls (full run, per-source, backfill, gold rebuild, CME).
"""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path

import yaml

from macro_data_etl.src.analytics.fed_probability import (
    FOMC_CALENDAR_2025_2026,
    FedProbabilityEngine,
)
from macro_data_etl.src.extract.extractors import Extractor
from macro_data_etl.src.load.loaders import DuckDBLoader
from macro_data_etl.src.transform.transformers import Transformer
from macro_data_etl.src.utils.logging import get_logger
from macro_data_etl.src.utils.quality import QualityChecker

logger = get_logger(__name__)

_PKG_ROOT = Path(__file__).resolve().parents[2]  # .../macro_data_etl


class PipelineRun:
    """Tracks a single ETL run and writes a manifest."""

    def __init__(self, run_id: str | None = None, data_path: Path = Path("./data")) -> None:
        self.run_id = run_id or datetime.now().strftime("%Y%m%d_%H%M%S")
        self.data_path = Path(data_path)
        self.manifest_path = self.data_path / "manifest"
        self.manifest_path.mkdir(parents=True, exist_ok=True)
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.log: list[dict] = []
        self.quality: list[dict] = []

    def record(
        self,
        stage: str,
        source: str,
        status: str,
        rows: int = 0,
        path: str = "",
        details: str = "",
    ) -> None:
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "run_id": self.run_id,
            "stage": stage,
            "source": source,
            "status": status,
            "rows": rows,
            "path": str(path),
            "details": details,
        }
        self.log.append(entry)
        logger.info("[%s/%s] %s rows=%d %s", stage, source, status, rows, details)

    def add_quality(self, results: list[dict]) -> None:
        self.quality.extend(results)

    def save_manifest(self) -> Path:
        path = self.manifest_path / f"run_{self.run_id}.json"
        payload = {
            "run_id": self.run_id,
            "started_at": self.started_at,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "stages": self.log,
            "quality": self.quality,
            "status": "FAILED" if any(s["status"] == "error" for s in self.log) else "OK",
        }
        with open(path, "w") as f:
            json.dump(payload, f, indent=2, default=str)
        logger.info("manifest saved -> %s", path)
        return path


class Pipeline:
    """Full ETL pipeline wiring extract/transform/load with quality gates."""

    def __init__(
        self,
        config_path: str | None = None,
        catalog_path: str | None = None,
    ) -> None:
        config_path = config_path or str(_PKG_ROOT / "config" / "settings.yaml")
        catalog_path = catalog_path or str(_PKG_ROOT / "config" / "series_catalog.yaml")
        self.config = self._load_yaml(config_path)
        self.catalog = self._load_yaml(catalog_path)
        base = self.config.get("storage", {}).get("base_path", "./data")
        # Resolve relative storage path against the package root for stability.
        self.data_path = (
            Path(base) if Path(base).is_absolute() else (_PKG_ROOT / base).resolve()
        )
        self.data_path.mkdir(parents=True, exist_ok=True)

        self.extractor = Extractor(self.data_path)
        self.transformer = Transformer(self.data_path, catalog=self.catalog)
        # DuckDB lives alongside the gold parquet under the resolved data path.
        self.db_path = str(self.data_path / "macro.duckdb")

    @staticmethod
    def _load_yaml(path: str) -> dict:
        with open(path) as f:
            return yaml.safe_load(f) or {}

    # ------------------------------------------------------------------
    # Catalog helpers
    # ------------------------------------------------------------------

    @property
    def countries(self) -> list[dict]:
        return self.catalog.get("countries", [])

    def _bis_ref_areas(self) -> list[str]:
        areas: list[str] = []
        for c in self.countries:
            ref = (c.get("policy_rate") or {}).get("bis_ref_area")
            if ref:
                areas.append(ref)
        return sorted(set(areas))

    # ------------------------------------------------------------------
    # Operations
    # ------------------------------------------------------------------

    def run_full(self, start_year: int = 2000) -> PipelineRun:
        """Run the complete ETL: extract all sources -> transform -> quality -> load."""
        run = PipelineRun(data_path=self.data_path)

        # 1. Extract -----------------------------------------------------
        infl_raw = rates_raw = None
        try:
            infl_raw = self.extractor.extract_world_bank_inflation(self.countries, start_year)
            run.record("extract", "world_bank", "ok", path=str(infl_raw))
        except Exception as e:
            run.record("extract", "world_bank", "error", details=str(e))
        try:
            rates_raw = self.extractor.extract_bis_policy_rates(
                self._bis_ref_areas(), f"{start_year}-01"
            )
            run.record("extract", "bis", "ok", path=str(rates_raw))
        except Exception as e:
            run.record("extract", "bis", "error", details=str(e))

        # 2. Transform ---------------------------------------------------
        silver = self._transform_to_silver(run, infl_raw, rates_raw)
        if silver is None:
            run.save_manifest()
            return run

        # 3. Quality + 4. Load ------------------------------------------
        self._quality_and_load(run, silver)
        run.save_manifest()
        return run

    def run_source(self, source: str, start_year: int = 2000) -> PipelineRun:
        """Run ETL for a single source (world_bank | bis | imf | cme)."""
        if source == "cme":
            return self.run_cme()
        run = PipelineRun(data_path=self.data_path)
        infl_raw = rates_raw = None
        try:
            if source == "world_bank":
                infl_raw = self.extractor.extract_world_bank_inflation(self.countries, start_year)
                run.record("extract", source, "ok", path=str(infl_raw))
            elif source == "bis":
                rates_raw = self.extractor.extract_bis_policy_rates(
                    self._bis_ref_areas(), f"{start_year}-01"
                )
                run.record("extract", source, "ok", path=str(rates_raw))
            elif source == "imf":
                isos = [c["iso3"] for c in self.countries if c.get("iso3")]
                imf_raw = self.extractor.extract_imf_fallback("PCPIPCH", isos)
                run.record("extract", source, "ok", path=str(imf_raw))
            else:
                run.record("extract", source, "error", details=f"unknown source {source}")
                run.save_manifest()
                return run
        except Exception as e:
            run.record("extract", source, "error", details=str(e))

        # use whatever already exists for the other source so silver stays complete
        infl_raw = infl_raw or self.extractor.latest_raw("world_bank", "inflation")
        rates_raw = rates_raw or self.extractor.latest_raw("bis", "policy_rates")
        silver = self._transform_to_silver(run, infl_raw, rates_raw)
        if silver is not None:
            self._quality_and_load(run, silver)
        run.save_manifest()
        return run

    def backfill(self, source: str, start_year: int, end_year: int) -> PipelineRun:
        """Backfill historical data for a source over [start_year, end_year]."""
        run = PipelineRun(run_id=f"backfill_{source}_{start_year}_{end_year}", data_path=self.data_path)
        run.record("backfill", source, "ok", details=f"{start_year}-{end_year}")
        sub = self.run_source(source, start_year=start_year)
        run.log.extend(sub.log)
        run.quality.extend(sub.quality)
        run.save_manifest()
        return run

    def rebuild_gold(self) -> PipelineRun:
        """Rebuild all gold tables from existing silver, and reload DuckDB."""
        run = PipelineRun(data_path=self.data_path)
        silver = self.data_path / "silver" / "macro_observations.parquet"
        if not silver.exists():
            run.record("gold", "all", "error", details="no silver table found")
            run.save_manifest()
            return run
        gold = self.transformer.build_all_gold(silver)
        for name, path in gold.items():
            run.record("gold", name, "ok", path=str(path))
        with DuckDBLoader(self.db_path) as db:
            db.load_silver(silver)
            db.load_gold(gold)
        run.record("load", "duckdb", "ok", details=self.db_path)
        run.save_manifest()
        return run

    def run_cme(self) -> PipelineRun:
        """Run the CME FedWatch pipeline: extract futures -> derive probabilities."""
        run = PipelineRun(data_path=self.data_path)
        try:
            raw = self.extractor.extract_cme_futures(months_ahead=15)
            run.record("extract", "cme", "ok", path=str(raw))
        except Exception as e:
            run.record("extract", "cme", "error", details=str(e))
            run.save_manifest()
            return run

        import polars as pl

        df = pl.read_parquet(raw)
        prices: dict[str, float] = {}
        if df.height:
            for r in df.iter_rows(named=True):
                label = self._contract_to_label(r.get("contract_month", ""))
                price = r.get("settle_price") or r.get("last_price")
                if label and price is not None:
                    prices[label] = float(price)

        engine = FedProbabilityEngine()
        meetings = self._upcoming_meetings()
        engine.set_fomc_calendar(meetings)

        prices_source = "cme"
        if not prices:
            # CME blocks non-browser clients; fall back to a deterministic
            # futures curve so downstream tables stay populated (flagged SIM).
            prices = self._fallback_futures_curve(engine, meetings)
            prices_source = "sim"
            run.record(
                "extract", "cme", "warning",
                details="CME unavailable — using deterministic fallback futures curve",
            )

        results = engine.compute_meeting_probabilities(prices)

        gold_dir = self.data_path / "gold"
        gold_dir.mkdir(parents=True, exist_ok=True)
        if results:
            prob_df = engine.to_dataframe(results).with_columns(
                pl.lit(prices_source).alias("price_source")
            )
            prob_path = gold_dir / "fed_probabilities.parquet"
            prob_df.write_parquet(prob_path, compression="zstd")
            run.record(
                "gold", "fed_probabilities",
                "ok" if prices_source == "cme" else "warning",
                rows=prob_df.height, path=str(prob_path),
                details=f"price_source={prices_source}",
            )

            # append vintage snapshot for historical re-pricing tracking
            snap = engine.vintage_snapshot(results)
            vintage_path = gold_dir / "fed_probability_vintages.jsonl"
            with open(vintage_path, "a") as f:
                f.write(json.dumps(snap) + "\n")
            run.record("gold", "fed_probability_vintages", "ok", path=str(vintage_path))

            with DuckDBLoader(self.db_path) as db:
                db.load_gold({"fed_probabilities": prob_path})
        else:
            run.record(
                "gold", "fed_probabilities", "warning",
                details="no futures prices resolved (CME endpoint may be unavailable)",
            )
        run.save_manifest()
        return run

    # ------------------------------------------------------------------
    # Internal stages
    # ------------------------------------------------------------------

    def _transform_to_silver(self, run: PipelineRun, infl_raw, rates_raw):
        import polars as pl

        try:
            infl_bronze = (
                self.transformer.bronze_inflation(Path(infl_raw))
                if infl_raw
                else None
            )
            rates_bronze = (
                self.transformer.bronze_policy_rates(Path(rates_raw))
                if rates_raw
                else None
            )
            if infl_bronze is None and rates_bronze is None:
                run.record("transform", "silver", "error", details="no bronze inputs")
                return None
            # ensure both paths exist (empty frames if a source failed)
            if infl_bronze is None:
                infl_bronze = self.data_path / "bronze" / "inflation.parquet"
                self.transformer._empty_bronze().write_parquet(infl_bronze)
            if rates_bronze is None:
                rates_bronze = self.data_path / "bronze" / "policy_rates.parquet"
                self.transformer._empty_bronze().write_parquet(rates_bronze)

            run.record("transform", "bronze", "ok")
            silver = self.transformer.silver_merge(infl_bronze, rates_bronze)
            n = pl.read_parquet(silver).height
            run.record("transform", "silver", "ok", rows=n, path=str(silver))

            gold = self.transformer.build_all_gold(silver)
            for name, path in gold.items():
                run.record("transform", f"gold:{name}", "ok", path=str(path))
            return silver
        except Exception as e:
            run.record("transform", "silver", "error", details=str(e))
            logger.exception("transform failed")
            return None

    def _quality_and_load(self, run: PipelineRun, silver: Path) -> None:
        import polars as pl

        try:
            df = pl.read_parquet(silver)
            checker = QualityChecker(self.config)
            checker.run_all(df)
            run.add_quality(checker.to_dicts())
            gate = "ok" if checker.passed else "error"
            run.record("quality", "silver", gate, details=f"{len(checker.results)} checks")
        except Exception as e:
            run.record("quality", "silver", "error", details=str(e))

        try:
            gold = {
                "country_macro_latest": self.data_path / "gold" / "country_macro_latest.parquet",
                "inflation_timeseries": self.data_path / "gold" / "inflation_timeseries.parquet",
                "policy_rate_timeseries": self.data_path / "gold" / "policy_rate_timeseries.parquet",
                "real_rates": self.data_path / "gold" / "real_rates.parquet",
                "vintage_snapshots": self.data_path / "gold" / "vintage_snapshots.parquet",
            }
            with DuckDBLoader(self.db_path) as db:
                n = db.load_silver(silver)
                db.load_gold(gold)
            run.record("load", "duckdb", "ok", rows=n, details=self.db_path)
        except Exception as e:
            run.record("load", "duckdb", "error", details=str(e))

    # ------------------------------------------------------------------
    # CME helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _contract_to_label(contract_month: str) -> str:
        """Normalize a CME contract-month string to the engine's "%b%Y" label.

        Accepts forms like "Jul 2026", "Jul2026", "2026-07", "JUL26".
        """
        import calendar
        import re

        s = (contract_month or "").strip()
        if not s:
            return ""
        # already "Jul2026"
        m = re.match(r"^([A-Za-z]{3})\s*(\d{4})$", s)
        if m:
            return f"{m.group(1).title()}{m.group(2)}"
        # "2026-07"
        m = re.match(r"^(\d{4})-(\d{2})$", s)
        if m:
            mon = calendar.month_abbr[int(m.group(2))]
            return f"{mon}{m.group(1)}"
        # "JUL26"
        m = re.match(r"^([A-Za-z]{3})(\d{2})$", s)
        if m:
            return f"{m.group(1).title()}20{m.group(2)}"
        return s

    @staticmethod
    def _upcoming_meetings() -> list[date]:
        today = date.today()
        upcoming = [m for m in FOMC_CALENDAR_2025_2026 if m >= today]
        return upcoming or FOMC_CALENDAR_2025_2026[-4:]

    @staticmethod
    def _fallback_futures_curve(
        engine: FedProbabilityEngine, meetings: list[date]
    ) -> dict[str, float]:
        """Deterministic Fed Funds futures curve for when CME is unavailable.

        Models a gentle easing path (~10bp implied per meeting) anchored at the
        current effective rate, then prices each relevant contract month as
        ``100 - implied_rate``. Used only to keep gold tables populated; the
        gold ``price_source`` column flags these rows as ``sim``.
        """
        import calendar

        rate = engine.effective_rate
        per_meeting_cut = 0.10  # 10bp expected easing per meeting
        # Build the implied month-average rate for each contract month spanned.
        month_rate: dict[str, float] = {}
        cur = rate
        # seed the months around each meeting
        for mtg in meetings:
            cur = max(2.0, cur - per_meeting_cut)
            for lbl in (mtg.strftime("%b%Y"), engine._next_month_label(mtg)):
                month_rate.setdefault(lbl, cur)
        return {lbl: round(100.0 - r, 4) for lbl, r in month_rate.items()}
