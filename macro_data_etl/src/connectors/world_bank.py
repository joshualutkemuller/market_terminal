"""World Bank API connector for Global Inflation Database."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx
import polars as pl
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


class WorldBankConfig(BaseModel):
    """Configuration for World Bank API v2."""

    base_url: str = "https://api.worldbank.org/v2"
    per_page: int = 5000
    format: str = "json"
    rate_limit_delay: float = 0.5


class WorldBankConnector:
    """Fetches inflation data from World Bank API v2.

    Endpoints used:
    - /country/{iso3}/indicator/{indicator}?date={start}:{end}&format=json&per_page=5000

    Key indicators:
    - FP.CPI.TOTL.ZG  -- CPI inflation, annual %
    - FP.CPI.TOTL      -- CPI index (2010=100)
    - NY.GDP.DEFL.KD.ZG -- GDP deflator inflation
    """

    def __init__(self, config: WorldBankConfig | None = None) -> None:
        self.config = config or WorldBankConfig()
        self._client = httpx.Client(
            timeout=30.0,
            headers={"Accept": "application/json"},
        )

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> WorldBankConnector:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_url(
        self,
        country: str,
        indicator: str,
        start_year: int,
        end_year: int,
        page: int = 1,
    ) -> str:
        return (
            f"{self.config.base_url}/country/{country}/indicator/{indicator}"
            f"?date={start_year}:{end_year}"
            f"&format={self.config.format}"
            f"&per_page={self.config.per_page}"
            f"&page={page}"
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def _get_json(self, url: str) -> list | dict:
        """Execute GET and return parsed JSON. Retries on transient errors."""
        resp = self._client.get(url)
        resp.raise_for_status()
        data = resp.json()
        # World Bank returns a JSON array [paging_info, records] on success.
        # On error it may return {"message": [{"id": "...", ...}]}.
        if isinstance(data, dict) and "message" in data:
            msgs = data["message"]
            detail = msgs[0] if isinstance(msgs, list) and msgs else msgs
            raise ValueError(f"World Bank API error: {detail}")
        return data

    @staticmethod
    def _parse_records(raw_records: list[dict]) -> list[dict]:
        """Flatten World Bank observation dicts into row dicts."""
        rows: list[dict] = []
        for rec in raw_records:
            value = rec.get("value")
            rows.append(
                {
                    "country_iso3": rec.get("countryiso3code", ""),
                    "country_iso2": rec.get("country", {}).get("id", ""),
                    "country_name": rec.get("country", {}).get("value", ""),
                    "indicator": rec.get("indicator", {}).get("id", ""),
                    "indicator_name": rec.get("indicator", {}).get("value", ""),
                    "date": rec.get("date", ""),
                    "value": float(value) if value is not None else None,
                    "unit": rec.get("unit", ""),
                    "obs_status": rec.get("obs_status", ""),
                    "decimal": rec.get("decimal"),
                    "source": "world_bank",
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        return rows

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def fetch_indicator(
        self,
        country_iso3: str,
        indicator: str,
        start_year: int = 2000,
        end_year: int | None = None,
    ) -> pl.DataFrame:
        """Fetch a single indicator for a country.

        Returns DataFrame with columns:
            country_iso3, country_iso2, country_name, indicator, indicator_name,
            date, value, unit, obs_status, decimal, source, fetched_at
        """
        if end_year is None:
            end_year = datetime.now(timezone.utc).year

        all_rows: list[dict] = []
        page = 1

        while True:
            url = self._build_url(country_iso3, indicator, start_year, end_year, page)
            logger.debug("WorldBank request: %s", url)

            data = self._get_json(url)

            # data == [paging_info, records | None]
            if not isinstance(data, list) or len(data) < 2:
                logger.warning("Unexpected response shape for %s/%s", country_iso3, indicator)
                break

            paging, records = data[0], data[1]

            if records is None:
                logger.info("No data for %s / %s", country_iso3, indicator)
                break

            all_rows.extend(self._parse_records(records))

            total_pages = int(paging.get("pages", 1))
            if page >= total_pages:
                break
            page += 1
            time.sleep(self.config.rate_limit_delay)

        if not all_rows:
            return pl.DataFrame(
                schema={
                    "country_iso3": pl.Utf8,
                    "country_iso2": pl.Utf8,
                    "country_name": pl.Utf8,
                    "indicator": pl.Utf8,
                    "indicator_name": pl.Utf8,
                    "date": pl.Utf8,
                    "value": pl.Float64,
                    "unit": pl.Utf8,
                    "obs_status": pl.Utf8,
                    "decimal": pl.Int64,
                    "source": pl.Utf8,
                    "fetched_at": pl.Utf8,
                }
            )

        return pl.DataFrame(all_rows)

    def fetch_bulk_inflation(
        self,
        country_codes: list[str],
        start_year: int = 2000,
    ) -> pl.DataFrame:
        """Fetch CPI inflation (FP.CPI.TOTL.ZG) for multiple countries.

        Concatenates per-country results into a single DataFrame.
        Countries that error are logged and skipped.
        """
        indicator = "FP.CPI.TOTL.ZG"
        frames: list[pl.DataFrame] = []

        for iso3 in country_codes:
            try:
                df = self.fetch_indicator(iso3, indicator, start_year=start_year)
                if df.height > 0:
                    frames.append(df)
                logger.info("Fetched %d rows for %s", df.height, iso3)
            except Exception:
                logger.exception("Failed to fetch %s for %s — skipping", indicator, iso3)
            time.sleep(self.config.rate_limit_delay)

        if not frames:
            return self.fetch_indicator("NONE", indicator, start_year=start_year)  # empty schema

        return pl.concat(frames, how="vertical_relaxed")

    def fetch_all_countries(
        self,
        indicator: str = "FP.CPI.TOTL.ZG",
        start_year: int = 2000,
    ) -> pl.DataFrame:
        """Fetch indicator for ALL countries using the 'all' endpoint."""
        return self.fetch_indicator("all", indicator, start_year=start_year)
