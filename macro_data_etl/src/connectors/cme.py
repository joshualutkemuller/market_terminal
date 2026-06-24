"""CME Group connector for Fed Funds Futures quotes.

NOTE: CME's public API has rate limits and may require scraping fallbacks.
This connector attempts the public JSON endpoints first.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

import httpx
import polars as pl
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential

from macro_data_etl.src.connectors.http import FallbackHTTPClient

logger = logging.getLogger(__name__)


class CMEConfig(BaseModel):
    """Configuration for CME public endpoints."""

    # CME Group public delayed-quotes endpoint
    quotes_url: str = "https://www.cmegroup.com/CmeWS/mvc/Quotes/Future/305/G"
    # CME Group settlement prices endpoint
    settlements_url: str = (
        "https://www.cmegroup.com/CmeWS/mvc/Settlements/Futures/Settlements/305/FUT"
    )
    rate_limit_delay: float = 1.0
    # Product code for 30-Day Federal Funds Futures
    product_id: int = 305


class CMEConnector:
    """Fetches 30-Day Federal Funds Futures quotes from CME.

    Product ID 305 = 30-Day Federal Funds Futures
    Each contract month settles at 100 - average effective fed funds rate.

    From the settlement price, implied rate = 100 - settlement_price.
    """

    def __init__(self, config: CMEConfig | None = None) -> None:
        self.config = config or CMEConfig()
        self._client = FallbackHTTPClient(
            timeout=30.0,
            headers={
                "Accept": "application/json",
                "User-Agent": (
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
                ),
            },
            follow_redirects=True,
        )

    def close(self) -> None:
        """Close the underlying HTTP client."""
        self._client.close()

    def __enter__(self) -> CMEConnector:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=2, max=15))
    def _get_json(self, url: str) -> Any:
        """Execute GET and return parsed JSON. Retries on transient errors."""
        logger.debug("CME request: %s", url)
        resp = self._client.get(url)
        resp.raise_for_status()
        return resp.json()

    @staticmethod
    def _safe_float(value: Any) -> float | None:
        """Convert a value to float, returning None on failure."""
        if value is None or value == "" or value == "-":
            return None
        try:
            # CME sometimes uses tick notation like "95'16" for treasuries,
            # but Fed Funds uses decimal. Strip any commas.
            cleaned = str(value).replace(",", "")
            return float(cleaned)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _empty_quotes_frame() -> pl.DataFrame:
        return pl.DataFrame(
            schema={
                "contract_month": pl.Utf8,
                "expiration_date": pl.Utf8,
                "last_price": pl.Float64,
                "settle_price": pl.Float64,
                "implied_rate": pl.Float64,
                "change": pl.Float64,
                "volume": pl.Int64,
                "open_interest": pl.Int64,
                "source": pl.Utf8,
                "fetched_at": pl.Utf8,
            }
        )

    @staticmethod
    def _empty_settlements_frame() -> pl.DataFrame:
        return pl.DataFrame(
            schema={
                "contract_month": pl.Utf8,
                "settle_price": pl.Float64,
                "implied_rate": pl.Float64,
                "volume": pl.Int64,
                "open_interest": pl.Int64,
                "source": pl.Utf8,
                "fetched_at": pl.Utf8,
            }
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def fetch_futures_quotes(self, months_ahead: int = 12) -> pl.DataFrame:
        """Fetch current futures quotes for upcoming contract months.

        Parameters
        ----------
        months_ahead:
            Maximum number of contract months to return (front months first).

        Returns DataFrame with columns:
            contract_month, expiration_date, last_price, settle_price,
            implied_rate, change, volume, open_interest, source, fetched_at
        """
        try:
            data = self._get_json(self.config.quotes_url)
        except httpx.HTTPStatusError as exc:
            logger.warning("HTTP %s fetching CME quotes: %s", exc.response.status_code, exc)
            return self._empty_quotes_frame()
        except Exception:
            logger.exception("Failed to fetch CME futures quotes")
            return self._empty_quotes_frame()

        time.sleep(self.config.rate_limit_delay)

        # CME quotes endpoint returns a dict with a "quotes" list (or similar).
        # The exact key varies; handle the common structures.
        quotes_list: list[dict] = []
        if isinstance(data, dict):
            quotes_list = data.get("quotes", data.get("Quotes", []))
            # Some endpoints nest under "tradeDate" -> list
            if not quotes_list and isinstance(data, dict):
                for _key, val in data.items():
                    if isinstance(val, list) and val:
                        quotes_list = val
                        break
        elif isinstance(data, list):
            quotes_list = data

        if not quotes_list:
            logger.warning("No quotes found in CME response")
            return self._empty_quotes_frame()

        fetched_at = datetime.now(timezone.utc).isoformat()
        rows: list[dict] = []

        for q in quotes_list[:months_ahead]:
            settle = self._safe_float(
                q.get("settle", q.get("priorSettle", q.get("last")))
            )
            last = self._safe_float(q.get("last", q.get("priorSettle")))
            implied = round(100.0 - settle, 4) if settle is not None else None

            volume_raw = q.get("volume", q.get("totalVolume"))
            oi_raw = q.get("openInterest", q.get("openInt"))

            rows.append(
                {
                    "contract_month": q.get("expirationMonth", q.get("monthYear", "")),
                    "expiration_date": q.get("expirationDate", q.get("lastTradeDate", "")),
                    "last_price": last,
                    "settle_price": settle,
                    "implied_rate": implied,
                    "change": self._safe_float(q.get("change", q.get("priorChange"))),
                    "volume": int(volume_raw) if volume_raw not in (None, "", "-") else None,
                    "open_interest": int(oi_raw) if oi_raw not in (None, "", "-") else None,
                    "source": "cme",
                    "fetched_at": fetched_at,
                }
            )

        if not rows:
            return self._empty_quotes_frame()

        return pl.DataFrame(rows)

    def fetch_settlement_prices(self) -> pl.DataFrame:
        """Fetch daily settlement prices for all listed Fed Funds Futures contracts.

        Returns DataFrame with columns:
            contract_month, settle_price, implied_rate, volume,
            open_interest, source, fetched_at
        """
        try:
            data = self._get_json(self.config.settlements_url)
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "HTTP %s fetching CME settlements: %s",
                exc.response.status_code,
                exc,
            )
            return self._empty_settlements_frame()
        except Exception:
            logger.exception("Failed to fetch CME settlement prices")
            return self._empty_settlements_frame()

        time.sleep(self.config.rate_limit_delay)

        # Settlement endpoint usually returns {"settlements": [...]}
        settlements_list: list[dict] = []
        if isinstance(data, dict):
            settlements_list = data.get("settlements", data.get("Settlements", []))
            if not settlements_list:
                for _key, val in data.items():
                    if isinstance(val, list) and val:
                        settlements_list = val
                        break
        elif isinstance(data, list):
            settlements_list = data

        if not settlements_list:
            logger.warning("No settlements found in CME response")
            return self._empty_settlements_frame()

        fetched_at = datetime.now(timezone.utc).isoformat()
        rows: list[dict] = []

        for s in settlements_list:
            # Skip total/summary rows
            month = s.get("month", s.get("contractMonth", s.get("monthYear", "")))
            if not month or month.upper() in ("TOTAL", "COMBINED"):
                continue

            settle = self._safe_float(s.get("settle", s.get("settlement")))
            implied = round(100.0 - settle, 4) if settle is not None else None

            volume_raw = s.get("volume", s.get("totalVolume"))
            oi_raw = s.get("openInterest", s.get("openInt"))

            rows.append(
                {
                    "contract_month": month,
                    "settle_price": settle,
                    "implied_rate": implied,
                    "volume": int(volume_raw) if volume_raw not in (None, "", "-") else None,
                    "open_interest": int(oi_raw) if oi_raw not in (None, "", "-") else None,
                    "source": "cme",
                    "fetched_at": fetched_at,
                }
            )

        if not rows:
            return self._empty_settlements_frame()

        return pl.DataFrame(rows)
