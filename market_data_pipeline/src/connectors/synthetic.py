"""Deterministic offline connector for fully offline pipeline runs.

:class:`SyntheticConnector` implements *both* adapter interfaces and generates
plausible, fully deterministic data anchored to a mid-2026 regime. It is seeded
purely from the symbol / series-id string (no wall-clock, no global RNG state),
so the same request always yields an identical frame.

Output shapes match the FRED / Yahoo raw frames exactly, so downstream
transforms treat every source identically. Generated history spans well over six
years so 5Y CAGR / drawdown analytics have enough runway.
"""

from __future__ import annotations

import hashlib
import math
from datetime import date, timedelta
from typing import Optional

import polars as pl

from market_data_pipeline.src.connectors.base import (
    MACRO_SCHEMA,
    MARKET_SCHEMA,
    AdapterResult,
    MacroDataAdapter,
    MarketDataAdapter,
)

SOURCE = "SYNTHETIC"
# Anchor "today" for the synthetic regime.
ANCHOR_DATE = date(2026, 6, 18)
# Years of history to generate (>= 6y for 5Y analytics).
DEFAULT_YEARS = 8

# Plausible mid-2026 price levels per symbol (current/ending level).
_MARKET_LEVELS: dict[str, float] = {
    "SPY": 560.0,
    "QQQ": 490.0,
    "DIA": 410.0,
    "IWM": 215.0,
    "TLT": 92.0,
    "IEF": 95.0,
    "GLD": 250.0,
    "SLV": 28.0,
    "USO": 78.0,
    "VIX": 15.0,
    "^VIX": 15.0,
    "AAPL": 215.0,
    "MSFT": 450.0,
    "NVDA": 130.0,
    "AMZN": 195.0,
    "GOOGL": 180.0,
    "META": 510.0,
    "TSLA": 250.0,
    "BTC-USD": 68000.0,
    "ETH-USD": 3500.0,
}

# Plausible mid-2026 levels for known macro series.
_MACRO_LEVELS: dict[str, float] = {
    # Index-style (monthly levels)
    "CPIAUCSL": 320.0,
    "PCEPI": 125.0,
    "INDPRO": 103.0,
    "PAYEMS": 159000.0,
    # Rate-style (daily percent)
    "DGS10": 4.3,
    "DGS2": 4.6,
    "DGS30": 4.5,
    "DFF": 4.33,
    "SOFR": 4.31,
    "FEDFUNDS": 4.33,
    "UNRATE": 4.1,
    "T10Y2Y": -0.3,
}

# Series treated as monthly index levels (vs. daily rate/percent series).
_INDEX_SERIES = {"CPIAUCSL", "PCEPI", "INDPRO", "PAYEMS"}


def _seed(text: str) -> int:
    """Return a stable 64-bit seed derived from ``text``."""
    digest = hashlib.sha256(text.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


class _Rng:
    """Tiny deterministic PRNG (SplitMix64) — no global state, fully seeded."""

    def __init__(self, seed: int) -> None:
        self._state = seed & 0xFFFFFFFFFFFFFFFF

    def next_u64(self) -> int:
        self._state = (self._state + 0x9E3779B97F4A7C15) & 0xFFFFFFFFFFFFFFFF
        z = self._state
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & 0xFFFFFFFFFFFFFFFF
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & 0xFFFFFFFFFFFFFFFF
        return z ^ (z >> 31)

    def uniform(self) -> float:
        """Uniform in [0, 1)."""
        return (self.next_u64() >> 11) / float(1 << 53)

    def normal(self) -> float:
        """Standard normal via Box-Muller (deterministic)."""
        u1 = max(self.uniform(), 1e-12)
        u2 = self.uniform()
        return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)


def _business_days(start: date, end: date) -> list[date]:
    days: list[date] = []
    d = start
    while d <= end:
        if d.weekday() < 5:  # Mon-Fri
            days.append(d)
        d += timedelta(days=1)
    return days


def _month_starts(start: date, end: date) -> list[date]:
    days: list[date] = []
    d = date(start.year, start.month, 1)
    while d <= end:
        days.append(d)
        if d.month == 12:
            d = date(d.year + 1, 1, 1)
        else:
            d = date(d.year, d.month + 1, 1)
    return days


