"""Transform (normalize) tests — raw vendor frames → canonical."""

from __future__ import annotations

from datetime import date

import polars as pl

from market_data_pipeline.src.storage.schemas import NORMALIZED_SCHEMA
from market_data_pipeline.src.transforms.normalize import normalize_macro, normalize_market


def test_normalize_market_uses_adj_close_and_canonical_schema():
    raw = pl.DataFrame({
        "vendor_symbol": ["SPY", "SPY"],
        "date": [date(2026, 1, 1), date(2026, 1, 2)],
        "open": [500.0, 501.0], "high": [502.0, 503.0], "low": [499.0, 500.0],
        "close": [501.0, 502.0], "adj_close": [400.0, 401.0], "volume": [1, 2],
        "source": ["YAHOO", "YAHOO"],
    })
    out = normalize_market(raw, "r1")
    assert out.columns == list(NORMALIZED_SCHEMA.keys())
    assert out["value"].to_list() == [400.0, 401.0]  # adj_close, not close
    assert out["asset_class"][0] == "EQUITY"
    assert out["adjustment_type"][0] == "ADJ_CLOSE"
    assert out["display_name"][0] == "S&P 500 (SPY)"


def test_normalize_macro_maps_fred_id_and_enriches():
    raw = pl.DataFrame({
        "series_id": ["CPIAUCSL", "CPIAUCSL"],
        "date": [date(2025, 12, 1), date(2026, 1, 1)],
        "value": [319.0, 320.0],
        "realtime_start": [date(2026, 1, 15), date(2026, 2, 15)],
        "realtime_end": [None, None],
        "source": ["FRED", "FRED"],
    }, schema_overrides={"realtime_start": pl.Date, "realtime_end": pl.Date})
    out = normalize_macro(raw, "r1")
    assert out.columns == list(NORMALIZED_SCHEMA.keys())
    assert out["asset_class"][0] == "MACRO_INFLATION"
    assert out["display_name"][0] == "CPI"
    assert out["vintage_date"].to_list() == [date(2026, 1, 15), date(2026, 2, 15)]


def test_normalize_empty_inputs():
    assert normalize_market(pl.DataFrame(), "r1").is_empty()
    assert normalize_macro(pl.DataFrame(), "r1").is_empty()
    assert normalize_market(pl.DataFrame(), "r1").columns == list(NORMALIZED_SCHEMA.keys())


def test_normalize_drops_null_values():
    raw = pl.DataFrame({
        "vendor_symbol": ["SPY", "SPY"],
        "date": [date(2026, 1, 1), date(2026, 1, 2)],
        "open": [None, 1.0], "high": [None, 1.0], "low": [None, 1.0],
        "close": [None, 1.0], "adj_close": [None, 401.0], "volume": [None, 2],
        "source": ["YAHOO", "YAHOO"],
    })
    out = normalize_market(raw, "r1")
    assert out.height == 1 and out["value"][0] == 401.0
