"""IMF Data Mapper API connector -- fallback for World Bank / BIS gaps."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

import httpx
import polars as pl
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

from macro_data_etl.src.connectors.http import FallbackHTTPClient

logger = logging.getLogger(__name__)


class IMFConfig(BaseModel):
    """Configuration for IMF DataMapper API."""

    base_url: str = "https://www.imf.org/external/datamapper/api/v1"
    rate_limit_delay: float = 0.5


class IMFConnector:
    """Fetches from IMF DataMapper API.

    Endpoint: /external/datamapper/api/v1/{indicator}/{iso3}
    Returns JSON with yearly values keyed by country ISO-3.

    Key indicators:
    - PCPIPCH   -- CPI inflation rate (annual % change)
    - NGDP_RPCH -- Real GDP growth (annual % change)
    - GGXWDG_NGDP -- General government gross debt (% of GDP)
    """

    def __init__(self, config: IMFConfig | None = None) -> None:
        self.config = config or IMFConfig()
        self._client = FallbackHTTPClient(
            timeout=30.0,
            headers={"Accept": "application/json"},
        )

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> IMFConnector:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def _get_json(self, url: str) -> dict:
        """Execute GET and return parsed JSON. Retries on transient errors."""
        logger.debug("IMF request: %s", url)
        resp = self._client.get(url)
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def _parse_indicator_response(
        data: dict,
        indicator: str,
    ) -> list[dict]:
        """Parse the IMF DataMapper JSON into a flat list of row dicts.

        The response structure for ``/indicator/ISO3`` is::

            {
              "values": {
                "INDICATOR": {
                  "ISO3": {"1980": 12.3, "1981": 11.0, ...}
                }
              }
            }

        When fetched without a country key the ``ISO3`` level contains *all*
        countries.
        """
        rows: list[dict] = []
        values_block = data.get("values", {}).get(indicator, {})

        for country_iso3, yearly in values_block.items():
            if not isinstance(yearly, dict):
                continue
            for year, value in yearly.items():
                rows.append(
                    {
                        "country_iso3": country_iso3,
                        "indicator": indicator,
                        "date": str(year),
                        "value": float(value) if value is not None else None,
                        "source": "imf",
                        "fetched_at": datetime.now(timezone.utc).isoformat(),
                    }
                )

        return rows

    @staticmethod
    def _empty_frame() -> pl.DataFrame:
        return pl.DataFrame(
            schema={
                "country_iso3": pl.Utf8,
                "indicator": pl.Utf8,
                "date": pl.Utf8,
                "value": pl.Float64,
                "source": pl.Utf8,
                "fetched_at": pl.Utf8,
            }
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=10))
    def fetch_indicator(
        self,
        indicator: str,
        country_iso3: str,
    ) -> pl.DataFrame:
        """Fetch a single indicator for a single country.

        Returns DataFrame with columns:
            country_iso3, indicator, date, value, source, fetched_at
        """
        url = f"{self.config.base_url}/{indicator}/{country_iso3}"
        data = self._get_json(url)
        rows = self._parse_indicator_response(data, indicator)

        if not rows:
            logger.info("No data returned for %s / %s", indicator, country_iso3)
            return self._empty_frame()

        return pl.DataFrame(rows)

    def fetch_bulk(
        self,
        indicator: str,
        countries: list[str],
    ) -> pl.DataFrame:
        """Fetch an indicator for multiple countries.

        Makes one request per country, concatenates results.
        Countries that error are logged and skipped.
        """
        frames: list[pl.DataFrame] = []

        for iso3 in countries:
            try:
                df = self.fetch_indicator(indicator, iso3)
                if df.height > 0:
                    frames.append(df)
                logger.info("Fetched %d rows for %s / %s", df.height, indicator, iso3)
            except Exception:
                logger.exception("Failed to fetch %s / %s — skipping", indicator, iso3)
            time.sleep(self.config.rate_limit_delay)

        if not frames:
            return self._empty_frame()

        return pl.concat(frames, how="vertical_relaxed")

    def fetch_all_countries(
        self,
        indicator: str = "PCPIPCH",
    ) -> pl.DataFrame:
        """Fetch an indicator for all countries in one request.

        The IMF API supports omitting the country to retrieve all at once.
        """
        url = f"{self.config.base_url}/{indicator}"
        try:
            data = self._get_json(url)
            rows = self._parse_indicator_response(data, indicator)
            if not rows:
                logger.info("No data for indicator %s (all countries)", indicator)
                return self._empty_frame()
            df = pl.DataFrame(rows)
            logger.info("Fetched %d rows for %s (all countries)", df.height, indicator)
            return df
        except Exception:
            logger.exception("Failed to fetch all countries for %s", indicator)
            return self._empty_frame()
