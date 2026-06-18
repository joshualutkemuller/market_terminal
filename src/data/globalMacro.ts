import { Rng } from "@/lib/rng";

/**
 * Global inflation & policy-rate monitors.
 *
 * For each country we compute the latest YoY/MoM print, the trend vs the prior
 * print, and the number of consecutive prints moving in the same direction
 * ("streak") — derived from a deterministic recent history so it is stable.
 */

export type Trend = "RISING" | "FALLING" | "FLAT";
export type Region = "AMER" | "EMEA" | "APAC";

export interface CountryInflation {
  country: string;
  flag: string;
  region: Region;
  fredId: string;
  yoy: number;
  priorYoy: number;
  mom: number;
  trend: Trend;
  streak: number; // consecutive prints in same YoY direction
  target: number;
  vsTarget: number; // yoy - target
  history: number[]; // recent YoY prints (oldest -> newest)
}

export interface PolicyRate {
  country: string;
  flag: string;
  region: Region;
  centralBank: string;
  rate: number;
  priorRate: number;
  lastMoveBps: number;
  lastMeeting: string;
  cycle: "HIKING" | "CUTTING" | "HOLD";
  streak: number; // consecutive meetings of the same action
  nextMeeting: string;
  realRate: number; // rate - cpi yoy
  bias: "HAWKISH" | "NEUTRAL" | "DOVISH";
  history: number[];
}

// country, flag, region, fredId, current CPI YoY, target
const CPI_DEFS: [string, string, Region, string, number, number][] = [
  ["United States", "🇺🇸", "AMER", "CPIAUCSL", 2.6, 2.0],
  ["Euro Area", "🇪🇺", "EMEA", "CP0000EZ19M086NEST", 2.1, 2.0],
  ["United Kingdom", "🇬🇧", "EMEA", "GBRCPIALLMINMEI", 2.8, 2.0],
  ["Japan", "🇯🇵", "APAC", "JPNCPIALLMINMEI", 2.5, 2.0],
  ["Germany", "🇩🇪", "EMEA", "DEUCPIALLMINMEI", 2.2, 2.0],
  ["France", "🇫🇷", "EMEA", "FRACPIALLMINMEI", 1.8, 2.0],
  ["Italy", "🇮🇹", "EMEA", "ITAL_CPI", 1.9, 2.0],
  ["Canada", "🇨🇦", "AMER", "CANCPIALLMINMEI", 2.0, 2.0],
  ["China", "🇨🇳", "APAC", "CHNCPIALLMINMEI", 0.6, 3.0],
  ["India", "🇮🇳", "APAC", "INDCPIALLMINMEI", 4.2, 4.0],
  ["Brazil", "🇧🇷", "AMER", "BRACPIALLMINMEI", 4.5, 3.0],
  ["Mexico", "🇲🇽", "AMER", "MEXCPIALLMINMEI", 3.8, 3.0],
  ["Australia", "🇦🇺", "APAC", "AUSCPIALLQINMEI", 2.9, 2.5],
  ["South Korea", "🇰🇷", "APAC", "KORCPIALLMINMEI", 2.0, 2.0],
  ["Switzerland", "🇨🇭", "EMEA", "CHECPIALLMINMEI", 0.6, 2.0],
  ["Spain", "🇪🇸", "EMEA", "ESPCPIALLMINMEI", 2.3, 2.0],
  ["Turkey", "🇹🇷", "EMEA", "TURCPIALLMINMEI", 32.0, 5.0],
  ["Indonesia", "🇮🇩", "APAC", "IDNCPIALLMINMEI", 2.7, 3.0],
  ["South Africa", "🇿🇦", "EMEA", "ZAFCPIALLMINMEI", 4.4, 4.5],
  ["Saudi Arabia", "🇸🇦", "EMEA", "SAUCPIALLMINMEI", 1.9, 2.0],
];

