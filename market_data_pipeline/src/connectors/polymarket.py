"""Polymarket CLOB + Gamma API connector.

Polymarket exposes two public APIs (no auth required):
  - **Gamma API** (gamma-api.polymarket.com) — event/market metadata, categories,
    rich descriptions, outcome prices.
  - **CLOB API** (clob.polymarket.com) — order-book data, price history, spreads.

This connector fetches active prediction markets and price histories, returning
data compatible with the pipeline's adapter contract.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any

from .base import RateLimiter, ResponseCache, ThrottledClient

logger = logging.getLogger("market_data_pipeline.connectors.polymarket")

GAMMA_BASE = "https://gamma-api.polymarket.com"
CLOB_BASE = "https://clob.polymarket.com"


@dataclass
class PolymarketMarket:
    condition_id: str
    question: str
    category: str
    yes_price: float
    no_price: float
    spread: float
    volume_24h: float
    total_volume: float
    liquidity: float
    end_date: str
    active: bool


@dataclass
class PolymarketPricePoint:
    timestamp: int
    price: float


class PolymarketConnector:
    """Public Polymarket API connector with rate limiting and caching."""

    def __init__(
        self,
        rate: float = 2.0,
        cache_ttl_hours: int = 1,
    ) -> None:
        self._client = ThrottledClient(rate=rate, timeout=10.0)
        self._cache = ResponseCache()
        self._cache_ttl = cache_ttl_hours

    def fetch_markets(
        self,
        limit: int = 100,
        active: bool = True,
        category: str | None = None,
    ) -> list[PolymarketMarket]:
        cache_key = ResponseCache.make_key(
            "polymarket", "markets", f"active={active}&limit={limit}", {}
        )
        cached = self._cache.get(cache_key, ttl_hours=self._cache_ttl)
        if cached is not None:
            return self._parse_markets(cached, category)

        params: dict[str, Any] = {
            "active": str(active).lower(),
            "closed": "false",
            "limit": str(limit),
        }
        resp = self._client.get(f"{GAMMA_BASE}/markets", params=params)
        data = resp.json()
        self._cache.set(cache_key, data)
        return self._parse_markets(data, category)

    def fetch_events(
        self,
        limit: int = 50,
        active: bool = True,
    ) -> list[dict[str, Any]]:
        cache_key = ResponseCache.make_key(
            "polymarket", "events", f"active={active}&limit={limit}", {}
        )
        cached = self._cache.get(cache_key, ttl_hours=self._cache_ttl)
        if cached is not None:
            return cached if isinstance(cached, list) else []

        params: dict[str, Any] = {
            "active": str(active).lower(),
            "closed": "false",
            "limit": str(limit),
        }
        resp = self._client.get(f"{GAMMA_BASE}/events", params=params)
        data = resp.json()
        self._cache.set(cache_key, data)
        return data if isinstance(data, list) else []

    def fetch_price_history(
        self,
        token_id: str,
        interval: str = "1d",
        fidelity: int = 60,
    ) -> list[PolymarketPricePoint]:
        cache_key = ResponseCache.make_key(
            "polymarket", "price_history", token_id, {"interval": interval}
        )
        cached = self._cache.get(cache_key, ttl_hours=self._cache_ttl)
        if cached is not None:
            return self._parse_history(cached)

        params: dict[str, Any] = {
            "market": token_id,
            "interval": interval,
            "fidelity": str(fidelity),
        }
        resp = self._client.get(f"{CLOB_BASE}/prices-history", params=params)
        data = resp.json()
        self._cache.set(cache_key, data)
        return self._parse_history(data)

    def _parse_markets(
        self, data: Any, category: str | None = None
    ) -> list[PolymarketMarket]:
        if not isinstance(data, list):
            return []
        markets: list[PolymarketMarket] = []
        for item in data:
            try:
                cat = item.get("category", "Other")
                if category and cat.lower() != category.lower():
                    continue
                prices = item.get("outcomePrices", "[]")
                if isinstance(prices, str):
                    import json as _json
                    prices = _json.loads(prices)
                yes_price = float(prices[0]) if len(prices) > 0 else 0.5
                no_price = float(prices[1]) if len(prices) > 1 else 1.0 - yes_price

                markets.append(
                    PolymarketMarket(
                        condition_id=item.get("conditionId", item.get("id", "")),
                        question=item.get("question", ""),
                        category=cat,
                        yes_price=yes_price,
                        no_price=no_price,
                        spread=float(item.get("spread", 0.02)),
                        volume_24h=float(item.get("volume24hr", 0)),
                        total_volume=float(item.get("volume", 0)),
                        liquidity=float(item.get("liquidity", 0)),
                        end_date=str(item.get("endDate", ""))[:10],
                        active=bool(item.get("active", True)),
                    )
                )
            except (ValueError, KeyError, IndexError) as exc:
                logger.debug("Skipping malformed Polymarket market: %s", exc)
        return markets

    def _parse_history(self, data: Any) -> list[PolymarketPricePoint]:
        history = data.get("history", []) if isinstance(data, dict) else []
        points: list[PolymarketPricePoint] = []
        for item in history:
            try:
                points.append(
                    PolymarketPricePoint(
                        timestamp=int(item.get("t", 0)),
                        price=float(item.get("p", 0)),
                    )
                )
            except (ValueError, KeyError):
                continue
        return points
