"""Offline tests for the connector layer. All pass with NO network."""

from __future__ import annotations

import json
import time
from datetime import date, datetime, timedelta, timezone

import polars as pl
import pytest

from market_data_pipeline.src.connectors import (
    AdapterResult,
    FredConnector,
    RateLimiter,
    ResponseCache,
    SyntheticConnector,
    YahooConnector,
    fred_enabled,
)
from market_data_pipeline.src.connectors.base import MACRO_SCHEMA, MARKET_SCHEMA

MARKET_COLS = list(MARKET_SCHEMA.keys())
MACRO_COLS = list(MACRO_SCHEMA.keys())


# --------------------------- synthetic: market ------------------------------
def test_synthetic_market_determinism_and_schema():
    a = SyntheticConnector().fetch_history(["SPY", "TLT"])
    b = SyntheticConnector().fetch_history(["SPY", "TLT"])
    assert a.rows.columns == MARKET_COLS
    assert a.rows.schema == MARKET_SCHEMA
    # Same seed -> identical frames.
    assert a.rows.equals(b.rows)
    assert a.checksum == b.checksum
    assert a.response_status == "ok:synthetic"
    # Plausible ending level for SPY (~560).
    spy = a.rows.filter(pl.col("vendor_symbol") == "SPY").sort("date")
    last_close = spy["close"][-1]
    assert 400 < last_close < 750


def test_synthetic_market_has_six_years_history():
    res = SyntheticConnector().fetch_history(["QQQ"])
    span_days = (res.max_date - res.min_date).days
    assert span_days >= 6 * 365
    # No NaN / Inf / nulls in close.
    closes = res.rows["close"].to_list()
    assert all(c == c and c not in (float("inf"), float("-inf")) for c in closes)
    assert res.rows["close"].null_count() == 0


def test_synthetic_market_different_symbols_differ():
    res = SyntheticConnector().fetch_history(["SPY", "QQQ"])
    spy = res.rows.filter(pl.col("vendor_symbol") == "SPY")["close"].to_list()
    qqq = res.rows.filter(pl.col("vendor_symbol") == "QQQ")["close"].to_list()
    assert spy != qqq


# --------------------------- synthetic: macro -------------------------------
def test_synthetic_macro_determinism_and_schema():
    a = SyntheticConnector().fetch_series("DGS10")
    b = SyntheticConnector().fetch_series("DGS10")
    assert a.rows.columns == MACRO_COLS
    assert a.rows.schema == MACRO_SCHEMA
    assert a.rows.equals(b.rows)
    # Rate series ends near the anchor level (~4.3%).
    assert 2.0 < a.rows.sort("date")["value"][-1] < 7.0


def test_synthetic_macro_index_is_monthly_and_long():
    res = SyntheticConnector().fetch_series("CPIAUCSL")
    assert res.rows.columns == MACRO_COLS
    span_days = (res.max_date - res.min_date).days
    assert span_days >= 6 * 365
    # Monthly cadence -> far fewer rows than daily over the same window.
    assert res.rows.height < 200
    assert res.rows["value"].null_count() == 0


# --------------------------- AdapterResult checksum -------------------------
def test_checksum_stable_and_changes_with_data():
    df1 = pl.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})
    df1b = pl.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})
    df2 = pl.DataFrame({"a": [1, 2, 4], "b": ["x", "y", "z"]})
    assert AdapterResult.checksum_of(df1) == AdapterResult.checksum_of(df1b)
    assert AdapterResult.checksum_of(df1) != AdapterResult.checksum_of(df2)


# --------------------------- ResponseCache ----------------------------------
def test_response_cache_roundtrip_and_ttl_expiry(tmp_path):
    cache = ResponseCache(cache_dir=tmp_path)
    key = ResponseCache.make_key("YAHOO", "chart", "SPY", {"range": "10y"})
    payload = {"hello": "world", "n": 42}
    cache.put(key, payload)
    # Fresh -> hit.
    assert cache.get(key, ttl_hours=1.0) == payload
    # Missing key -> miss.
    assert cache.get("nope", ttl_hours=1.0) is None

    # Force an old cached_at to trigger TTL expiry.
    path = tmp_path / f"{key}.json"
    old = (datetime.now(timezone.utc) - timedelta(hours=10)).isoformat()
    path.write_text(json.dumps({"cached_at": old, "payload": payload}), "utf-8")
    assert cache.get(key, ttl_hours=6.0) is None
    assert cache.get(key, ttl_hours=24.0) == payload