// country, flag, region, central bank, current rate, recent bias direction (-1 cut / +1 hike / 0 hold)
const RATE_DEFS: [string, string, Region, string, number, number][] = [
  ["United States", "🇺🇸", "AMER", "Federal Reserve", 4.13, -1],
  ["Euro Area", "🇪🇺", "EMEA", "ECB", 2.15, -1],
  ["United Kingdom", "🇬🇧", "EMEA", "Bank of England", 4.00, -1],
  ["Japan", "🇯🇵", "APAC", "Bank of Japan", 0.75, 1],
  ["Canada", "🇨🇦", "AMER", "Bank of Canada", 2.50, -1],
  ["Australia", "🇦🇺", "APAC", "Reserve Bank of Australia", 3.60, -1],
  ["Switzerland", "🇨🇭", "EMEA", "Swiss National Bank", 0.25, -1],
  ["China", "🇨🇳", "APAC", "People's Bank of China", 2.90, -1],
  ["India", "🇮🇳", "APAC", "Reserve Bank of India", 5.50, -1],
  ["Brazil", "🇧🇷", "AMER", "Banco Central do Brasil", 12.00, 1],
  ["Mexico", "🇲🇽", "AMER", "Banco de México", 7.75, -1],
  ["South Korea", "🇰🇷", "APAC", "Bank of Korea", 2.50, -1],
  ["Sweden", "🇸🇪", "EMEA", "Riksbank", 2.00, 0],
  ["Norway", "🇳🇴", "EMEA", "Norges Bank", 4.00, -1],
  ["New Zealand", "🇳🇿", "APAC", "Reserve Bank of NZ", 3.25, -1],
  ["Turkey", "🇹🇷", "EMEA", "CBRT", 42.00, -1],
  ["Indonesia", "🇮🇩", "APAC", "Bank Indonesia", 5.25, -1],
  ["South Africa", "🇿🇦", "EMEA", "South African Reserve Bank", 7.25, -1],
];

function trendOf(curr: number, prev: number): Trend {
  if (curr > prev + 0.05) return "RISING";
  if (curr < prev - 0.05) return "FALLING";
  return "FLAT";
}

export function getGlobalCPI(): CountryInflation[] {
  return CPI_DEFS.map(([country, flag, region, fredId, yoy, target]) => {
    const rng = new Rng(`gcpi-${country}`);
    // build recent YoY history walking back toward higher (disinflation) with noise
    const hist: number[] = [];
    let v = yoy;
    for (let i = 0; i < 10; i++) {
      hist.unshift(Number(v.toFixed(1)));
      v = v + rng.float(0.0, 0.35) * (country === "Turkey" ? 4 : 1) + rng.normal(0, 0.12);
    }
    hist.push(Number(yoy.toFixed(1)));
    const priorYoy = hist[hist.length - 2];
    const trend = trendOf(yoy, priorYoy);
    // streak: count consecutive same-direction moves at the tail
    let streak = 1;
    for (let i = hist.length - 1; i > 0; i--) {
      const t = trendOf(hist[i], hist[i - 1]);
      if (t === trend && t !== "FLAT") streak++;
      else break;
    }
    return {
      country, flag, region, fredId,
      yoy, priorYoy,
      mom: Number((yoy / 12 + rng.normal(0, 0.1)).toFixed(2)),
      trend,
      streak: trend === "FLAT" ? 0 : streak,
      target,
      vsTarget: Number((yoy - target).toFixed(1)),
      history: hist,
    };
  });
}

/**
 * Recompute a country's CPI row from a live FRED *index-level* series (units=lin):
 * derives YoY, MoM, trend-vs-prior, the consecutive-print streak and the YoY
 * sparkline. Falls back to the simulation `base` when history is too short.
 */
