"""Adapters wrapping existing market_data_pipeline connectors."""

from .yahoo_adapter import YahooAdapter
from .fred_adapter import FredAdapter
from .proxy_resolver import ProxyResolver

__all__ = ["YahooAdapter", "FredAdapter", "ProxyResolver"]
