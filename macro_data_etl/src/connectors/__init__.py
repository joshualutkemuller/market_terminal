"""Connectors for global macro data sources."""

from macro_data_etl.src.connectors.bis import BISConfig, BISConnector
from macro_data_etl.src.connectors.cme import CMEConfig, CMEConnector
from macro_data_etl.src.connectors.imf import IMFConfig, IMFConnector
from macro_data_etl.src.connectors.world_bank import WorldBankConfig, WorldBankConnector

__all__ = [
    "BISConfig",
    "BISConnector",
    "CMEConfig",
    "CMEConnector",
    "IMFConfig",
    "IMFConnector",
    "WorldBankConfig",
    "WorldBankConnector",
]
