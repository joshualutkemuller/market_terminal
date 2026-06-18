"""BIS Statistical Data API connector for central bank policy rates."""

from __future__ import annotations

import io
import logging
import time
from datetime import datetime, timezone

import httpx
import polars as pl
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


class BISConfig(BaseModel):
    """Configuration for BIS SDMX-REST API."""

    base_url: str = "https://data.bis.org/api/v2"
    dataset: str = "WS_CBPOL"
    rate_limit_delay: float = 0.5


class BISConnector:
    """Fetches central bank policy rates from BIS SDMX-REST API.

    Dataset: WS_CBPOL (Central Bank Policy Rates)
    Endpoint:
        /data/BIS,WS_CBPOL,1.0/{freq}.{ref_area}
            ?startPeriod={start}&detail=dataonly&format=csv

    The BIS returns CSV with columns like:
        FREQ, REF_AREA, TIME_PERIOD, OBS_VALUE, OBS_STATUS, ...

    freq: M (monthly), D (daily) -- this connector uses M by default.
    ref_area: US, GB, JP, DE, etc. (ISO-2 country codes)
    """

    def __init__(self, config: BISConfig | None = None) -> None:
        self.config = config or BISConfig()
        self._client = httpx.Client(
            timeout=60.0,
            headers={"Accept": "text/csv"},
        )

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> BISConnector:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_url(self, freq: str, ref_area: str, start_period: str) -> str:
        return (
            f"{self.config.base_url}/data/BIS,{self.config.dataset},1.0"
            f"/{freq}.{ref_area}"
            f"?startPeriod={start_period}&detail=dataonly&format=csv"
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def _fetch_csv(self, url: str) -> str:
        """GET the URL and return raw CSV text. Retries on transient errors."""
        logger.debug("BIS request: %s", url)
        resp = self._client.get(url)
        resp.raise_for_status()
        return resp.text

    @staticmethod
    def _parse_csv(csv_text: str) -> pl.DataFrame:
        """Parse BIS CSV text into a Polars DataFrame.

        Expected columns include at minimum:
            FREQ, REF_AREA, TIME_PERIOD, OBS_VALUE

        Additional columns (OBS_STATUS, UNIT_MEASURE, etc.) are kept if present.
        """
        df = pl.read_csv(io.StringIO(csv_text), infer_schema_length=5000)

        # Normalise column names to lower-case for consistency
        rename_map = {c: c.strip().lower() for c in df.columns}
        df = df.rename(rename_map)

        # Ensure obs_value is float (BIS may send it as string)
        if "obs_value" in df.columns:
            df = df.with_columns(pl.col("obs_value").cast(pl.Float64, strict=False))

        return df

    def _add_metadata(self, df: pl.DataFrame) -> pl.DataFrame:
        """Append source and fetched_at columns."""
        return df.with_columns(
            pl.lit("bis").alias("source"),
            pl.lit(datetime.now(timezone.utc).isoformat()).alias("fetched_at"),
        )

    @staticmethod
    def _empty_frame() -> pl.DataFrame:
        return pl.DataFrame(
            schema={
                "freq": pl.Utf8,
                "ref_area": pl.Utf8,
                "time_period": pl.Utf8,
                "obs_value": pl.Float64,
                "source": pl.Utf8,
                "fetched_at": pl.Utf8,
            }
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def fetch_policy_rates(
        self,
        ref_areas: list[str],
        start_period: str = "2000-01",
        freq: str = "M",
    ) -> pl.DataFrame:
        """Fetch policy rates for multiple reference areas (ISO-2 codes).

        Returns DataFrame with columns (lower-cased BIS headers plus metadata):
            freq, ref_area, time_period, obs_value, ..., source, fetched_at
        """
        frames: list[pl.DataFrame] = []

        for area in ref_areas:
            try:
                url = self._build_url(freq, area, start_period)
                csv_text = self._fetch_csv(url)
                if not csv_text.strip():
                    logger.warning("Empty response for ref_area=%s", area)
                    continue
                df = self._parse_csv(csv_text)
                df = self._add_metadata(df)
                frames.append(df)
                logger.info("Fetched %d rows for ref_area=%s", df.height, area)
            except httpx.HTTPStatusError as exc:
                logger.warning(
                    "HTTP %s for ref_area=%s — skipping: %s",
                    exc.response.status_code,
                    area,
                    exc,
                )
            except Exception:
                logger.exception("Failed to fetch ref_area=%s — skipping", area)

            time.sleep(self.config.rate_limit_delay)

        if not frames:
            return self._empty_frame()

        return pl.concat(frames, how="vertical_relaxed")

    def fetch_all_rates(
        self,
        start_period: str = "2000-01",
        freq: str = "M",
    ) -> pl.DataFrame:
        """Fetch all available policy rates (all reference areas).

        Uses a wildcard (empty ref_area) in the SDMX key to request all
        areas in a single call.
        """
        try:
            # BIS SDMX wildcard: omit dimension to get all values
            url = (
                f"{self.config.base_url}/data/BIS,{self.config.dataset},1.0"
                f"/{freq}."
                f"?startPeriod={start_period}&detail=dataonly&format=csv"
            )
            csv_text = self._fetch_csv(url)
            if not csv_text.strip():
                logger.warning("Empty response for all-rates fetch")
                return self._empty_frame()

            df = self._parse_csv(csv_text)
            df = self._add_metadata(df)
            logger.info("Fetched %d rows for all reference areas", df.height)
            return df
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "HTTP %s fetching all rates — falling back to empty frame: %s",
                exc.response.status_code,
                exc,
            )
            return self._empty_frame()
        except Exception:
            logger.exception("Failed to fetch all rates")
            return self._empty_frame()
