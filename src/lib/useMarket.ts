"use client";

import { useEffect, useState } from "react";
import { SNAPSHOTS, type MarketView } from "@/data/marketPipeline";

export type MarketSource = "LIVE" | "DB" | "FILE" | "SNAPSHOT" | "LOADING";

/**
 * Resilient market_data_pipeline hook. Renders the committed gold snapshot
 * instantly (SSR-safe), then upgrades to whatever `/api/market/[view]` resolves:
 * a local DuckDB/Postgres cache (DB), an exported-file cache (FILE), the live
 * FastAPI service (LIVE), or the bundled snapshot (SNAPSHOT). `source` drives
 * the provenance badge.
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
  }, [view]);

  return { data, source };
}
