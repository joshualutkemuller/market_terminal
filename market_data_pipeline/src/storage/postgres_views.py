"""Publish terminal view payloads from DuckDB to Postgres.

The Next.js app reads ``analytics_api_views`` directly when ``MARKET_DB_URL`` is
set to a Postgres URL. The pipeline's canonical writer is DuckDB, so this module
copies the compact serving table into Postgres after each refresh.
"""

from __future__ import annotations

from typing import Any

from market_data_pipeline.src.storage.duckdb_store import DuckDBStore


DDL = """
CREATE TABLE IF NOT EXISTS analytics_api_views (
  view TEXT PRIMARY KEY,
  payload_json TEXT,
  as_of DATE,
  ingestion_run_id TEXT,
  updated_at TIMESTAMP
)
"""


UPSERT = """
INSERT INTO analytics_api_views (view, payload_json, as_of, ingestion_run_id, updated_at)
VALUES (%s, %s, %s, %s, %s)
ON CONFLICT (view) DO UPDATE SET
  payload_json = EXCLUDED.payload_json,
  as_of = EXCLUDED.as_of,
  ingestion_run_id = EXCLUDED.ingestion_run_id,
  updated_at = EXCLUDED.updated_at
"""


def _load_psycopg() -> Any:
    try:
        import psycopg  # type: ignore

        return psycopg
    except Exception as exc:  # noqa: BLE001 - provide a clearer optional-dep error
        raise RuntimeError(
            "psycopg is required to publish views to Postgres. "
            "Install with: pip install psycopg[binary]"
        ) from exc


def publish_api_views(db_url: str, source: DuckDBStore, create_table: bool = True) -> dict[str, Any]:
    """Upsert DuckDB ``analytics_api_views`` rows into a Postgres database."""
    rows = source.query(
        """
        SELECT view, payload_json, as_of, ingestion_run_id, updated_at
        FROM analytics_api_views
        ORDER BY view
        """
    ).to_dicts()

    if not rows:
        return {"published": 0, "views": []}

    psycopg = _load_psycopg()
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            if create_table:
                cur.execute(DDL)
            cur.executemany(
                UPSERT,
                [
                    (
                        row["view"],
                        row["payload_json"],
                        row["as_of"],
                        row["ingestion_run_id"],
                        row["updated_at"],
                    )
                    for row in rows
                ],
            )
        conn.commit()

    return {"published": len(rows), "views": [row["view"] for row in rows]}
