/**
 * Canonical data-provenance vocabulary for the whole terminal.
 *
 * Every feed across the app (econ/FRED, the market pipeline tiers, the Market
 * Lens engine, and the charting studios) reports where its data came from. This
 * module is the single source of truth for the badge a source maps to — its
 * label, tone, dot color, "live" status, and tooltip — so the same tier looks
 * and reads identically everywhere instead of drifting per module.
 *
 * Tiers, roughly best → fallback:
 *   FRED      live Federal Reserve (api.stlouisfed.org)
 *   LIVE      live market_data_pipeline FastAPI service
 *   DB        local pipeline database (DuckDB/Postgres analytics_api_views)
 *   FILE      local exported-file cache (mdp export-views)
 *   ETL       macro_data_etl gold tables (World Bank · BIS · CME)
 *   SNAPSHOT  committed build-time gold snapshot (FRED · Yahoo)
 *   ECON      deterministic econ model standing in for a macro level
 *   SIM       deterministic synthetic series (no real data available)
 *   LOADING   request in flight
 *   ERR       resolution failed
 */

export type ProvenanceSource =
  | "FRED"
  | "LIVE"
  | "DB"
  | "FILE"
  | "ETL"
  | "SNAPSHOT"
  | "ECON"
  | "SIM"
  | "LOADING"
  | "ERR";

export type ProvenanceTone = "live" | "snapshot" | "model" | "etl" | "loading" | "error";

export interface ProvenanceMeta {
  /** Short pill label shown to the user. */
  label: string;
  /** Whether this tier represents real, current data (drives the green pulse). */
  live: boolean;
  tone: ProvenanceTone;
  title: string;
}

export const PROVENANCE_META: Record<ProvenanceSource, ProvenanceMeta> = {
  FRED: { label: "LIVE · FRED", live: true, tone: "live", title: "Live data from FRED (api.stlouisfed.org)" },
  LIVE: { label: "LIVE · PIPELINE", live: true, tone: "live", title: "Live from the market_data_pipeline FastAPI service (MARKET_PIPELINE_URL)" },
  DB: { label: "LIVE · DB", live: true, tone: "live", title: "Local market_data_pipeline database — analytics_api_views (MARKET_DB_URL: DuckDB or Postgres)" },
  FILE: { label: "LIVE · FILE", live: true, tone: "live", title: "Local exported-file cache (MARKET_DATA_DIR — `mdp export-views`)" },
  ETL: { label: "ETL · MACRO", live: true, tone: "etl", title: "macro_data_etl gold tables (World Bank · BIS · CME FedWatch). Run the ETL with network access for live values." },
  SNAPSHOT: { label: "SNAPSHOT", live: false, tone: "snapshot", title: "Committed gold snapshot (FRED · Yahoo). Configure a live source for fresh data." },
  ECON: { label: "ECON MODEL", live: false, tone: "model", title: "Deterministic econ model standing in for this macro level (set FRED_API_KEY for live data)." },
  SIM: { label: "SIM", live: false, tone: "model", title: "Deterministic simulation — no real data available for this series." },
  LOADING: { label: "SYNC", live: false, tone: "loading", title: "Fetching…" },
  ERR: { label: "ERR", live: false, tone: "error", title: "Could not resolve this series." },
};

/** Resolve meta for any string, tolerating unknown codes (treated as SIM). */
export function provenanceMeta(source: string): ProvenanceMeta {
  return PROVENANCE_META[source as ProvenanceSource] ?? PROVENANCE_META.SIM;
}

/** Tailwind classes for each tone: [pill border+bg+text, dot bg]. */
export const PROVENANCE_TONE_CLASS: Record<ProvenanceTone, { pill: string; dot: string }> = {
  live: { pill: "border-term-up/40 bg-term-up/10 text-term-up", dot: "bg-term-up animate-blink" },
  snapshot: { pill: "border-term-violet/40 bg-term-violet/10 text-term-violet", dot: "bg-term-violet" },
  model: { pill: "border-term-amber/40 bg-term-amber/10 text-term-amber", dot: "bg-term-amber" },
  etl: { pill: "border-term-blue/40 bg-term-blue/10 text-term-blue", dot: "bg-term-blue" },
  loading: { pill: "border-term-border bg-term-panel-3 text-term-text-mute", dot: "bg-term-text-mute" },
  error: { pill: "border-term-down/40 bg-term-down/10 text-term-down", dot: "bg-term-down" },
};
