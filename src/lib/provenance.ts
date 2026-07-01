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
  | "POLY"
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
  POLY: { label: "LIVE · POLY", live: true, tone: "live", title: "Live from Polymarket CLOB + Gamma APIs (public, no auth)" },
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

/**
 * Freshness of a dated observation, independent of its source tier. A live
 * pipeline can still serve stale data (no recent ingestion), and a committed
 * snapshot is fresh on the day it was cut — so freshness is classified from the
 * `asOf` date, not the source. This is what stops an old snapshot from looking
 * current (the "snapshot fallback can look current" risk in the readiness doc).
 */
export type Freshness = "FRESH" | "AGING" | "STALE" | "UNKNOWN";

export interface FreshnessInfo {
  status: Freshness;
  /** Whole calendar days between `asOf` and now, or `null` if unparseable. */
  ageDays: number | null;
  /** Compact marker, e.g. "6d" or "STALE · 21d" (empty when fresh/unknown). */
  label: string;
  title: string;
}

/**
 * Classify an `asOf` (YYYY-MM-DD or ISO) by age. Daily market closes tolerate a
 * few days (weekends/holidays) before they are "aging"; defaults: fresh ≤ 4d,
 * aging ≤ 10d, stale beyond that.
 */
export function classifyFreshness(
  asOf: string | null | undefined,
  opts: { freshDays?: number; agingDays?: number; now?: Date } = {}
): FreshnessInfo {
  const freshDays = opts.freshDays ?? 4;
  const agingDays = opts.agingDays ?? 10;
  if (!asOf) return { status: "UNKNOWN", ageDays: null, label: "", title: "No as-of date reported for this data." };
  const ts = Date.parse(asOf.length <= 10 ? `${asOf}T00:00:00Z` : asOf);
  if (!Number.isFinite(ts)) return { status: "UNKNOWN", ageDays: null, label: "", title: `Unparseable as-of date: ${asOf}` };
  const now = opts.now ?? new Date();
  const ageDays = Math.max(0, Math.floor((now.getTime() - ts) / 86_400_000));
  if (ageDays <= freshDays) return { status: "FRESH", ageDays, label: "", title: `Data as of ${asOf} (${ageDays}d ago) — current.` };
  if (ageDays <= agingDays) return { status: "AGING", ageDays, label: `${ageDays}d`, title: `Data as of ${asOf} (${ageDays}d ago) — aging; check upstream refresh.` };
  return { status: "STALE", ageDays, label: `STALE · ${ageDays}d`, title: `Data as of ${asOf} (${ageDays}d ago) — stale; upstream has not refreshed.` };
}

/**
 * Given an array of source strings, return the worst (lowest-tier) source.
 * Tier order: FRED > LIVE > DB > FILE > ETL > SNAPSHOT > ECON > SIM.
 * If any source is SIM, the overall source is SIM.
 * If sources are mixed across live/non-live, returns the worst one present.
 */
const SOURCE_TIER: Record<string, number> = {
  FRED: 0, LIVE: 1, POLY: 2, DB: 3, FILE: 4, ETL: 5, SNAPSHOT: 6, ECON: 7, SIM: 8,
};

export function worstSource<T extends string>(sources: T[]): T {
  if (!sources.length) return "SIM" as T;
  let worst = sources[0];
  let worstTier = SOURCE_TIER[worst] ?? 8;
  for (let i = 1; i < sources.length; i++) {
    const tier = SOURCE_TIER[sources[i]] ?? 8;
    if (tier > worstTier) { worst = sources[i]; worstTier = tier; }
  }
  return worst;
}

/** Tailwind classes for the non-fresh freshness states: [pill, dot]. */
export const FRESHNESS_TONE_CLASS: Record<"AGING" | "STALE", { pill: string; dot: string }> = {
  AGING: { pill: "border-term-amber/40 bg-term-amber/10 text-term-amber", dot: "bg-term-amber" },
  STALE: { pill: "border-term-down/40 bg-term-down/10 text-term-down", dot: "bg-term-down" },
};

/** Tailwind classes for each tone: [pill border+bg+text, dot bg]. */
export const PROVENANCE_TONE_CLASS: Record<ProvenanceTone, { pill: string; dot: string }> = {
  live: { pill: "border-term-up/40 bg-term-up/10 text-term-up", dot: "bg-term-up animate-blink" },
  snapshot: { pill: "border-term-violet/40 bg-term-violet/10 text-term-violet", dot: "bg-term-violet" },
  model: { pill: "border-term-amber/40 bg-term-amber/10 text-term-amber", dot: "bg-term-amber" },
  etl: { pill: "border-term-blue/40 bg-term-blue/10 text-term-blue", dot: "bg-term-blue" },
  loading: { pill: "border-term-border bg-term-panel-3 text-term-text-mute", dot: "bg-term-text-mute" },
  error: { pill: "border-term-down/40 bg-term-down/10 text-term-down", dot: "bg-term-down" },
};
