"""Tests for connectors and the Fed probability engine (no network required)."""

from __future__ import annotations

from datetime import date

import polars as pl
import pytest

from macro_data_etl.src.analytics.fed_probability import FedProbabilityEngine
from macro_data_etl.src.connectors.world_bank import WorldBankConnector
from macro_data_etl.src.transform.transformers import Transformer
from macro_data_etl.src.utils.quality import QualityChecker


# --- World Bank JSON parsing -------------------------------------------------

WB_SAMPLE = [
    {"page": 1, "pages": 1, "per_page": 5000, "total": 2},
    [
        {
            "indicator": {"id": "FP.CPI.TOTL.ZG", "value": "Inflation, consumer prices"},
            "country": {"id": "US", "value": "United States"},
            "countryiso3code": "USA",
            "date": "2024",
            "value": 2.9,
            "unit": "",
            "obs_status": "",
            "decimal": 1,
        },
        {
            "indicator": {"id": "FP.CPI.TOTL.ZG", "value": "Inflation, consumer prices"},
            "country": {"id": "US", "value": "United States"},
            "countryiso3code": "USA",
            "date": "2023",
            "value": 4.1,
            "unit": "",
            "obs_status": "",
            "decimal": 1,
        },
    ],
]


def test_world_bank_connector_parses_records():
    wb = WorldBankConnector()
    rows = wb._parse_records(WB_SAMPLE[1])
    assert len(rows) == 2
    assert rows[0]["country_iso3"] == "USA"
    assert rows[0]["value"] == 2.9
    assert rows[0]["source"] == "world_bank"
    wb.close()


def test_world_bank_handles_null_values():
    wb = WorldBankConnector()
    records = [
        {
            "indicator": {"id": "FP.CPI.TOTL.ZG", "value": "x"},
            "country": {"id": "ZW", "value": "Zimbabwe"},
            "countryiso3code": "ZWE",
            "date": "2024",
            "value": None,
        }
    ]
    rows = wb._parse_records(records)
    assert rows[0]["value"] is None
    wb.close()


# --- Fed probability engine --------------------------------------------------


def test_fed_probability_two_outcome():
    eng = FedProbabilityEngine(4.00, 4.25)
    # rate_after exactly between two outcomes -> 50/50
    p_high, p_low = eng.two_outcome_probability(
        rate_before=4.33, rate_after=4.205, outcome_high=4.33, outcome_low=4.08
    )
    assert abs(p_low - 0.5) < 0.01
    assert abs(p_high - 0.5) < 0.01
    assert abs((p_high + p_low) - 1.0) < 1e-9


def test_fed_probability_two_outcome_clamped():
    eng = FedProbabilityEngine()
    # rate_after below low outcome -> all probability on low
    p_high, p_low = eng.two_outcome_probability(4.0, 3.5, outcome_high=4.0, outcome_low=3.75)
    assert p_low == 1.0
    assert p_high == 0.0


def test_fed_probability_multi_outcome_sums_to_one():
    eng = FedProbabilityEngine()
    dist = eng.multi_outcome_distribution(rate_before=4.33, rate_after=4.10)
    assert abs(sum(dist.values()) - 1.0) < 1e-6
    # a cut is expected -> mass should sit below rate_before
    assert sum(p for r, p in dist.items() if r < 4.33) > 0.5


def test_fed_probability_day_weighting():
    eng = FedProbabilityEngine()
    # meeting mid-month, month avg between before/after
    after = eng.day_weighted_rate(
        meeting_day=15, days_in_month=30, month_implied=4.20, rate_before=4.33
    )
    # after should be below before (a cut happened)
    assert after < 4.33
    # sanity: blending back recovers the monthly average
    blended = (15 * 4.33 + 15 * after) / 30
    assert abs(blended - 4.20) < 1e-6


def test_fed_probability_chain():
    eng = FedProbabilityEngine(4.00, 4.25)
    meetings = [date(2026, 7, 29), date(2026, 9, 16)]
    prices = {"Jul2026": 95.80, "Sep2026": 95.95}  # implied ~4.20, ~4.05
    results = eng.compute_meeting_probabilities(prices, meetings)
    assert len(results) == 2
    for r in results:
        total = r.cut_prob + r.hold_prob + r.hike_prob
        assert abs(total - 1.0) < 1e-3
        assert -100 <= r.implied_move_bps <= 100


# --- Quality checks ----------------------------------------------------------


def test_quality_null_check():
    df = pl.DataFrame({"value": [1.0, None, 3.0, 4.0]})
    qc = QualityChecker()
    res = qc.check_nulls(df, "value", threshold=0.10)
    assert not res.passed  # 25% nulls > 10%
    assert res.rows_affected == 1


def test_quality_bounds_check():
    df = pl.DataFrame({"value": [2.0, 3.0, 999.0]})
    qc = QualityChecker()
    res = qc.check_bounds(df, "value", -20.0, 500.0)
    assert not res.passed
    assert res.rows_affected == 1


def test_quality_duplicate_check():
    df = pl.DataFrame({"id": ["a", "b", "b", "c"]})
    qc = QualityChecker()
    res = qc.check_duplicates(df, ["id"])
    assert not res.passed
    assert res.rows_affected == 1


def test_observation_id_deterministic():
    a = Transformer._observation_id("bis", "USA", "policy_rate", "2026-01-01", "latest")
    b = Transformer._observation_id("bis", "USA", "policy_rate", "2026-01-01", "latest")
    c = Transformer._observation_id("bis", "USA", "policy_rate", "2026-02-01", "latest")
    assert a == b
    assert a != c
    assert len(a) == 16
