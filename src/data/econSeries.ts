import { Rng } from "@/lib/rng";

/**
 * Economics data — FRED series catalog + headline macro indicators.
 *
 * Live mode: the /api/econ/* route handlers fetch real observations from FRED
 * (api.stlouisfed.org) when FRED_API_KEY is configured. This module is the
 * deterministic simulation layer that (a) renders instantly with zero config and
 * (b) is the fallback when no key / no network egress is available. Values are
 * anchored to a plausible mid-2026 macro regime (post-tightening normalization).
 */

export type EconCategory = "GROWTH" | "INFLATION" | "LABOR" | "RATES" | "HOUSING" | "CONSUMER" | "MONEY" | "ACTIVITY";

export interface FredSeries {
  id: string; // FRED series id
  label: string;
  short: string;
  unit: string;
  category: EconCategory;
  freq: "D" | "W" | "M" | "Q";
  decimals: number;
  /** realistic latest level for the simulation layer */
  level: number;
  /** typical month/period change magnitude (for walk vol) */
  vol: number;
  /** "higher is better" for color semantics; null = neutral */
  bullish: boolean | null;
}

export const FRED_CATALOG: FredSeries[] = [
  // Growth / activity
  { id: "GDPC1", label: "Real GDP (SAAR)", short: "Real GDP", unit: "% q/q ann.", category: "GROWTH", freq: "Q", decimals: 1, level: 2.1, vol: 0.6, bullish: true },
  { id: "GDPNOW", label: "GDPNow Nowcast", short: "GDPNow", unit: "% q/q ann.", category: "GROWTH", freq: "Q", decimals: 1, level: 2.4, vol: 0.5, bullish: true },
  { id: "INDPRO", label: "Industrial Production", short: "Ind. Prod.", unit: "% m/m", category: "ACTIVITY", freq: "M", decimals: 1, level: 0.2, vol: 0.4, bullish: true },
  { id: "ISM-MFG", label: "ISM Manufacturing PMI", short: "ISM Mfg", unit: "index", category: "ACTIVITY", freq: "M", decimals: 1, level: 49.2, vol: 1.2, bullish: true },
  { id: "ISM-SVC", label: "ISM Services PMI", short: "ISM Svcs", unit: "index", category: "ACTIVITY", freq: "M", decimals: 1, level: 52.6, vol: 1.1, bullish: true },
  // Inflation
  { id: "CPIAUCSL", label: "CPI (headline, YoY)", short: "CPI", unit: "% y/y", category: "INFLATION", freq: "M", decimals: 1, level: 2.6, vol: 0.2, bullish: false },
  { id: "CPILFESL", label: "Core CPI (YoY)", short: "Core CPI", unit: "% y/y", category: "INFLATION", freq: "M", decimals: 1, level: 3.0, vol: 0.15, bullish: false },
  { id: "PCEPI", label: "PCE Price Index (YoY)", short: "PCE", unit: "% y/y", category: "INFLATION", freq: "M", decimals: 1, level: 2.3, vol: 0.15, bullish: false },
  { id: "PCEPILFE", label: "Core PCE (YoY)", short: "Core PCE", unit: "% y/y", category: "INFLATION", freq: "M", decimals: 1, level: 2.6, vol: 0.12, bullish: false },
  { id: "T5YIE", label: "5y Breakeven Inflation", short: "5y B/E", unit: "%", category: "INFLATION", freq: "D", decimals: 2, level: 2.34, vol: 0.05, bullish: null },
  // Labor
  { id: "UNRATE", label: "Unemployment Rate", short: "U-3", unit: "%", category: "LABOR", freq: "M", decimals: 1, level: 4.3, vol: 0.1, bullish: false },
  { id: "PAYEMS", label: "Nonfarm Payrolls (chg)", short: "NFP", unit: "k m/m", category: "LABOR", freq: "M", decimals: 0, level: 138, vol: 60, bullish: true },
  { id: "ICSA", label: "Initial Jobless Claims", short: "Claims", unit: "k", category: "LABOR", freq: "W", decimals: 0, level: 233, vol: 14, bullish: false },
  { id: "CES0500000003", label: "Avg Hourly Earnings (YoY)", short: "AHE", unit: "% y/y", category: "LABOR", freq: "M", decimals: 1, level: 3.9, vol: 0.2, bullish: null },
  { id: "JTSJOL", label: "Job Openings (JOLTS)", short: "Openings", unit: "M", category: "LABOR", freq: "M", decimals: 1, level: 7.4, vol: 0.3, bullish: true },
  // Rates / money
  { id: "FEDFUNDS", label: "Effective Fed Funds Rate", short: "EFFR", unit: "%", category: "RATES", freq: "M", decimals: 2, level: 4.08, vol: 0.02, bullish: null },
  { id: "SOFR", label: "SOFR", short: "SOFR", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 4.31, vol: 0.03, bullish: null },
  { id: "DGS2", label: "2-Year Treasury", short: "UST 2Y", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 3.74, vol: 0.04, bullish: null },
  { id: "DGS10", label: "10-Year Treasury", short: "UST 10Y", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 4.11, vol: 0.04, bullish: null },
  { id: "T10Y2Y", label: "10Y-2Y Spread", short: "2s10s", unit: "bps", category: "RATES", freq: "D", decimals: 0, level: 37, vol: 4, bullish: null },
  { id: "T10Y3M", label: "10Y-3M Spread", short: "3m10y", unit: "bps", category: "RATES", freq: "D", decimals: 0, level: -14, vol: 5, bullish: null },
  { id: "BAMLH0A0HYM2", label: "HY Credit Spread (OAS)", short: "HY OAS", unit: "bps", category: "RATES", freq: "D", decimals: 0, level: 312, vol: 12, bullish: false },
  // Consumer / housing / money
  { id: "RSAFS", label: "Retail Sales", short: "Retail", unit: "% m/m", category: "CONSUMER", freq: "M", decimals: 1, level: 0.3, vol: 0.4, bullish: true },
  { id: "UMCSENT", label: "U. Mich Consumer Sentiment", short: "Sentiment", unit: "index", category: "CONSUMER", freq: "M", decimals: 1, level: 68.4, vol: 2.5, bullish: true },
  { id: "HOUST", label: "Housing Starts", short: "Starts", unit: "M SAAR", category: "HOUSING", freq: "M", decimals: 2, level: 1.36, vol: 0.06, bullish: true },
  { id: "MORTGAGE30US", label: "30Y Mortgage Rate", short: "30Y Mtg", unit: "%", category: "HOUSING", freq: "W", decimals: 2, level: 6.62, vol: 0.08, bullish: false },
  { id: "M2SL", label: "M2 Money Supply (YoY)", short: "M2", unit: "% y/y", category: "MONEY", freq: "M", decimals: 1, level: 3.6, vol: 0.3, bullish: null },
  { id: "WALCL", label: "Fed Balance Sheet", short: "Fed B/S", unit: "$T", category: "MONEY", freq: "W", decimals: 2, level: 6.62, vol: 0.03, bullish: null },
];

