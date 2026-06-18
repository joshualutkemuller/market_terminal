"""Connector layer: vendor-agnostic market & macro data adapters."""

from market_data_pipeline.src.connectors.base import (
    AdapterResult,
    MacroDataAdapter,
    MarketDataAdapter,
    RateLimiter,
    ResponseCache,
    ThrottledClient,
)
from market_data_pipeline.src.connectors.fred import FredConnector, fred_enabled
from market_data_pipeline.src.connectors.synthetic import SyntheticConnector
from market_data_pipeline.src.connectors.yahoo import YahooConnector

__all__ = [
    "MacroDataAdapter",
    "MarketDataAdapter",
    "AdapterResult",
    "RateLimiter",
    "ResponseCache",
    "ThrottledClient",
    "FredConnector",
    "fred_enabled",
    "YahooConnector",
    "SyntheticConnector",
]
