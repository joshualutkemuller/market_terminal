"""News ingestion for the market data pipeline.

Fetches headlines from configured providers (Finnhub free tier preferred
for batch), normalizes to the gold schema, and stores in the warehouse.
Runs on each pipeline batch cycle (every 15-30 min when configured).

Env keys (same as the frontend provider chain):
  FINNHUB_API_KEY      — Finnhub /news (general market news, 60 calls/min free)
  ALPHAVANTAGE_API_KEY — Alpha Vantage NEWS_SENTIMENT
  NEWSAPI_API_KEY      — NewsAPI.org /top-headlines

Only one key is needed; the module tries each in order.
"""

from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone
from typing import Any

import requests

# ---------------------------------------------------------------------------
# Keyword-based sentiment & asset-class inference
# ---------------------------------------------------------------------------

_BULLISH_KW = re.compile(
    r"\b(surge|rally|jump|gain|beat|record|boom|soar|upgrade|bull|optimis|"
    r"rebound|breakout|outperform|positive|accelerat|strong|climbs?|rises?)\b",
    re.IGNORECASE,
)
_BEARISH_KW = re.compile(
    r"\b(slide|drop|plunge|slump|crash|cut|miss|downgrade|bear|pessimis|"
    r"selloff|sell-off|tumble|fall|fear|stress|default|recession|decline|weak)\b",
    re.IGNORECASE,
)

_TICKER_RE = re.compile(r"\b([A-Z]{1,5})\b")
_KNOWN_TICKERS = {
    "AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "JPM", "BAC",
    "GS", "WFC", "XOM", "CVX", "GLD", "SPY", "QQQ", "TLT", "HYG", "BTC",
    "ETH", "GME", "AMC", "SMCI", "DIS", "NFLX", "AMD", "INTC", "PYPL",
}

_ASSET_CLASS_KW: dict[str, re.Pattern[str]] = {
    "RATES": re.compile(r"\b(treasury|yield|bond|auction|fed fund|rate cut|rate hike|fomc)\b", re.I),
    "CREDIT": re.compile(r"\b(credit|spread|high.?yield|default|CLO|IG|HY)\b", re.I),
    "COMMODITY": re.compile(r"\b(oil|crude|gold|copper|commodity|opec|nat gas|wheat|corn)\b", re.I),
    "FX": re.compile(r"\b(dollar|euro|yen|sterling|forex|currency|DXY)\b", re.I),
    "CRYPTO": re.compile(r"\b(bitcoin|crypto|ethereum|BTC|ETH|stablecoin|digital.?asset)\b", re.I),
    "MACRO": re.compile(r"\b(GDP|inflation|CPI|payroll|unemployment|PMI|ISM|retail sales|jobless)\b", re.I),
}


def _infer_sentiment(text: str) -> tuple[str, float]:
    bull = len(_BULLISH_KW.findall(text))
    bear = len(_BEARISH_KW.findall(text))
    total = bull + bear
    if total == 0:
        return "NEUTRAL", 0.0
    score = round((bull - bear) / total, 2)
    if score > 0.15:
        return "BULLISH", score
    if score < -0.15:
        return "BEARISH", score
    return "NEUTRAL", score


def _infer_tickers(text: str) -> list[str]:
    return [m for m in _TICKER_RE.findall(text) if m in _KNOWN_TICKERS][:5]


def _infer_asset_class(text: str, tickers: list[str]) -> str:
    for ac, pat in _ASSET_CLASS_KW.items():
        if pat.search(text):
            return ac
    if tickers:
        return "EQUITY"
    return "MACRO"


def _headline_id(text: str, source: str) -> str:
    return hashlib.md5(f"{text}:{source}".encode()).hexdigest()[:12]


def _importance_from_text(text: str) -> int:
    score = 50
    if any(w in text.lower() for w in ("breaking", "record", "crash", "surge", "plunge")):
        score += 25
    if any(w in text.lower() for w in ("fed", "fomc", "cpi", "gdp", "payroll")):
        score += 15
    return min(99, max(10, score))


# ---------------------------------------------------------------------------
# Provider fetchers
# ---------------------------------------------------------------------------

_SESSION = requests.Session()
_TIMEOUT = 10