export function liveCountryCPI(base: CountryInflation, obs: { date: string; value: number }[]): CountryInflation {
  const v = obs.map((o) => o.value);
  if (v.length < 14) return base;
  const pct = (a: number, b: number) => (b ? Number(((a / b - 1) * 100).toFixed(1)) : 0);
  const yoyArr: number[] = [];
  for (let i = 12; i < v.length; i++) yoyArr.push(pct(v[i], v[i - 12]));
  if (yoyArr.length < 2) return base;
  const yoy = yoyArr[yoyArr.length - 1];
  const priorYoy = yoyArr[yoyArr.length - 2];
  const trend = trendOf(yoy, priorYoy);
  let streak = 1;
  for (let i = yoyArr.length - 1; i > 0; i--) {
    const t = trendOf(yoyArr[i], yoyArr[i - 1]);
    if (t === trend && t !== "FLAT") streak++;
    else break;
  }
  return {
    ...base,
    yoy, priorYoy,
    mom: pct(v[v.length - 1], v[v.length - 2]),
    trend,
    streak: trend === "FLAT" ? 0 : streak,
    vsTarget: Number((yoy - base.target).toFixed(1)),
    history: yoyArr.slice(-11),
  };
}

export function getGlobalPolicyRates(): PolicyRate[] {
  const cpi = getGlobalCPI();
  return RATE_DEFS.map(([country, flag, region, centralBank, rate, dir]) => {
    const rng = new Rng(`grate-${country}`);
    const cycle: PolicyRate["cycle"] = dir > 0 ? "HIKING" : dir < 0 ? "CUTTING" : "HOLD";
    const step = country === "Turkey" || country === "Brazil" ? 2.5 : 0.25;
    // history of recent rates
    const hist: number[] = [];
    let v = rate;
    const nMoves = rng.int(2, 5);
    for (let i = 0; i < 8; i++) {
      hist.unshift(Number(v.toFixed(2)));
      if (i < nMoves) v = v - dir * step * (rng.bool(0.7) ? 1 : 0);
    }
    hist.push(Number(rate.toFixed(2)));
    const priorRate = hist[hist.length - 2];
    const lastMoveBps = Math.round((rate - priorRate) * 100);
    let streak = 0;
    for (let i = hist.length - 1; i > 0; i--) {
      const d = hist[i] - hist[i - 1];
      const act = d > 0.01 ? 1 : d < -0.01 ? -1 : 0;
      if (act === dir) streak++;
      else if (act === 0 && cycle === "HOLD") streak++;
      else break;
    }
    const cpiYoY = cpi.find((c) => c.country === country)?.yoy ?? 2;
    const realRate = rate - cpiYoY;
    const bias: PolicyRate["bias"] = realRate > 1.5 ? "HAWKISH" : realRate < 0 ? "DOVISH" : "NEUTRAL";
    return {
      country, flag, region, centralBank,
      rate, priorRate, lastMoveBps,
      lastMeeting: ["2026-06-11", "2026-05-28", "2026-06-04", "2026-06-17"][rng.int(0, 3)],
      cycle,
      streak: Math.max(1, streak),
      nextMeeting: ["2026-07-29", "2026-07-24", "2026-08-06", "2026-07-31"][rng.int(0, 3)],
      realRate: Number(realRate.toFixed(1)),
      bias,
      history: hist,
    };
  }).sort((a, b) => b.rate - a.rate);
}

export interface GlobalSummary {
  avgCpi: number;
  medianCpi: number;
  aboveTarget: number;
  risingCount: number;
  fallingCount: number;
  avgPolicyRate: number;
  cuttingCount: number;
  hikingCount: number;
  holdCount: number;
}

export function getGlobalSummary(): GlobalSummary {
  const cpi = getGlobalCPI();
  const rates = getGlobalPolicyRates();
  const ys = cpi.map((c) => c.yoy).sort((a, b) => a - b);
  return {
    avgCpi: Number((cpi.reduce((a, c) => a + c.yoy, 0) / cpi.length).toFixed(1)),
    medianCpi: ys[Math.floor(ys.length / 2)],
    aboveTarget: cpi.filter((c) => c.vsTarget > 0).length,
    risingCount: cpi.filter((c) => c.trend === "RISING").length,
    fallingCount: cpi.filter((c) => c.trend === "FALLING").length,
    avgPolicyRate: Number((rates.reduce((a, r) => a + r.rate, 0) / rates.length).toFixed(2)),
    cuttingCount: rates.filter((r) => r.cycle === "CUTTING").length,
    hikingCount: rates.filter((r) => r.cycle === "HIKING").length,
    holdCount: rates.filter((r) => r.cycle === "HOLD").length,
  };
}