# --------------------------- RateLimiter ------------------------------------
def test_rate_limiter_spaces_calls():
    rate = 100.0  # high rate keeps the test fast
    n = 5
    rl = RateLimiter(rate=rate, capacity=1)
    start = time.monotonic()
    for _ in range(n):
        rl.acquire()
    elapsed = time.monotonic() - start
    # With capacity=1, after the first token we wait ~1/rate per remaining call.
    expected = (n - 1) / rate
    assert elapsed >= expected * 0.8  # allow scheduler slack


# --------------------------- FRED parsing -----------------------------------
def test_fred_parse_observations_with_null():
    payload = {
        "observations": [
            {"date": "2026-01-01", "value": "4.30", "realtime_start": "2026-01-02", "realtime_end": "2026-01-02"},
            {"date": "2026-01-02", "value": ".", "realtime_start": "2026-01-03", "realtime_end": "2026-01-03"},
            {"date": "2026-01-03", "value": "4.35", "realtime_start": "2026-01-04", "realtime_end": "2026-01-04"},
        ]
    }
    df = FredConnector._parse_observations(payload, "DGS10")
    assert df.columns == MACRO_COLS
    assert df.schema == MACRO_SCHEMA
    assert df.height == 3
    assert df["value"].to_list() == [4.30, None, 4.35]
    assert df["series_id"].to_list() == ["DGS10"] * 3
    assert df["source"][0] == "FRED"
    assert df["date"][0] == date(2026, 1, 1)


def test_fred_enabled_false_when_unset(monkeypatch):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    assert fred_enabled() is False


def test_fred_fetch_no_key_returns_empty_disabled(monkeypatch):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    conn = FredConnector()
    res = conn.fetch_series("DGS10")
    assert res.response_status == "disabled:no_api_key"
    assert res.row_count == 0
    assert res.rows.columns == MACRO_COLS
    assert res.rows.height == 0


# --------------------------- Yahoo parsing ----------------------------------
def test_yahoo_parse_chart():
    # 2026-01-02 and 2026-01-05 (UTC midnight epochs).
    ts1 = int(datetime(2026, 1, 2, tzinfo=timezone.utc).timestamp())
    ts2 = int(datetime(2026, 1, 5, tzinfo=timezone.utc).timestamp())
    payload = {
        "chart": {
            "result": [
                {
                    "timestamp": [ts1, ts2],
                    "indicators": {
                        "quote": [
                            {
                                "open": [560.0, 562.0],
                                "high": [565.0, 566.0],
                                "low": [558.0, 561.0],
                                "close": [563.0, 564.5],
                                "volume": [70000000, 65000000],
                            }
                        ],
                        "adjclose": [{"adjclose": [562.5, 564.0]}],
                    },
                }
            ]
        }
    }
    df = YahooConnector._parse_chart(payload, "SPY")
    assert df.columns == MARKET_COLS
    assert df.schema == MARKET_SCHEMA
    assert df.height == 2
    assert df["vendor_symbol"].to_list() == ["SPY", "SPY"]
    assert df["close"].to_list() == [563.0, 564.5]
    assert df["adj_close"].to_list() == [562.5, 564.0]
    assert df["volume"].to_list() == [70000000, 65000000]
    assert df["date"][0] == date(2026, 1, 2)
    assert df["source"][0] == "YAHOO"


def test_yahoo_parse_chart_empty_payload():
    assert YahooConnector._parse_chart({}, "SPY").height == 0
    assert YahooConnector._parse_chart({"chart": {"result": []}}, "SPY").height == 0


def test_yahoo_fetch_offline_degrades_gracefully(monkeypatch, tmp_path):
    # Force the HTTP fallback (no yfinance) and ensure no network is needed.
    conn = YahooConnector(prefer_yfinance=False, cache=ResponseCache(cache_dir=tmp_path))

    class _FailClient:
        def get_json(self, url, params=None):
            raise RuntimeError("network blocked")

    conn._client = _FailClient()
    res = conn.fetch_history(["SPY"])
    assert res.response_status.startswith("error:")
    assert res.rows.height == 0
    assert res.rows.columns == MARKET_COLS


def test_adapter_result_manifest_fields():
    res = SyntheticConnector().fetch_history(["GLD"])
    m = res.manifest()
    assert m["source"] == "SYNTHETIC"
    assert m["row_count"] == res.rows.height
    assert m["min_date"] is not None and m["max_date"] is not None
    assert len(m["checksum"]) == 64  # sha256 hex
