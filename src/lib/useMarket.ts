"use client";

import { useEffect, useState } from "react";
import { SNAPSHOTS, type MarketView } from "@/data/marketPipeline";

export type MarketSource = "LIVE" | "SNAPSHOT" | "LOADING";

/**
 * Resilient market_data_pipeline hook. Renders the committed gold snapshot
 * instantly (SSR-safe), then upgrades to the LIVE FastAPI service when
 * `/api/market/[view]` reports `source: "LIVE"` (i.e. MARKET_PIPELINE_URL is
 * configured). `source` drives a LIVE / SNAPSHOT badge.
 */
export function useMarketView<T>(view: MarketView): { data: T; source: MarketSource } {
  const [data, setData] = useState<T>(SNAPSHOTS[view] as unknown as T);
  const [source, setSource] = useState<MarketSource>("SNAPSHOT");

  useEffect(() => {
    let alive = true;
    setSource("LOADING");
    fetch(`/api/market/${view}`)
      .then((r) => r.json())
      .then((json) => {
        if (!alive) return;
        if (json?.data) setData(json.data as T);
        setSource(json?.source === "LIVE" ? "LIVE" : "SNAPSHOT");
      })
      .catch(() => {
        if (!alive) return;
        setSource("SNAPSHOT");
      });
    return () => {
      alive = false;
    };
  }, [view]);

  return { data, source };
}
