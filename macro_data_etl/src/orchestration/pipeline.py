"""Pipeline orchestration — coordinates extract -> transform -> load + quality.

A :class:`PipelineRun` records every stage to a JSON manifest so a run is fully
auditable. :class:`Pipeline` wires the layers together and exposes the
operations the CLI calls (full run, per-source, backfill, gold rebuild, CME).
"""

from __future__ import annotations

import json
import calendar
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

        engine = self._fed_probability_engine()
        meetings = self._upcoming_meetings()
        engine.set_fomc_calendar(meetings)

        prices_source = "cme"
        source_detail = "CME 30-Day Fed Funds futures settlements"
        model_inputs: dict[str, object] = {}
        if not prices:
            # CME blocks non-browser clients; fall back to a FRED-informed
            # short-rate model before using the purely deterministic curve.
            prices, model_inputs = self._fred_model_futures_curve(engine, meetings)
            prices_source = "fred_model" if prices else "sim"
            source_detail = (
                "FRED model: EFFR/FEDFUNDS spot anchor plus DGS3MO, DGS6MO, "
                "and DGS1 short-rate proxies"
                if prices_source == "fred_model"
                else "deterministic fallback futures curve"
            )
            if not prices:
                prices = self._fallback_futures_curve(engine, meetings)
            run.record(
                "extract", "cme", "warning",
                details=f"CME unavailable — using {prices_source}",
            )

        results = engine.compute_meeting_probabilities(prices)

        gold_dir = self.data_path / "gold"
        gold_dir.mkdir(parents=True, exist_ok=True)
        if results:
            prob_df = engine.to_dataframe(results).with_columns(
                pl.lit(prices_source).alias("price_source"),
                pl.lit(source_detail).alias("source_detail"),
                pl.lit(json.dumps(model_inputs, sort_keys=True)).alias("model_inputs_json"),
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
    def _latest_snapshot_value(snapshot: dict, series_id: str) -> tuple[float | None, str | None]:
        series = (snapshot.get("series") or {}).get(series_id) or {}
        observations = series.get("observations") or []
        for obs in reversed(observations):
            value = obs.get("value")
            if isinstance(value, (int, float)):
                return float(value), obs.get("date") or series.get("asOf")
        return None, series.get("asOf")

    def _fred_probability_inputs(self) -> tuple[dict[str, float], dict[str, str], str | None]:
        """Read committed FRED snapshot inputs used by the FedWatch model fallback."""
        snapshot_path = _PKG_ROOT.parent / "src" / "data" / "econSnapshot.json"
        try:
            with open(snapshot_path) as f:
                snapshot = json.load(f)
        except FileNotFoundError:
            return {}, {}, None

        values: dict[str, float] = {}
        dates: dict[str, str] = {}
        for series_id in ("EFFR", "FEDFUNDS", "DFEDTARL", "DFEDTARU", "IORB", "DGS3MO", "DGS6MO", "DGS1"):
            value, as_of = self._latest_snapshot_value(snapshot, series_id)
            if value is not None:
                values[series_id] = value
            if as_of:
                dates[series_id] = as_of

        generated_at = snapshot.get("generatedAt")
        return values, dates, generated_at

    def _fed_probability_engine(self) -> FedProbabilityEngine:
        """Build the Fed probability engine, anchored to FRED target range when available."""
        values, _, _ = self._fred_probability_inputs()
        low = values.get("DFEDTARL", 4.00)
        high = values.get("DFEDTARU", 4.25)
        engine = FedProbabilityEngine(low, high)
        if "EFFR" in values:
            engine.effective_rate = values["EFFR"]
        elif "FEDFUNDS" in values:
            engine.effective_rate = values["FEDFUNDS"]
        elif "IORB" in values:
            engine.effective_rate = values["IORB"] - 0.02
        return engine

    def _fred_model_futures_curve(
        self, engine: FedProbabilityEngine, meetings: list[date]
    ) -> tuple[dict[str, float], dict[str, object]]:
        """Build a FRED-informed synthetic Fed Funds futures curve.

        This is not CME FedWatch. It uses the committed FRED snapshot as a free
        model fallback: EFFR/FEDFUNDS anchors the spot effective rate, while
        3M/6M/1Y Treasury rates proxy the short-rate path. The Treasury-rate gap
        is partially passed through to expected effective fed funds to avoid
        treating bill/UST liquidity and term premia as one-for-one policy odds.
        """
        values, dates, generated_at = self._fred_probability_inputs()
        spot = values.get("EFFR") or values.get("FEDFUNDS") or engine.effective_rate
        curve_points = {
            0.0: spot,
            3.0: values.get("DGS3MO"),
            6.0: values.get("DGS6MO"),
            12.0: values.get("DGS1"),
        }
        usable = {m: v for m, v in curve_points.items() if isinstance(v, (int, float))}
        if len(usable) < 3:
            return {}, {"reason": "missing FRED spot/short-rate inputs", "available_inputs": sorted(values)}

        def proxy_rate(months_out: float) -> float:
            pts = sorted(usable.items())
            if months_out <= pts[0][0]:
                return pts[0][1]
            for (m0, r0), (m1, r1) in zip(pts, pts[1:]):
                if m0 <= months_out <= m1:
                    w = (months_out - m0) / (m1 - m0)
                    return r0 + (r1 - r0) * w
            return pts[-1][1]

        # Pass-through dampens Treasury bill/UST term and liquidity premia.
        pass_through = 0.65
        today = date.today()
        rate_before = spot
        month_avg_rates: dict[str, float] = {}

        for mtg in sorted(meetings):
            months_out = max(0.0, (mtg - today).days / 30.4375)
            proxy = proxy_rate(months_out)
            rate_after = round(spot + (proxy - spot) * pass_through, 4)

            days_in_month = calendar.monthrange(mtg.year, mtg.month)[1]
            days_after = days_in_month - mtg.day
            current_label = mtg.strftime("%b%Y")
            next_label = engine._next_month_label(mtg)
            month_avg = (
                (mtg.day * rate_before + days_after * rate_after) / days_in_month
                if days_after > 0
                else rate_after
            )
            month_avg_rates[current_label] = month_avg
            month_avg_rates.setdefault(next_label, rate_after)
            rate_before = rate_after

        inputs = {
            "method": "FRED short-rate model",
            "generated_at": generated_at,
            "series_as_of": dates,
            "spot_effective_rate": spot,
            "target_low": values.get("DFEDTARL"),
            "target_high": values.get("DFEDTARU"),
            "short_rate_proxies": {k: values.get(k) for k in ("DGS3MO", "DGS6MO", "DGS1")},
            "pass_through": pass_through,
            "note": "Not CME FedWatch; Treasury short-rate proxies are converted into a modeled effective-rate path.",
        }
        return {lbl: round(100.0 - rate, 4) for lbl, rate in month_avg_rates.items()}, inputs

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