export function seriesById(id: string): FredSeries | undefined {
  return FRED_CATALOG.find((s) => s.id === id);
}

/**
 * FRED unit correction. Raw FRED series are often index levels or totals, while
 * the terminal displays YoY %, MoM %, changes, bps, $T, etc. `resolveFred` maps
 * each series to the FRED `units` transform (pc1 = % YoY, pch = % MoM, chg =
 * level change, pca = compounded annual rate, lin = as-is) plus a display scale
 * factor. `simOnly` series have no usable FRED source (e.g. ISM PMIs were pulled
 * from FRED for licensing) and always render from the simulation.
 */
export interface FredResolved {
  units: string;
  scale: number;
  simOnly: boolean;
}

const FRED_OVERRIDE: Record<string, Partial<FredResolved>> = {
  // spreads: FRED returns percentage points, we display bps
  T10Y2Y: { units: "lin", scale: 100 },
  T10Y3M: { units: "lin", scale: 100 },
  BAMLH0A0HYM2: { units: "lin", scale: 100 },
  // growth as compounded annual rate
  GDPC1: { units: "pca" },
  GDPNOW: { units: "lin" }, // GDPNow is already an annualized %
  // level changes — FRED PAYEMS is already in thousands; chg yields the k m/m change
  PAYEMS: { units: "chg", scale: 1 },
  // rescaled levels
  ICSA: { units: "lin", scale: 0.001 }, // persons -> thousands
  JTSJOL: { units: "lin", scale: 0.001 }, // thousands -> millions
  HOUST: { units: "lin", scale: 0.001 }, // thousands -> millions
  WALCL: { units: "lin", scale: 1e-6 }, // $ millions -> $ trillions
  // percent-change transforms
  M2SL: { units: "pc1" },
  RSAFS: { units: "pch" },
  INDPRO: { units: "pch" },
  CES0500000003: { units: "pc1" },
  // licensing-restricted / synthetic ids -> simulation only
  "ISM-MFG": { simOnly: true },
  "ISM-SVC": { simOnly: true },
  SOFR: { units: "lin" },
};

