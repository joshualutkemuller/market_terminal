import { Rng } from "@/lib/rng";

/** Data health, lineage and provider-readiness console. */

export type ProviderStatus = "LIVE" | "CACHED" | "SIM" | "STALE" | "ERROR";
export type ProviderName = "FRED" | "YAHOO" | "MACRO_ETL" | "SYNTHETIC" | "LOCAL_BOOK";

export interface ProviderHealth {
  provider: ProviderName;
  status: ProviderStatus;
  coveragePct: number;
  freshnessMin: number;
  seriesCount: number;
  failedSeries: number;
  lastRun: string;
  upgradePath: string;
}

export interface ModuleCoverage {
  module: string;
  livePct: number;
  cachedPct: number;
  simPct: number;
  stalePct: number;
  readiness: number;
  blocker: string;
}

export interface DataQualityIssue {
  id: string;
  severity: "HIGH" | "MED" | "LOW";
  provider: ProviderName;
  dataset: string;
  check: string;
  detail: string;
  rowsImpacted: number;
}

export interface LineageRun {
  runId: string;
  source: ProviderName;
  dataset: string;
  rows: number;
  started: string;
  durationMs: number;
  status: "OK" | "PARTIAL" | "FAILED";
}

export interface DataOpsSummary {
  providersLive: number;
  totalProviders: number;
  averageCoverage: number;
  staleSeries: number;
  qualityIssues: number;
  productionReadyModules: number;
}

export function getProviderHealth(): ProviderHealth[] {
  return [
    { provider: "FRED", status: "LIVE", coveragePct: 88, freshnessMin: 12, seriesCount: 142, failedSeries: 3, lastRun: "2026-06-18 09:10", upgradePath: "Keep as official macro source" },
    { provider: "YAHOO", status: "CACHED", coveragePct: 74, freshnessMin: 64, seriesCount: 96, failedSeries: 8, lastRun: "2026-06-18 08:18", upgradePath: "Replace with Polygon, Tiingo, FactSet or Bloomberg" },
    { provider: "MACRO_ETL", status: "LIVE", coveragePct: 82, freshnessMin: 180, seriesCount: 44, failedSeries: 2, lastRun: "2026-06-18 06:30", upgradePath: "Add BIS, IMF, CME browser fetch hardening" },
    { provider: "LOCAL_BOOK", status: "SIM", coveragePct: 61, freshnessMin: 5, seriesCount: 38, failedSeries: 0, lastRun: "2026-06-18 09:17", upgradePath: "Connect custody, loan, margin and treasury books" },
    { provider: "SYNTHETIC", status: "LIVE", coveragePct: 100, freshnessMin: 0, seriesCount: 220, failedSeries: 0, lastRun: "deterministic", upgradePath: "Retain as explicit fallback provider" },
  ];
}

export function getModuleCoverage(): ModuleCoverage[] {
  return [
    { module: "ECON", livePct: 86, cachedPct: 8, simPct: 6, stalePct: 0, readiness: 91, blocker: "None" },
    { module: "SFE", livePct: 44, cachedPct: 18, simPct: 38, stalePct: 0, readiness: 68, blocker: "Repo GC and specials vendor feed" },
    { module: "REINV", livePct: 36, cachedPct: 24, simPct: 40, stalePct: 0, readiness: 64, blocker: "Actual cash ladder and MMF/repo positions" },
    { module: "LIQ", livePct: 32, cachedPct: 12, simPct: 52, stalePct: 4, readiness: 58, blocker: "Treasury source/use book" },
    { module: "COLL", livePct: 28, cachedPct: 10, simPct: 58, stalePct: 4, readiness: 55, blocker: "Eligibility schedules and collateral pricing" },
    { module: "SLAB", livePct: 18, cachedPct: 20, simPct: 62, stalePct: 0, readiness: 48, blocker: "Loanet/EquiLend/DataLend rate feed" },
    { module: "REGIME", livePct: 62, cachedPct: 22, simPct: 16, stalePct: 0, readiness: 76, blocker: "Backtest and saved playbook overrides" },
    { module: "OPT", livePct: 12, cachedPct: 8, simPct: 80, stalePct: 0, readiness: 42, blocker: "Real solver service and persisted runs" },
  ];
}

export function getDataQualityIssues(): DataQualityIssue[] {
  return [
    { id: "DQ-401", severity: "HIGH", provider: "YAHOO", dataset: "market_prices", check: "stale close", detail: "Seven ETF proxies are older than expected cache window.", rowsImpacted: 7 },
    { id: "DQ-402", severity: "MED", provider: "FRED", dataset: "credit_spreads", check: "missing observation", detail: "HY OAS has one missing print in the 20y window.", rowsImpacted: 1 },
    { id: "DQ-403", severity: "MED", provider: "LOCAL_BOOK", dataset: "collateral_assets", check: "synthetic source", detail: "Collateral schedules are fixture generated.", rowsImpacted: 42 },
    { id: "DQ-404", severity: "LOW", provider: "MACRO_ETL", dataset: "fed_probabilities", check: "fallback curve", detail: "CME live settlements unavailable; deterministic futures curve used.", rowsImpacted: 6 },
    { id: "DQ-405", severity: "LOW", provider: "SYNTHETIC", dataset: "demo_books", check: "expected fallback", detail: "Offline fallback active for non-public desk books.", rowsImpacted: 220 },
  ];
}

export function getLineageRuns(): LineageRun[] {
  const rng = new Rng("dataops-lineage");
  const defs: [ProviderName, string, LineageRun["status"]][] = [
    ["FRED", "series_observations", "OK"],
    ["YAHOO", "chart_daily", "PARTIAL"],
    ["MACRO_ETL", "fed_probabilities", "OK"],
    ["MACRO_ETL", "policy_rates", "OK"],
    ["LOCAL_BOOK", "desk_books_fixture", "OK"],
    ["SYNTHETIC", "fallback_generators", "OK"],
  ];
  return defs.map(([source, dataset, status], i) => ({
    runId: `RUN-${7800 - i}`,
    source,
    dataset,
    rows: rng.int(180, 18000),
    started: `2026-06-18 0${8 - Math.min(i, 3)}:${String(12 + i * 7).padStart(2, "0")}`,
    durationMs: rng.int(80, 4200),
    status,
  }));
}

export function getDataOpsSummary(): DataOpsSummary {
  const providers = getProviderHealth();
  const modules = getModuleCoverage();
  const issues = getDataQualityIssues();
  return {
    providersLive: providers.filter((p) => p.status === "LIVE").length,
    totalProviders: providers.length,
    averageCoverage: providers.reduce((a, p) => a + p.coveragePct, 0) / providers.length,
    staleSeries: providers.reduce((a, p) => a + p.failedSeries, 0),
    qualityIssues: issues.filter((i) => i.severity !== "LOW").length,
    productionReadyModules: modules.filter((m) => m.readiness >= 75).length,
  };
}