def fetch_finnhub(n: int = 50) -> list[dict]:
    key = os.environ.get("FINNHUB_API_KEY", "")
    if not key:
        return []
    resp = _SESSION.get(
        "https://finnhub.io/api/v1/news",
        params={"category": "general", "token": key},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    items = resp.json()[:n]
    out: list[dict] = []
    for item in items:
        text = item.get("headline", "")
        if not text:
            continue
        tickers = _infer_tickers(text)
        sentiment, score = _infer_sentiment(text)
        ts = datetime.fromtimestamp(item.get("datetime", 0), tz=timezone.utc)
        out.append({
            "id": _headline_id(text, "Finnhub"),
            "time": ts.strftime("%H:%M"),
            "headline": text,
            "source": item.get("source", "Finnhub"),
            "url": item.get("url", ""),
            "asset_class": _infer_asset_class(text, tickers),
            "tickers": tickers,
            "sentiment": sentiment,
            "sentiment_score": score,
            "importance": _importance_from_text(text),
        })
    return out


def fetch_alphavantage(n: int = 50) -> list[dict]:
    key = os.environ.get("ALPHAVANTAGE_API_KEY", "")
    if not key:
        return []
    resp = _SESSION.get(
        "https://www.alphavantage.co/query",
        params={"function": "NEWS_SENTIMENT", "apikey": key, "limit": str(n)},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json()
    items = data.get("feed", [])[:n]
    out: list[dict] = []
    for item in items:
        text = item.get("title", "")
        if not text:
            continue
        av_score = float(item.get("overall_sentiment_score", 0))
        if av_score != 0:
            sentiment = "BULLISH" if av_score > 0.15 else "BEARISH" if av_score < -0.15 else "NEUTRAL"
            score = round(av_score, 2)
        else:
            sentiment, score = _infer_sentiment(text)
        raw_tickers = [t.get("ticker", "") for t in item.get("ticker_sentiment", [])]
        tickers = [t for t in raw_tickers if t in _KNOWN_TICKERS][:5] or _infer_tickers(text)
        ts_str = item.get("time_published", "")
        try:
            ts = datetime.strptime(ts_str[:15], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
        except (ValueError, IndexError):
            ts = datetime.now(timezone.utc)
        out.append({
            "id": _headline_id(text, "Alpha Vantage"),
            "time": ts.strftime("%H:%M"),
            "headline": text,
            "source": "Alpha Vantage",
            "url": item.get("url", ""),
            "asset_class": _infer_asset_class(text, tickers),
            "tickers": tickers,
            "sentiment": sentiment,
            "sentiment_score": score,
            "importance": _importance_from_text(text),
        })
    return out


def fetch_newsapi(n: int = 50) -> list[dict]:
    key = os.environ.get("NEWSAPI_API_KEY", "")
    if not key:
        return []
    resp = _SESSION.get(
        "https://newsapi.org/v2/top-headlines",
        params={"category": "business", "language": "en", "pageSize": str(min(n, 100)), "apiKey": key},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    items = resp.json().get("articles", [])[:n]
    out: list[dict] = []
    for item in items:
        text = item.get("title", "")
        if not text:
            continue
        tickers = _infer_tickers(text)
        sentiment, score = _infer_sentiment(text)
        ts_str = item.get("publishedAt", "")
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            ts = datetime.now(timezone.utc)
        out.append({
            "id": _headline_id(text, "NewsAPI"),
            "time": ts.strftime("%H:%M"),
            "headline": text,
            "source": (item.get("source") or {}).get("name", "NewsAPI"),
            "url": item.get("url", ""),
            "asset_class": _infer_asset_class(text, tickers),
            "tickers": tickers,
            "sentiment": sentiment,
            "sentiment_score": score,
            "importance": _importance_from_text(text),
        })
    return out


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def ingest_news(n: int = 50) -> dict[str, Any]:
    """Try each provider in order; return the first that succeeds.

    Returns ``{"source": str, "headlines": list[dict], "fetched_at": str}``.
    """
    providers: list[tuple[str, Any]] = [
        ("Finnhub", fetch_finnhub),
        ("Alpha Vantage", fetch_alphavantage),
        ("NewsAPI", fetch_newsapi),
    ]
    for name, fetcher in providers:
        try:
            headlines = fetcher(n)
            if headlines:
                return {
                    "source": name,
                    "headlines": headlines,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
        except Exception:
            continue
    return {
        "source": "NONE",
        "headlines": [],
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Export snapshot (frontend-compatible shape)
# ---------------------------------------------------------------------------

def export_news_snapshot(headlines: list[dict]) -> dict[str, Any]:
    """Format headlines for JSON export matching what the frontend expects.

    Maps snake_case pipeline fields to the camelCase Headline interface used
    by ``src/data/news.ts`` / ``useNews``.
    """
    mapped = []
    for h in headlines:
        mapped.append({
            "id": h.get("id", ""),
            "time": h.get("time", ""),
            "headline": h.get("headline", ""),
            "source": h.get("source", ""),
            "assetClass": h.get("asset_class", "MACRO"),
            "tickers": h.get("tickers", []),
            "sentiment": h.get("sentiment", "NEUTRAL"),
            "sentimentScore": h.get("sentiment_score", 0),
            "importance": h.get("importance", 50),
            "impact": h.get("importance", 50),
            "region": "US",
            "minutesAgo": 0,
        })
    return {"headlines": mapped}