class SyntheticConnector(MacroDataAdapter, MarketDataAdapter):
    """Deterministic synthetic source emitting canonical raw frames offline."""

    SOURCE = SOURCE

    def __init__(self, years: int = DEFAULT_YEARS, anchor: date = ANCHOR_DATE) -> None:
        self.years = years
        self.anchor = anchor

    # ----------------------------- market -----------------------------------
    def fetch_history(self, symbols: list[str], start: Optional[date] = None) -> AdapterResult:
        end = self.anchor
        default_start = date(end.year - self.years, end.month, end.day)
        gen_start = default_start  # always generate full history for analytics

        frames: list[pl.DataFrame] = []
        for symbol in symbols:
            frames.append(self._gen_market(symbol, gen_start, end))

        combined = pl.concat(frames, how="vertical") if frames else pl.DataFrame(schema=MARKET_SCHEMA)
        if start is not None and combined.height > 0:
            combined = combined.filter(pl.col("date") >= start)

        return AdapterResult(
            rows=combined,
            source=SOURCE,
            dataset="synthetic_market",
            symbol_or_series_id=",".join(symbols),
            endpoint="synthetic://market",
            params={"symbols": symbols, "start": start.isoformat() if start else None},
            response_status="ok:synthetic",
        )

    def _gen_market(self, symbol: str, start: date, end: date) -> pl.DataFrame:
        rng = _Rng(_seed(f"market::{symbol}"))
        days = _business_days(start, end)
        n = len(days)
        if n == 0:
            return pl.DataFrame(schema=MARKET_SCHEMA)

        end_level = _MARKET_LEVELS.get(symbol)
        if end_level is None:
            # Derive a stable plausible level (50-600) from the symbol seed.
            end_level = 50.0 + (_seed(symbol) % 5500) / 10.0

        is_vol = symbol.upper().endswith("VIX")
        # Per-symbol annualized drift/vol, seeded for determinism.
        if is_vol:
            mu = 0.0
            sigma = 0.85
        else:
            mu = 0.04 + (rng.uniform() * 0.10)  # 4%-14% annual drift
            sigma = 0.12 + (rng.uniform() * 0.25)  # 12%-37% annual vol
        dt = 1.0 / 252.0

        # Walk a multiplicative path forward, then rescale so it ENDS at end_level.
        closes: list[float] = []
        level = 1.0
        for _ in range(n):
            shock = rng.normal()
            level *= math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * math.sqrt(dt) * shock)
            if is_vol:
                # Mean-revert vol toward 1.0 to keep levels sane.
                level = level + 0.05 * (1.0 - level)
            level = max(level, 1e-6)
            closes.append(level)

        scale = end_level / closes[-1]
        closes = [c * scale for c in closes]

        opens, highs, lows, adj, vols = [], [], [], [], []
        prev_close = closes[0]
        for i, c in enumerate(closes):
            o = prev_close if i > 0 else c * (1.0 + (rng.uniform() - 0.5) * 0.01)
            intraday = abs(rng.normal()) * 0.01 * c + 1e-6
            hi = max(o, c) + intraday
            lo = min(o, c) - intraday
            lo = max(lo, 1e-6)
            opens.append(round(o, 4))
            highs.append(round(hi, 4))
            lows.append(round(lo, 4))
            adj.append(round(c, 4))
            base_vol = 200_000 if is_vol else 5_000_000
            vol = int(base_vol * (0.5 + rng.uniform()))
            vols.append(vol)
            prev_close = c

        return pl.DataFrame(
            {
                "vendor_symbol": [symbol] * n,
                "date": days,
                "open": opens,
                "high": highs,
                "low": lows,
                "close": [round(c, 4) for c in closes],
                "adj_close": adj,
                "volume": vols,
                "source": [SOURCE] * n,
            },
            schema=MARKET_SCHEMA,
        )

    # ----------------------------- macro ------------------------------------
    def fetch_series(self, series_id: str, start: Optional[date] = None) -> AdapterResult:
        end = self.anchor
        default_start = date(end.year - self.years, end.month, end.day)
        df = self._gen_macro(series_id, default_start, end)
        if start is not None and df.height > 0:
            df = df.filter(pl.col("date") >= start)

        return AdapterResult(
            rows=df,
            source=SOURCE,
            dataset="synthetic_macro",
            symbol_or_series_id=series_id,
            endpoint="synthetic://macro",
            params={"series_id": series_id, "start": start.isoformat() if start else None},
            response_status="ok:synthetic",
        )

    def _gen_macro(self, series_id: str, start: date, end: date) -> pl.DataFrame:
        rng = _Rng(_seed(f"macro::{series_id}"))
        is_index = series_id in _INDEX_SERIES

        end_level = _MACRO_LEVELS.get(series_id)
        if end_level is None:
            # Unknown series: classify by name heuristics, derive a level.
            if any(tok in series_id.upper() for tok in ("DGS", "RATE", "DFF", "SOFR", "FUNDS", "T10")):
                end_level = 3.0 + (_seed(series_id) % 400) / 100.0
            else:
                is_index = True
                end_level = 100.0 + (_seed(series_id) % 25000) / 100.0

        if is_index:
            dates = _month_starts(start, end)
        else:
            dates = _business_days(start, end)
        n = len(dates)
        if n == 0:
            return pl.DataFrame(schema=MACRO_SCHEMA)

        values: list[float] = []
        if is_index:
            # Steady compounding index with mild noise, scaled to end at level.
            level = 1.0
            monthly_growth = 0.0015 + rng.uniform() * 0.003  # ~1.8%-5.4% annual
            for _ in range(n):
                level *= (1.0 + monthly_growth + rng.normal() * 0.001)
                values.append(level)
            scale = end_level / values[-1]
            values = [round(v * scale, 4) for v in values]
        else:
            # Rate series: mean-reverting random walk around end_level (percent).
            level = end_level
            path: list[float] = []
            for _ in range(n):
                level += rng.normal() * 0.02 + 0.001 * (end_level - level)
                path.append(level)
            # Shift so the final value lands exactly on the anchor level.
            adj = end_level - path[-1]
            values = [round(v + adj, 4) for v in path]

        return pl.DataFrame(
            {
                "series_id": [series_id] * n,
                "date": dates,
                "value": values,
                "realtime_start": [None] * n,
                "realtime_end": [None] * n,
                "source": [SOURCE] * n,
            },
            schema=MACRO_SCHEMA,
        )