export function resolveFred(id: string): FredResolved {
  const s = seriesById(id);
  const o = FRED_OVERRIDE[id] ?? {};
  let units = o.units;
  if (!units) {
    if (s?.unit.includes("y/y")) units = "pc1";
    else if (s?.unit.includes("m/m")) units = "pch";
    else units = "lin";
  }
  return { units, scale: o.scale ?? 1, simOnly: o.simOnly ?? false };
}

export interface Observation {
  date: string; // ISO yyyy-mm-dd
  value: number;
}

/** Anchor date for the simulation ("today"). */
export const ECON_TODAY = new Date(Date.UTC(2026, 5, 17));

function stepMs(freq: FredSeries["freq"]): number {
  if (freq === "D") return 24 * 3600 * 1000;
  if (freq === "W") return 7 * 24 * 3600 * 1000;
  if (freq === "M") return 30 * 24 * 3600 * 1000;
  return 91 * 24 * 3600 * 1000;
}

/**
 * Deterministic observation history for a series, ending at its anchor `level`.
 * Builds a mean-reverting series backwards so the latest point matches `level`.
 */
export function getSeriesHistory(id: string, n = 120): Observation[] {
  const s = seriesById(id);
  if (!s) return [];
  const rng = new Rng(`econ-${id}`);
  const out: Observation[] = [];
  const step = stepMs(s.freq);
  // generate a path then rescale so the final value equals level
  const raw: number[] = [];
  let x = s.level;
  for (let i = 0; i < n; i++) {
    x = x - rng.normal(0, s.vol) - (s.bullish === null ? 0 : 0);
    raw.push(x);
  }
  raw.reverse();
  const shift = s.level - raw[raw.length - 1];
  for (let i = 0; i < n; i++) {
    const date = new Date(ECON_TODAY.getTime() - (n - 1 - i) * step);
    out.push({ date: date.toISOString().slice(0, 10), value: Number((raw[i] + shift).toFixed(s.decimals)) });
  }
  return out;
}

export interface IndicatorRow {
  id: string;
  label: string;
  short: string;
  category: EconCategory;
  unit: string;
  value: number;
  prior: number;
  change: number;
  yoy: number;
  surprise: number; // actual - consensus, in unit terms
  spark: number[];
  bullish: boolean | null;
  decimals: number;
  asOf: string;
}

/** Headline macro dashboard rows derived from the catalog + simulated history. */
export function getIndicators(): IndicatorRow[] {
  return FRED_CATALOG.map((s) => {
    const rng = new Rng(`ind-${s.id}`);
    const hist = getSeriesHistory(s.id, 36);
    const value = hist[hist.length - 1].value;
    const prior = hist[hist.length - 2].value;
    const yoyBase = hist[Math.max(0, hist.length - 13)].value;
    const yoy = s.unit.includes("y/y") ? value : ((value - yoyBase) / (Math.abs(yoyBase) || 1)) * 100;
    return {
      id: s.id, label: s.label, short: s.short, category: s.category, unit: s.unit,
      value, prior, change: Number((value - prior).toFixed(s.decimals)),
      yoy: Number(yoy.toFixed(1)),
      surprise: Number(rng.normal(0, s.vol * 0.8).toFixed(s.decimals)),
      spark: hist.map((h) => h.value),
      bullish: s.bullish, decimals: s.decimals, asOf: hist[hist.length - 1].date,
    };
  });
}

export const ECON_CATEGORY_LABEL: Record<EconCategory, string> = {
  GROWTH: "Growth",
  INFLATION: "Inflation",
  LABOR: "Labor",
  RATES: "Rates & Credit",
  HOUSING: "Housing",
  CONSUMER: "Consumer",
  MONEY: "Money & Fed",
  ACTIVITY: "Activity",
};
