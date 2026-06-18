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

export type EconCategory = "GROWTH" | "INFLATION" | "LABOR" | "RATES" | "CREDIT" | "HOUSING" | "CONSUMER" | "MONEY" | "ACTIVITY" | "FX";

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

  // ── Expanded rates / curve tenors ──
  { id: "DGS1MO", label: "1-Month Treasury", short: "UST 1M", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 4.3, vol: 0.03, bullish: null },
  { id: "DGS3MO", label: "3-Month Treasury", short: "UST 3M", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 4.25, vol: 0.03, bullish: null },
  { id: "DGS6MO", label: "6-Month Treasury", short: "UST 6M", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 4.15, vol: 0.03, bullish: null },
  { id: "DGS1", label: "1-Year Treasury", short: "UST 1Y", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 3.95, vol: 0.04, bullish: null },
  { id: "DGS5", label: "5-Year Treasury", short: "UST 5Y", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 3.8, vol: 0.04, bullish: null },
  { id: "DGS30", label: "30-Year Treasury", short: "UST 30Y", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 4.35, vol: 0.04, bullish: null },
  { id: "DFII10", label: "10Y Real Yield (TIPS)", short: "10Y Real", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 1.78, vol: 0.04, bullish: null },
  { id: "T10YIE", label: "10Y Breakeven Inflation", short: "10y B/E", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 2.32, vol: 0.04, bullish: null },
  { id: "T5YIFR", label: "5y5y Forward Inflation", short: "5y5y Fwd", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 2.41, vol: 0.04, bullish: null },
  { id: "DPRIME", label: "Bank Prime Loan Rate", short: "Prime", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 7.25, vol: 0.01, bullish: null },
  { id: "DGS20", label: "20-Year Treasury", short: "UST 20Y", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 4.45, vol: 0.04, bullish: null },
  { id: "DGS3", label: "3-Year Treasury", short: "UST 3Y", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 3.7, vol: 0.04, bullish: null },
  { id: "DGS7", label: "7-Year Treasury", short: "UST 7Y", unit: "%", category: "RATES", freq: "D", decimals: 2, level: 3.95, vol: 0.04, bullish: null },

  // ── Credit spreads (ICE BofA OAS, displayed in bps) ──
  { id: "BAMLC0A0CM", label: "US IG Corp OAS", short: "IG OAS", unit: "bps", category: "CREDIT", freq: "D", decimals: 0, level: 92, vol: 5, bullish: false },
  { id: "BAMLC0A1CAAA", label: "AAA Corp OAS", short: "AAA", unit: "bps", category: "CREDIT", freq: "D", decimals: 0, level: 48, vol: 4, bullish: false },
  { id: "BAMLC0A2CAA", label: "AA Corp OAS", short: "AA", unit: "bps", category: "CREDIT", freq: "D", decimals: 0, level: 62, vol: 4, bullish: false },
  { id: "BAMLC0A3CA", label: "A Corp OAS", short: "A", unit: "bps", category: "CREDIT", freq: "D", decimals: 0, level: 84, vol: 5, bullish: false },
  { id: "BAMLC0A4CBBB", label: "BBB Corp OAS", short: "BBB", unit: "bps", category: "CREDIT", freq: "D", decimals: 0, level: 124, vol: 6, bullish: false },
  { id: "BAMLH0A1HYBB", label: "BB HY OAS", short: "BB", unit: "bps", category: "CREDIT", freq: "D", decimals: 0, level: 215, vol: 9, bullish: false },
  { id: "BAMLH0A2HYB", label: "B HY OAS", short: "B", unit: "bps", category: "CREDIT", freq: "D", decimals: 0, level: 348, vol: 12, bullish: false },
  { id: "BAMLH0A3HYC", label: "CCC & Lower OAS", short: "CCC", unit: "bps", category: "CREDIT", freq: "D", decimals: 0, level: 742, vol: 22, bullish: false },
  { id: "BAMLEMCBPIOAS", label: "EM Corp OAS", short: "EM Corp", unit: "bps", category: "CREDIT", freq: "D", decimals: 0, level: 218, vol: 10, bullish: false },
  { id: "BAMLC0A0CMEY", label: "US IG Corp Yield", short: "IG Yield", unit: "%", category: "CREDIT", freq: "D", decimals: 2, level: 5.18, vol: 0.05, bullish: null },
  { id: "BAMLH0A0HYM2EY", label: "US HY Corp Yield", short: "HY Yield", unit: "%", category: "CREDIT", freq: "D", decimals: 2, level: 7.62, vol: 0.08, bullish: null },

  // ── Expanded labor ──
  { id: "U6RATE", label: "U-6 Underemployment", short: "U-6", unit: "%", category: "LABOR", freq: "M", decimals: 1, level: 7.9, vol: 0.15, bullish: false },
  { id: "CIVPART", label: "Labor Force Participation", short: "LFPR", unit: "%", category: "LABOR", freq: "M", decimals: 1, level: 62.4, vol: 0.1, bullish: true },
  { id: "EMRATIO", label: "Employment-Population Ratio", short: "E/P", unit: "%", category: "LABOR", freq: "M", decimals: 1, level: 59.8, vol: 0.1, bullish: true },
  { id: "AWHAETP", label: "Avg Weekly Hours", short: "Hours", unit: "hrs", category: "LABOR", freq: "M", decimals: 1, level: 34.2, vol: 0.1, bullish: true },

  // ── Expanded inflation ──
  { id: "PPIACO", label: "PPI All Commodities (YoY)", short: "PPI", unit: "% y/y", category: "INFLATION", freq: "M", decimals: 1, level: 1.9, vol: 0.3, bullish: false },
  { id: "STICKCPIM159SFRB", label: "Sticky CPI (YoY)", short: "Sticky CPI", unit: "% y/y", category: "INFLATION", freq: "M", decimals: 1, level: 3.2, vol: 0.12, bullish: false },
  { id: "PCEPILFE_MOM", label: "Core PCE (MoM)", short: "Core PCE m/m", unit: "% m/m", category: "INFLATION", freq: "M", decimals: 2, level: 0.21, vol: 0.06, bullish: false },

  // ── Expanded activity / consumer / housing ──
  { id: "TCU", label: "Capacity Utilization", short: "Cap Util", unit: "%", category: "ACTIVITY", freq: "M", decimals: 1, level: 77.4, vol: 0.4, bullish: true },
  { id: "DGORDER", label: "Durable Goods Orders", short: "Dur Goods", unit: "% m/m", category: "ACTIVITY", freq: "M", decimals: 1, level: 0.3, vol: 1.2, bullish: true },
  { id: "PSAVERT", label: "Personal Saving Rate", short: "Saving", unit: "%", category: "CONSUMER", freq: "M", decimals: 1, level: 4.4, vol: 0.3, bullish: null },
  { id: "PCE", label: "Personal Consumption (YoY)", short: "PCE Spend", unit: "% y/y", category: "CONSUMER", freq: "M", decimals: 1, level: 5.1, vol: 0.3, bullish: true },
  { id: "TOTALSA", label: "Light Vehicle Sales", short: "Auto Sales", unit: "M SAAR", category: "CONSUMER", freq: "M", decimals: 1, level: 16.1, vol: 0.5, bullish: true },
  { id: "CSUSHPINSA", label: "Case-Shiller Home Px (YoY)", short: "Home Px", unit: "% y/y", category: "HOUSING", freq: "M", decimals: 1, level: 3.4, vol: 0.4, bullish: null },
  { id: "PERMIT", label: "Building Permits", short: "Permits", unit: "M SAAR", category: "HOUSING", freq: "M", decimals: 2, level: 1.42, vol: 0.05, bullish: true },
  { id: "EXHOSLUSM495S", label: "Existing Home Sales", short: "Home Sales", unit: "M SAAR", category: "HOUSING", freq: "M", decimals: 2, level: 4.05, vol: 0.1, bullish: true },

  // ── Money / financial conditions / FX ──
  { id: "NFCI", label: "Chicago Fed Fin. Conditions", short: "NFCI", unit: "index", category: "MONEY", freq: "W", decimals: 2, level: -0.42, vol: 0.05, bullish: false },
  { id: "DTWEXBGS", label: "Trade-Weighted USD (Broad)", short: "USD Broad", unit: "index", category: "FX", freq: "D", decimals: 2, level: 121.4, vol: 0.4, bullish: null },
  { id: "DEXUSEU", label: "USD / EUR", short: "EUR/USD", unit: "$", category: "FX", freq: "D", decimals: 4, level: 1.051, vol: 0.005, bullish: null },
  { id: "DEXJPUS", label: "JPY / USD", short: "USD/JPY", unit: "¥", category: "FX", freq: "D", decimals: 2, level: 156.3, vol: 0.5, bullish: null },
  { id: "VIXCLS", label: "CBOE VIX", short: "VIX", unit: "index", category: "MONEY", freq: "D", decimals: 1, level: 14.2, vol: 1.5, bullish: false },
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
  // spreads & credit OAS: FRED returns percentage points, we display bps
  T10Y2Y: { units: "lin", scale: 100 },
  T10Y3M: { units: "lin", scale: 100 },
  BAMLH0A0HYM2: { units: "lin", scale: 100 },
  BAMLC0A0CM: { units: "lin", scale: 100 },
  BAMLC0A1CAAA: { units: "lin", scale: 100 },
  BAMLC0A2CAA: { units: "lin", scale: 100 },
  BAMLC0A3CA: { units: "lin", scale: 100 },
  BAMLC0A4CBBB: { units: "lin", scale: 100 },
  BAMLH0A1HYBB: { units: "lin", scale: 100 },
  BAMLH0A2HYB: { units: "lin", scale: 100 },
  BAMLH0A3HYC: { units: "lin", scale: 100 },
  BAMLEMCBPIOAS: { units: "lin", scale: 100 },
  // already-YoY rate series — do not re-transform
  STICKCPIM159SFRB: { units: "lin" },
  // rescaled levels
  PERMIT: { units: "lin", scale: 0.001 }, // thousands -> millions
  EXHOSLUSM495S: { units: "lin", scale: 1e-6 }, // count -> millions
  // synthetic convenience series (no direct FRED id)
  PCEPILFE_MOM: { simOnly: true },
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
  RATES: "Rates & Curve",
  CREDIT: "Credit",
  HOUSING: "Housing",
  CONSUMER: "Consumer",
  MONEY: "Money & Fed",
  ACTIVITY: "Activity",
  FX: "FX & Dollar",
};
