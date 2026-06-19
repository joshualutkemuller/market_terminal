"""Ingestion orchestration — extract → archive → normalize → quality → load.

Idempotent and revision-aware: raw frames are archived to Parquet (immutable
history) and upserted to DuckDB on natural keys, so reruns never duplicate.
Sources are chosen per settings: FRED for macro (falls back to synthetic when no
key / offline), Yahoo for market (falls back to synthetic). Analytics gold
tables are rebuilt from the normalized layer at the end of a run.
"""

from __future__ import annotations

import json
import math
import uuid
from datetime import date, datetime, timezone

import polars as pl

from market_data_pipeline.src import analytics
from market_data_pipeline.src.config.catalog import get_catalog
from market_data_pipeline.src.config.settings import get_settings
from market_data_pipeline.src.connectors import (
    FredConnector,
    SyntheticConnector,
    YahooConnector,
    fred_enabled,
)
from market_data_pipeline.src.ingestion.manifest import ManifestWriter
from market_data_pipeline.src.quality.checks import QualityChecker
from market_data_pipeline.src.storage.duckdb_store import DuckDBStore
from market_data_pipeline.src.storage.parquet_archive import ParquetArchive
from market_data_pipeline.src.transforms.normalize import normalize_macro, normalize_market


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _json_clean(obj):
    """Recursively coerce NaN/Inf → None so payloads are valid JSON."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _json_clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_clean(v) for v in obj]
    return obj


def _extract_asof(payload: dict) -> date | None:
    """Best-effort as-of date from a view payload."""
    val = payload.get("asof")
    if not val and isinstance(payload.get("cards"), list) and payload["cards"]:
        val = payload["cards"][0].get("asof")
    try:
        return date.fromisoformat(str(val)[:10]) if val else None
    except ValueError:
        return None


class Pipeline:
    def __init__(self, store: DuckDBStore | None = None) -> None:
        self.settings = get_settings()
        self.catalog = get_catalog()
        self.store = store or DuckDBStore(self.settings.duckdb_path)
        self.archive = ParquetArchive(self.settings.data_dir)
        self.manifest = ManifestWriter(self.store)
        self._sync_masters()

    # ------------------------------------------------------------------
    # Master/reference tables
    # ------------------------------------------------------------------

    def _sync_masters(self) -> None:
        assets = pl.DataFrame([
            {
                "series_id": a.series_id, "vendor_symbol": a.vendor_symbol,
                "display_name": a.display_name, "asset_class": a.asset_class,
                "sub_class": a.sub_class, "unit": a.unit, "currency": a.currency,
                "source": a.source, "frequency": a.frequency,
            }
            for a in self.catalog.assets
        ])
        macro = pl.DataFrame([
            {
                "series_id": m.series_id, "fred_id": m.fred_id, "display_name": m.display_name,
                "asset_class": m.asset_class, "category": m.category, "unit": m.unit,
                "fred_units": m.fred_units, "frequency": m.frequency, "tenor": m.tenor,
                "source": m.source,
            }
            for m in self.catalog.macro
        ])
        self.store.replace_table("asset_master", assets)
        self.store.replace_table("macro_series_master", macro)

    # ------------------------------------------------------------------
    # Source selection
    # ------------------------------------------------------------------

    def _macro_connector(self):
        if self.settings.offline or not fred_enabled():
            return SyntheticConnector()
        return FredConnector(cache_ttl_hours=self.settings.macro_cache_ttl_h)

    def _market_connector(self):
        if self.settings.offline or not self.settings.allow_yahoo:
            return SyntheticConnector()
        return YahooConnector(
            cache_ttl_hours=self.settings.market_cache_ttl_h,
            rate_limit=self.settings.yahoo_rate_limit,
        )

    # ------------------------------------------------------------------
    # Extraction
    # ------------------------------------------------------------------

    def ingest_macro(self, run_id: str, start: date | None = None) -> pl.DataFrame:
        conn = self._macro_connector()
        synth = SyntheticConnector()
        frames = []
        for m in self.catalog.macro:
            res = conn.fetch_series(m.fred_id, start)
            if res.rows.is_empty() and not isinstance(conn, SyntheticConnector):
                # graceful per-series fallback to synthetic
                res = synth.fetch_series(m.fred_id, start)
            self.manifest.record_result(run_id, res)
            if not res.rows.is_empty():
                frames.append(res.rows)
        if not frames:
            return pl.DataFrame()
        raw = pl.concat(frames, how="vertical_relaxed")
        self.archive.write(raw, "raw", "macro_observations", raw["source"][0], run_id)
        self._load_raw_macro(raw, run_id)
        return normalize_macro(raw, run_id, self.catalog)

    def ingest_market(self, run_id: str, start: date | None = None) -> pl.DataFrame:
        conn = self._market_connector()
        symbols = self.catalog.asset_symbols
        res = conn.fetch_history(symbols, start)
        if res.rows.is_empty() and not isinstance(conn, SyntheticConnector):
            res = SyntheticConnector().fetch_history(symbols, start)
        self.manifest.record_result(run_id, res)
        raw = res.rows
        if raw.is_empty():
            return pl.DataFrame()
        self.archive.write(raw, "raw", "market_prices", raw["source"][0], run_id)
        self._load_raw_market(raw, run_id)
        return normalize_market(raw, run_id, self.catalog)

    # ------------------------------------------------------------------
    # Raw loads
    # ------------------------------------------------------------------

    def _load_raw_market(self, raw: pl.DataFrame, run_id: str) -> None:
        df = raw.with_columns(
            pl.lit(run_id).alias("ingestion_run_id"), pl.lit(_now()).alias("ingested_at")
        )
        self.store.upsert("raw_market_prices", df, ["vendor_symbol", "date", "source"])

    def _load_raw_macro(self, raw: pl.DataFrame, run_id: str) -> None:
        df = raw.with_columns(
            pl.lit(run_id).alias("ingestion_run_id"), pl.lit(_now()).alias("ingested_at")
        )
        if "realtime_start" not in df.columns:
            df = df.with_columns(pl.lit(None, dtype=pl.Date).alias("realtime_start"))
        else:
            df = df.with_columns(pl.col("realtime_start").fill_null(date(1900, 1, 1)))
        if "realtime_end" not in df.columns:
            df = df.with_columns(pl.lit(None, dtype=pl.Date).alias("realtime_end"))
        self.store.upsert(
            "raw_macro_observations", df, ["series_id", "date", "source", "realtime_start"]
        )

    # ------------------------------------------------------------------
    # Full run
    # ------------------------------------------------------------------

    def run(self, start: date | None = None, run_id: str | None = None) -> dict:
        run_id = run_id or f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        macro_norm = self.ingest_macro(run_id, start)
        market_norm = self.ingest_market(run_id, start)
        normalized = pl.concat(
            [f for f in (macro_norm, market_norm) if not f.is_empty()], how="vertical_relaxed"
        ) if (not macro_norm.is_empty() or not market_norm.is_empty()) else pl.DataFrame()

        # archive + load normalized
        if not normalized.is_empty():
            self.archive.write(normalized, "silver", "normalized", "ALL", run_id)
            self.store.upsert(
                "normalized_time_series", normalized, ["series_id", "date", "source"]
            )

        # quality
        qc = QualityChecker(
            abnormal_move_pct=self.settings.abnormal_move_pct,
            stale_days_daily=self.settings.stale_days_daily,
            stale_days_monthly=self.settings.stale_days_monthly,
        )
        expected = [a.series_id for a in self.catalog.assets] + [m.series_id for m in self.catalog.macro]
        qc.run_all(normalized, expected_series=expected)
        qframe = qc.to_frame(run_id)
        if not qframe.is_empty():
            self.store.append("data_quality_results", qframe)

        # gold analytics
        self.build_analytics(run_id, normalized)

        return {
            "run_id": run_id,
            "normalized_rows": normalized.height,
            "macro_rows": macro_norm.height,
            "market_rows": market_norm.height,
            "quality": qc.summary(),
        }

    # ------------------------------------------------------------------
    # Gold analytics rebuild
    # ------------------------------------------------------------------

    def build_analytics(self, run_id: str, normalized: pl.DataFrame | None = None) -> None:
        df = normalized if normalized is not None and not normalized.is_empty() else self.store.normalized()
        if df.is_empty():
            return
        prices = df.filter(pl.col("asset_class").is_in(
            ["EQUITY", "BOND", "COMMODITY", "CREDIT", "VOLATILITY", "CURRENCY"]
        ))
        macro = df.filter(pl.col("asset_class").str.starts_with("MACRO"))

        # market snapshot
        snap = analytics.market_snapshot(prices)
        self.store.replace_table("analytics_market_snapshot", _cards_to_frame(snap, run_id))

        # cross-asset
        ca = analytics.cross_asset_dashboard(prices)
        ca_rows = []
        for bucket, items in ca.items():
            if bucket == "asof":
                continue
            for it in items:
                ca_rows.append({"bucket": bucket, **it})
        self.store.replace_table("analytics_cross_asset_returns", _cards_to_frame(ca_rows, run_id))

        # drawdowns
        dd = analytics.drawdown_table(prices)
        self.store.replace_table("analytics_drawdowns", _cards_to_frame(dd, run_id))

        # rates
        rates = analytics.rates_dashboard(macro)
        self.store.replace_table("analytics_rate_dashboard", _cards_to_frame(rates.get("changes", []), run_id))

        # inflation
        infl = analytics.inflation_dashboard(macro)
        self.store.replace_table("analytics_inflation_dashboard", _cards_to_frame(infl, run_id))

        # serving table — full JSON payloads the UI can read straight from the DB
        self.materialize_api_views(run_id, prices=prices, macro=macro)

    # ------------------------------------------------------------------
    # Serving views (read directly by the terminal — DB or file)
    # ------------------------------------------------------------------

    def build_api_views(
        self, prices: pl.DataFrame, macro: pl.DataFrame
    ) -> dict[str, dict]:
        """Build the 6 terminal view payloads (identical to the FastAPI shapes)."""
        ca = analytics.cross_asset_dashboard(prices)
        return _json_clean({
            "market": {"cards": analytics.market_snapshot(prices)},
            "cross-asset": ca,
            "rates": analytics.rates_dashboard(macro),
            "inflation": {"cards": analytics.inflation_dashboard(macro)},
            "regime": analytics.regime_dashboard(prices, macro),
            "bilello": {
                "best_worst_ytd": analytics.best_worst_ytd(prices),
                "asset_class_returns_by_year": analytics.asset_class_returns_by_year(prices),
                "current_drawdowns": analytics.current_drawdowns(prices),
                "rate_moves_ranked": analytics.rate_moves_ranked(macro),
                "inflation_vs_policy_gap": analytics.inflation_vs_policy_gap(macro),
                "unemployment_vs_longrun": analytics.unemployment_vs_longrun(macro),
            },
        })

    def materialize_api_views(
        self,
        run_id: str,
        prices: pl.DataFrame | None = None,
        macro: pl.DataFrame | None = None,
    ) -> dict[str, dict]:
        """Compute and upsert all terminal views into ``analytics_api_views``.

        The terminal can then read a single table (``SELECT payload_json FROM
        analytics_api_views WHERE view = ?``) from the DuckDB/Postgres file
        instead of calling the FastAPI service.
        """
        if prices is None or macro is None:
            df = self.store.normalized()
            prices = df.filter(pl.col("asset_class").is_in(
                ["EQUITY", "BOND", "COMMODITY", "CREDIT", "VOLATILITY", "CURRENCY"]))
            macro = df.filter(pl.col("asset_class").str.starts_with("MACRO"))
        views = self.build_api_views(prices, macro)
        now = _now()
        rows = []
        for view, payload in views.items():
            asof = _extract_asof(payload)
            rows.append({
                "view": view,
                "payload_json": json.dumps(payload, default=str),
                "as_of": asof,
                "ingestion_run_id": run_id,
                "updated_at": now,
            })
        frame = pl.DataFrame(rows, schema_overrides={"as_of": pl.Date})
        self.store.upsert("analytics_api_views", frame, ["view"])
        return views

    def export_api_views(self, out_dir, run_id: str = "export") -> list:
        """Write the 6 view payloads as JSON files (for the file-cache path).

        Filenames match the terminal's committed snapshot so MARKET_DATA_DIR can
        point straight at the output dir.
        """
        from pathlib import Path

        out = Path(out_dir)
        out.mkdir(parents=True, exist_ok=True)
        df = self.store.normalized()
        prices = df.filter(pl.col("asset_class").is_in(
            ["EQUITY", "BOND", "COMMODITY", "CREDIT", "VOLATILITY", "CURRENCY"]))
        macro = df.filter(pl.col("asset_class").str.starts_with("MACRO"))
        views = self.build_api_views(prices, macro)
        name_map = {
            "market": "market_snapshot", "cross-asset": "cross_asset", "rates": "rates",
            "inflation": "inflation", "regime": "regime", "bilello": "bilello",
        }
        written = []
        for view, payload in views.items():
            path = out / f"{name_map[view]}.json"
            path.write_text(json.dumps(payload, default=str))
            written.append(path)
        return written


def _cards_to_frame(cards: list[dict], run_id: str) -> pl.DataFrame:
    """Convert analytics card dicts → a frame for analytics tables.

    Renames the JSON ``asof`` key to the DB column ``as_of`` and stamps run id.
    """
    if not cards:
        return pl.DataFrame()
    rows = []
    for c in cards:
        r = dict(c)
        if "asof" in r:
            r["as_of"] = r.pop("asof")
        r["ingestion_run_id"] = run_id
        rows.append(r)
    return pl.DataFrame(rows, infer_schema_length=None)
