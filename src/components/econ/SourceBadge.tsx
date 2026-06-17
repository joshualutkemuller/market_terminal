"use client";

import clsx from "clsx";
import type { DataSource } from "@/lib/useEcon";

/** LIVE (FRED) / SIM data-provenance pill shown on econ panels. */
export function SourceBadge({ source, className }: { source: DataSource; className?: string }) {
  const live = source === "FRED";
  const loading = source === "LOADING";
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-3xs font-semibold uppercase tracking-wide",
        live ? "border-term-up/40 bg-term-up/10 text-term-up" : loading ? "border-term-border bg-term-panel-3 text-term-text-mute" : "border-term-amber/40 bg-term-amber/10 text-term-amber",
        className
      )}
      title={live ? "Live data from FRED (api.stlouisfed.org)" : loading ? "Fetching…" : "Deterministic simulation (set FRED_API_KEY for live data)"}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", live ? "bg-term-up animate-blink" : loading ? "bg-term-text-mute" : "bg-term-amber")} />
      {live ? "LIVE · FRED" : loading ? "SYNC" : "SIM"}
    </span>
  );
}
