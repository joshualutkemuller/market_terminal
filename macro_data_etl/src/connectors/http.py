"""HTTP client helpers for macro connectors."""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)

PROXY_ENV_KEYS = ("FRED_PROXY_URL", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy")
PROXY_FALLBACK_STATUSES = {403, 407, 429, 502, 503, 504}


def _proxy_env_present() -> bool:
    return any(os.environ.get(key, "").strip() for key in PROXY_ENV_KEYS)


class FallbackHTTPClient:
    """Small httpx wrapper that retries direct when the proxy/env path fails."""

    def __init__(self, **kwargs: Any) -> None:
        self._proxy_env_present = _proxy_env_present()
        self._client = httpx.Client(**kwargs)
        self._direct_client = httpx.Client(**kwargs, trust_env=False)

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        try:
            resp = self._client.get(url, **kwargs)
            if self._proxy_env_present and resp.status_code in PROXY_FALLBACK_STATUSES:
                logger.warning(
                    "HTTP %s via proxy-aware environment for %s; retrying direct",
                    resp.status_code,
                    url,
                )
                return self._direct_client.get(url, **kwargs)
            return resp
        except httpx.TransportError as exc:
            if not self._proxy_env_present:
                raise
            logger.warning("Transport error via proxy-aware environment for %s; retrying direct: %s", url, exc)
            return self._direct_client.get(url, **kwargs)

    def close(self) -> None:
        self._client.close()
        self._direct_client.close()

    @property
    def headers(self) -> httpx.Headers:
        return self._client.headers
