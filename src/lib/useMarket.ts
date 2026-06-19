"use client";

import { useEffect, useState } from "react";
import { PRICE_SNAPSHOTS, SNAPSHOTS, type MarketView, type ReturnBasis } from "@/data/marketPipeline";

export type MarketSource = "LIVE" | "DB" | "FILE" | "SNAPSHOT" | "LOADING";

/**
 * Resilient market_data_pipeline hook. Renders the committed gold snapshot
 * instantly (SSR-safe), then upgrades to whatever `/api/market/[view]` resolves:
 * a local DuckDB/Postgres cache (DB), an exported-file cache (FILE), the live
 * FastAPI service (LIVE), or the bundled snapshot (SNAPSHOT). `source` drives
 * the provenance badge.
 */
function fallbackSnapshot(view: MarketView, basis: ReturnBasis): unknown {
  if (basis === "price" && view in PRICE_SNAPSHOTS) return PRICE_SNAPSHOTS[view as keyof typeof PRICE_SNAPSHOTS];
  return SNAPSHOTS[view];
}

export function useMarketView<T>(view: MarketView, basis: ReturnBasis = "total"): { data: T; source: MarketSource } {
  const [data, setData] = useState<T>(fallbackSnapshot(view, basis) as T);
  const [source, setSource] = useState<MarketSource>("SNAPSHOT");

  useEffect(() => {
    let alive = true;
    setData(fallbackSnapshot(view, basis) as T);
    setSource("LOADING");
    fetch(`/api/market/${view}?basis=${basis}`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json?.data) setData(json.data as T);
        const s = json?.source;
        setSource(s === "LIVE" || s === "DB" || s === "FILE" ? s : "SNAPSHOT");
      })
      .catch(() => {
        if (!alive) return;
        setSource("SNAPSHOT");
      });
    return () => {
      alive = false;
    };
  }, [view, basis]);

  return { data, source };
}
