"""Adapter for the existing Yahoo Finance data pipeline."""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

import polars as pl

logger = logging.getLogger(__name__)


class YahooAdapter:
    """Bridge between Market Lens Studio and Yahoo data sources."""

    def __init__(self, store=None):
        """Initialize with an optional DuckDB store for cached data.

        Args:
            store: A DuckDBStore instance for reading cached normalized data.
        """
        self._store = store

    def fetch_series(
        self,
        ticker: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        series_id: Optional[str] = None,
    ) -> tuple[list[date], list[float]]:
        """Fetch a price series as (dates, values) lists.

        Tries the DuckDB store first, falls back to direct yfinance fetch.
        """
        sid = series_id or ticker

        # Try cached store first
        if self._store is not None:
            try:
                df = self._store.normalized(asset_classes=None)
                sub = df.filter(pl.col("series_id") == sid).sort("date")
                if start_date:
                    sub = sub.filter(pl.col("date") >= start_date)
                if end_date:
                    sub = sub.filter(pl.col("date") <= end_date)
                if sub.height > 0:
                    dates_col = sub["date"].to_list()
                    values_col = sub["value"].to_list()
                    pairs = [(d, v) for d, v in zip(dates_col, values_col) if v is not None]
                    if pairs:
                        return [p[0] for p in pairs], [p[1] for p in pairs]
            except Exception as exc:
                logger.warning("DuckDB store read failed for %s: %s", sid, exc)

        # Fallback: direct yfinance fetch
        return self._fetch_yfinance(ticker, start_date, end_date)

    def _fetch_yfinance(
        self,
        ticker: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
    ) -> tuple[list[date], list[float]]:
        """Fetch directly from yfinance."""
        try:
            import yfinance as yf
        except ImportError:
            logger.error("yfinance not installed. Install with: pip install yfinance")
            return [], []

        sd = start_date or date(1990, 1, 1)
        ed = end_date or date.today()

        try:
            tk = yf.Ticker(ticker)
            hist = tk.history(start=sd.isoformat(), end=(ed + timedelta(days=1)).isoformat())
            if hist.empty:
                logger.warning("No data returned from yfinance for %s", ticker)
                return [], []
            hist = hist.sort_index()
            dates_out = [d.date() if hasattr(d, "date") else d for d in hist.index]
            values_out = hist["Close"].tolist()
            # Remove NaN
            pairs = [(d, v) for d, v in zip(dates_out, values_out) if v == v]
            if not pairs:
                return [], []
            return [p[0] for p in pairs], [p[1] for p in pairs]
        except Exception as exc:
            logger.error("yfinance fetch failed for %s: %s", ticker, exc)
            return [], []

    def fetch_dataframe(
        self,
        ticker: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        series_id: Optional[str] = None,
    ) -> pl.DataFrame:
        """Fetch as a polars DataFrame with date and value columns."""
        dates, values = self.fetch_series(ticker, start_date, end_date, series_id)
        return pl.DataFrame({"date": dates, "value": values}).sort("date")
