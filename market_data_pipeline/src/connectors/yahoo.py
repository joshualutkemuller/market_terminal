"""Yahoo Finance market-data connector.

Prefers the ``yfinance`` library when importable; otherwise falls back to the
public Yahoo chart JSON endpoint via :class:`ThrottledClient`. Either way the
output is the canonical raw-market OHLCV frame.

NOTE ON YAHOO: The Yahoo Finance endpoints are *unofficial* and *best-effort*.
Their use is governed by Yahoo's API terms of service. This adapter exists for
prototyping and local development only and should not be relied upon for
production redistribution. Because the :class:`MarketDataAdapter` interface is
vendor-agnostic, a licensed paid vendor (Polygon, Tiingo, Nasdaq Data Link,
Bloomberg, FactSet, Refinitiv, ...) can replace this adapter without touching
anything downstream. To avoid hammering Yahoo, responses are aggressively
cached on disk.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timezone
from typing import Any, Optional

import polars as pl

from market_data_pipeline.src.connectors.base import (
    MARKET_SCHEMA,
    AdapterResult,
    MarketDataAdapter,
    ResponseCache,
    ThrottledClient,
    empty_market_frame,
)

logger = logging.getLogger("market_data_pipeline.connectors.yahoo")

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
# Aggressive caching: short TTL for intraday-ish refreshes, long for daily bars.
YAHOO_INTRADAY_TTL_HOURS = 1.0
YAHOO_DAILY_TTL_HOURS = 12.0


class YahooConnector(MarketDataAdapter):
    """Fetch daily OHLCV history from Yahoo, degrading gracefully offline."""

    SOURCE = "YAHOO"
    DATASET = "chart_daily"

    def __init__(
        self,
        client: Optional[ThrottledClient] = None,
        cache: Optional[ResponseCache] = None,
        prefer_yfinance: bool = True,
        cache_ttl_hours: float = YAHOO_DAILY_TTL_HOURS,
        default_range: str = "10y",
        rate_limit: float = 1.0,
    ) -> None:
        self._client = client
        self.cache = cache or ResponseCache()
        self.prefer_yfinance = prefer_yfinance
        self.cache_ttl_hours = cache_ttl_hours
        self.default_range = default_range
        self.rate_limit = rate_limit

    def _get_client(self) -> ThrottledClient:
        if self._client is None:
            self._client = ThrottledClient(rate=self.rate_limit)
        return self._client

    @staticmethod
    def _load_yfinance() -> Any:
        """Lazily import yfinance, returning the module or None if unavailable."""
        try:
            import yfinance  # type: ignore

            return yfinance
        except Exception:  # noqa: BLE001 - missing or broken yfinance is non-fatal
            return None

    @staticmethod
    def _parse_chart(payload: dict[str, Any], symbol: str) -> pl.DataFrame:
        """Parse a Yahoo chart-JSON payload into the raw-market frame.

        Pure and network-free. Handles the standard ``chart.result[0]`` shape
        with ``timestamp``, ``indicators.quote[0]`` (OHLCV) and an optional
        ``indicators.adjclose[0]`` block. Bars with a null close are dropped.
        """
        chart = (payload or {}).get("chart") or {}
        results = chart.get("result") or []
        if not results:
            return empty_market_frame()
        result = results[0]

        timestamps = result.get("timestamp") or []
        indicators = result.get("indicators") or {}
        quotes = (indicators.get("quote") or [{}])
        quote = quotes[0] if quotes else {}
        adj_blocks = indicators.get("adjclose") or []
        adj_close_list = adj_blocks[0].get("adjclose") if adj_blocks else None

        opens = quote.get("open") or []
        highs = quote.get("high") or []
        lows = quote.get("low") or []
        closes = quote.get("close") or []
        volumes = quote.get("volume") or []

        dates: list[date] = []
        o_out: list[Optional[float]] = []
        h_out: list[Optional[float]] = []
        l_out: list[Optional[float]] = []
        c_out: list[Optional[float]] = []
        a_out: list[Optional[float]] = []
        v_out: list[Optional[int]] = []

        for i, ts in enumerate(timestamps):
            close_v = _at(closes, i)
            if close_v is None:
                continue  # skip bars with no close (holidays / gaps)
            try:
                bar_date = datetime.fromtimestamp(int(ts), tz=timezone.utc).date()
            except (TypeError, ValueError, OverflowError):
                continue
            adj_v = _at(adj_close_list, i) if adj_close_list is not None else close_v
            if adj_v is None:
                adj_v = close_v
            vol_v = _at(volumes, i)
            dates.append(bar_date)
            o_out.append(_fnum(_at(opens, i)))
            h_out.append(_fnum(_at(highs, i)))
            l_out.append(_fnum(_at(lows, i)))
            c_out.append(_fnum(close_v))
            a_out.append(_fnum(adj_v))
            v_out.append(int(vol_v) if vol_v is not None else None)

        if not dates:
            return empty_market_frame()

        return pl.DataFrame(
            {
                "vendor_symbol": [symbol] * len(dates),
                "date": dates,
                "open": o_out,
                "high": h_out,
                "low": l_out,
                "close": c_out,
                "adj_close": a_out,
                "volume": v_out,
                "source": ["YAHOO"] * len(dates),
            },
            schema=MARKET_SCHEMA,
        )

    def _fetch_one_via_http(self, symbol: str, start: Optional[date]) -> AdapterResult:
        if start is not None:
            period1 = int(datetime.combine(start, time.min, tzinfo=timezone.utc).timestamp())
            period2 = int(datetime.now(timezone.utc).timestamp())
            params: dict[str, Any] = {"period1": period1, "period2": period2, "interval": "1d"}
        else:
            params = {"range": self.default_range, "interval": "1d"}
        url = YAHOO_CHART_URL.format(symbol=symbol)

        def _result(df: pl.DataFrame, status: str) -> AdapterResult:
            return AdapterResult(
                rows=df,
                source=self.SOURCE,
                dataset=self.DATASET,
                symbol_or_series_id=symbol,
                endpoint=url,
                params=params,
                response_status=status,
            )

        cache_key = ResponseCache.make_key(self.SOURCE, self.DATASET, symbol, params)
        cached = self.cache.get(cache_key, self.cache_ttl_hours)
        if cached is not None:
            return _result(self._parse_chart(cached, symbol), "ok:cache")

        try:
            client = self._get_client()
            payload = client.get_json(url, params=params)
        except Exception as exc:  # noqa: BLE001 - degrade gracefully offline
            logger.warning("Yahoo fetch failed for %s: %s", symbol, exc)
            stale = self.cache.get_stale(cache_key)
            if stale is not None:
                logger.warning("Using stale Yahoo cache for %s after provider failure", symbol)
                return _result(self._parse_chart(stale, symbol), "ok:stale_cache")
            return _result(empty_market_frame(), f"error:{type(exc).__name__}")

        try:
            self.cache.put(cache_key, payload)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Yahoo cache write failed for %s: %s", symbol, exc)

        return _result(self._parse_chart(payload, symbol), "ok")

    def _fetch_one_via_yfinance(self, yf: Any, symbol: str, start: Optional[date]) -> AdapterResult:
        params: dict[str, Any] = {"interval": "1d", "start": start.isoformat() if start else None}

        def _result(df: pl.DataFrame, status: str) -> AdapterResult:
            return AdapterResult(
                rows=df,
                source=self.SOURCE,
                dataset=self.DATASET,
                symbol_or_series_id=symbol,
                endpoint="yfinance",
                params=params,
                response_status=status,
            )

        try:  # pragma: no cover - requires network + yfinance
            ticker = yf.Ticker(symbol)
            hist = ticker.history(
                start=start.isoformat() if start else None,
                period=None if start else "max",
                interval="1d",
                auto_adjust=False,
            )
            df = _yfinance_to_frame(hist, symbol)
            return _result(df, "ok")
        except Exception as exc:  # noqa: BLE001
            logger.warning("Yahoo (yfinance) fetch failed for %s: %s", symbol, exc)
            return _result(empty_market_frame(), f"error:{type(exc).__name__}")

    def fetch_history(self, symbols: list[str], start: Optional[date] = None) -> AdapterResult:
        if not symbols:
            return AdapterResult(
                rows=empty_market_frame(),
                source=self.SOURCE,
                dataset=self.DATASET,
                symbol_or_series_id="",
                endpoint=YAHOO_CHART_URL.format(symbol=""),
                params={"range": self.default_range, "interval": "1d"},
                response_status="ok:empty_request",
            )

        yf = self._load_yfinance() if self.prefer_yfinance else None

        frames: list[pl.DataFrame] = []
        statuses: list[str] = []
        for symbol in symbols:
            if yf is not None:
                res = self._fetch_one_via_yfinance(yf, symbol, start)
                if res.rows.is_empty() and not res.response_status.startswith("ok"):
                    logger.warning("Yahoo yfinance path failed for %s; retrying HTTP chart endpoint", symbol)
                    res = self._fetch_one_via_http(symbol, start)
            else:
                res = self._fetch_one_via_http(symbol, start)
            frames.append(res.rows)
            statuses.append(res.response_status)

        combined = pl.concat(frames, how="vertical") if frames else empty_market_frame()
        # Aggregate status: ok if any symbol succeeded, else the first error.
        if any(s.startswith("ok") for s in statuses):
            status = "ok" if all(s.startswith("ok") for s in statuses) else "partial"
        else:
            status = statuses[0] if statuses else "error:unknown"

        return AdapterResult(
            rows=combined,
            source=self.SOURCE,
            dataset=self.DATASET,
            symbol_or_series_id=",".join(symbols),
            endpoint="yfinance" if yf is not None else YAHOO_CHART_URL.format(symbol="<symbol>"),
            params={"range": self.default_range, "interval": "1d", "start": start.isoformat() if start else None},
            response_status=status,
        )


def _at(seq: Any, i: int) -> Any:
    if seq is None:
        return None
    try:
        return seq[i]
    except (IndexError, TypeError):
        return None


def _fnum(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    # Guard against NaN/Inf leaking into the frame.
    if f != f or f in (float("inf"), float("-inf")):
        return None
    return f


def _yfinance_to_frame(hist: Any, symbol: str) -> pl.DataFrame:  # pragma: no cover - needs yfinance
    """Convert a yfinance OHLCV DataFrame into the raw-market frame."""
    if hist is None or len(hist) == 0:
        return empty_market_frame()
    records = hist.reset_index().to_dict("records")
    dates, o, h, l, c, a, v = [], [], [], [], [], [], []
    for row in records:
        idx = row.get("Date") or row.get("Datetime") or row.get("index")
        bar_date = idx.date() if hasattr(idx, "date") else idx
        close_v = _fnum(row.get("Close"))
        if bar_date is None or close_v is None:
            continue
        dates.append(bar_date)
        o.append(_fnum(row.get("Open")))
        h.append(_fnum(row.get("High")))
        l.append(_fnum(row.get("Low")))
        c.append(close_v)
        a.append(_fnum(row.get("Adj Close")) or close_v)
        vol = row.get("Volume")
        v.append(int(vol) if vol is not None else None)
    if not dates:
        return empty_market_frame()
    return pl.DataFrame(
        {
            "vendor_symbol": [symbol] * len(dates),
            "date": dates,
            "open": o, "high": h, "low": l, "close": c, "adj_close": a, "volume": v,
            "source": ["YAHOO"] * len(dates),
        },
        schema=MARKET_SCHEMA,
    )
