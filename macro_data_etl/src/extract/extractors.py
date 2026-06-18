"""Extract layer — calls connectors and writes raw Parquet snapshots.

Each extractor returns the path of the Parquet file it wrote (under
``data/raw/<source>/``). Raw files are timestamped so reruns are non-destructive
and the manifest can point at the exact input that produced a transform.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import polars as pl

from macro_data_etl.src.connectors.bis import BISConnector
from macro_data_etl.src.connectors.cme import CMEConnector
from macro_data_etl.src.connectors.imf import IMFConnector
from macro_data_etl.src.connectors.world_bank import WorldBankConnector
from macro_data_etl.src.utils.logging import get_logger

logger = get_logger(__name__)


def _stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


class Extractor:
    """Coordinates connector calls and persists raw extracts."""

    def __init__(self, data_path: Path | str = Path("./data")) -> None:
        self.data_path = Path(data_path)
        self.raw_path = self.data_path / "raw"
        self.raw_path.mkdir(parents=True, exist_ok=True)

    def _write(self, df: pl.DataFrame, source: str, name: str) -> Path:
        out_dir = self.raw_path / source
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{name}_{_stamp()}.parquet"
        df.write_parquet(path, compression="zstd")
        logger.info("Wrote %d rows -> %s", df.height, path)
        return path

    # ------------------------------------------------------------------
    # World Bank
    # ------------------------------------------------------------------

    def extract_world_bank_inflation(
        self, countries: list[dict], start_year: int = 2000
    ) -> Path:
        """Extract CPI inflation for the configured countries from World Bank."""
        codes: list[str] = []
        indicator = "FP.CPI.TOTL.ZG"
        for c in countries:
            iso3 = c.get("iso3")
            ind = (c.get("inflation") or {}).get("world_bank_indicator", indicator)
            if iso3 and ind == indicator:
                codes.append(iso3)
        logger.info("World Bank inflation: %d countries from %d", len(codes), start_year)

        frames: list[pl.DataFrame] = []
        with WorldBankConnector() as wb:
            if codes:
                frames.append(wb.fetch_bulk_inflation(codes, start_year=start_year))

        df = (
            pl.concat([f for f in frames if f.height], how="vertical_relaxed")
            if any(f.height for f in frames)
            else pl.DataFrame()
        )
        return self._write(df, "world_bank", "inflation")

    def extract_world_bank_indicator(
        self, indicator: str, start_year: int = 2000
    ) -> Path:
        """Extract a single indicator across all countries."""
        with WorldBankConnector() as wb:
            df = wb.fetch_all_countries(indicator=indicator, start_year=start_year)
        return self._write(df, "world_bank", indicator.replace(".", "_"))

    # ------------------------------------------------------------------
    # BIS
    # ------------------------------------------------------------------

    def extract_bis_policy_rates(
        self, ref_areas: list[str], start_period: str = "2000-01"
    ) -> Path:
        """Extract central-bank policy rates from BIS for the given ref areas."""
        logger.info("BIS policy rates: %d areas from %s", len(ref_areas), start_period)
        with BISConnector() as bis:
            df = bis.fetch_policy_rates(ref_areas, start_period=start_period)
        return self._write(df, "bis", "policy_rates")

    # ------------------------------------------------------------------
    # IMF (fallback)
    # ------------------------------------------------------------------

    def extract_imf_fallback(
        self, indicator: str, countries: list[str]
    ) -> Path:
        """Extract IMF data for countries missing from a primary source."""
        logger.info("IMF fallback %s: %d countries", indicator, len(countries))
        with IMFConnector() as imf:
            df = imf.fetch_bulk(indicator, countries)
        return self._write(df, "imf", indicator)

    # ------------------------------------------------------------------
    # CME
    # ------------------------------------------------------------------

    def extract_cme_futures(self, months_ahead: int = 12) -> Path:
        """Extract CME Fed Funds futures quotes."""
        logger.info("CME Fed Funds futures: %d months ahead", months_ahead)
        with CMEConnector() as cme:
            df = cme.fetch_futures_quotes(months_ahead=months_ahead)
        return self._write(df, "cme", "fed_funds_futures")

    # ------------------------------------------------------------------
    # Discovery
    # ------------------------------------------------------------------

    def latest_raw(self, source: str, name: str) -> Path | None:
        """Return the most recent raw Parquet for a source/name, if any."""
        out_dir = self.raw_path / source
        if not out_dir.exists():
            return None
        matches = sorted(out_dir.glob(f"{name}_*.parquet"))
        return matches[-1] if matches else None
