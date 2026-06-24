/**
 * Electronic Trading Market Conditions Analytics.
 *
 * Pure functions over MarketConditions producing execution risk levels,
 * desk stance recommendations, vol regime signals, and liquidity
 * participation proxies. Consumed by the trading-desk page.
 */
import { Rng } from "@/lib/rng";
import { type MarketConditions, type SymbolCondition } from "./marketConditions";

// ── Execution Risk Summary ──────────────────────────────────────────────────

export type RiskLevel = "Normal" | "Cautious" | "Wide" | "Stress";
export type DeskStance = "Aggressive" | "Balanced" | "Passive" | "Reduce Size";

export interface ExecutionRiskRow {
  symbol: string;
  name: string;
  assetClass: string;
  price: number;
  chg1d: number;
  realizedVol: number;
  volRatio: string;
  volumeZ: number;
  rangePctile: number;
  gapRisk: number;
  trendScore: number;
  regime: "Trending" | "Mean-Reverting" | "Choppy" | "Breakout";
  riskLevel: RiskLevel;
  sparkline: number[];
}

function classifyRegime(trend: number, range: number, vol20: number, vol60: number): ExecutionRiskRow["regime"] {
  const volRatio = vol20 / (vol60 || 1);
  if (Math.abs(trend) > 0.3 && volRatio < 1.3) return "Trending";
  if (Math.abs(trend) < 0.1 && volRatio < 0.9) return "Mean-Reverting";
  if (volRatio > 1.5 && range > 75) return "Breakout";
  return "Choppy";
}

export function computeExecutionRisk(cond: MarketConditions): ExecutionRiskRow[] {
  return cond.symbols.map((s) => ({
    symbol: s.symbol,
    name: s.name,
    assetClass: s.assetClass,
    price: s.price,
    chg1d: s.chg1d,
    realizedVol: s.realizedVol20d,
    volRatio: `${(s.realizedVol20d / (s.realizedVol60d || 1)).toFixed(2)}x`,
    volumeZ: s.volumeZscore,
    rangePctile: s.rangePctile,
    gapRisk: s.gapRisk,
    trendScore: s.trendScore,
    regime: classifyRegime(s.trendScore, s.rangePctile, s.realizedVol20d, s.realizedVol60d),
    riskLevel: s.executionRisk,
    sparkline: s.sparkline,
  }));
}

// ── Desk Stance Recommendation ──────────────────────────────────────────────

export interface DeskStanceResult {
  stance: DeskStance;
  score: number;
  components: { label: string; contribution: number; detail: string }[];
  readThrough: string;
  adjustments: string[];
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeDeskStance(cond: MarketConditions): DeskStanceResult {
  const cVol = clamp((cond.vix - 13) * 3);
  const cCredit = clamp((cond.hyOas - 280) / 3.5);
  const cFunding = clamp(cond.fundingStress);
  const cMove = clamp((cond.moveIndex - 80) * 1.5);

  const stressSymbols = cond.symbols.filter((s) => s.executionRisk === "Stress" || s.executionRisk === "Wide");
  const cBreadth = clamp((stressSymbols.length / Math.max(cond.symbols.length, 1)) * 200);

  const components = [
    { label: "Equity Vol", contribution: Math.round(cVol), detail: `VIX ${cond.vix.toFixed(1)}` },
    { label: "Credit Stress", contribution: Math.round(cCredit), detail: `HY ${cond.hyOas.toFixed(0)}bps` },
    { label: "Funding Pressure", contribution: Math.round(cFunding), detail: `${cond.fundingStress.toFixed(0)}/100` },
    { label: "Rates Vol", contribution: Math.round(cMove), detail: `MOVE ${cond.moveIndex.toFixed(0)}` },
    { label: "Risk Breadth", contribution: Math.round(cBreadth), detail: `${stressSymbols.length}/${cond.symbols.length} stressed` },
  ];

  const score = Math.round(clamp(0.3 * cVol + 0.2 * cCredit + 0.2 * cFunding + 0.15 * cMove + 0.15 * cBreadth));

  const stance: DeskStance =
    score >= 70 ? "Reduce Size" : score >= 45 ? "Passive" : score >= 25 ? "Balanced" : "Aggressive";

  const adjustments: string[] = [];
  if (cond.vix >= 22) adjustments.push("Widen spread assumptions on equity axes.");
  if (cond.hyOas >= 400) adjustments.push("Reduce participation rate on credit ETFs.");
  if (cond.fundingStress >= 50) adjustments.push("Monitor repo-sensitive positions for settlement risk.");
  if (cond.moveIndex >= 110) adjustments.push("Reduce duration-weighted size on rates axes.");
  if (stressSymbols.length >= 5) adjustments.push("Switch to passive algos on stressed names.");
  if (adjustments.length === 0) adjustments.push("Standard algo parameters. No adjustments needed.");

  const readThrough =
    stance === "Reduce Size"
      ? "Multiple risk factors elevated — reduce electronic size, widen spreads, and switch to passive execution. Prioritize fill certainty over price improvement."
      : stance === "Passive"
      ? "Market conditions warrant caution — favor passive algos, increase price improvement targets, reduce crossing. Watch for deterioration."
      : stance === "Balanced"
      ? "Conditions normal but some factors warming — maintain standard parameters with moderate aggression. Watch vol ratio for regime change."
      : "Conditions favorable — full participation, aggressive crossing, and tight spread assumptions. Maximize internalization.";

  return { stance, score, components, readThrough, adjustments };
}

// ── Vol & Liquidity Summary ─────────────────────────────────────────────────

export interface VolLiquiditySummary {
  avgRealizedVol: number;
  medianVolZ: number;
  avgVolumeZ: number;
  pctNormal: number;
  pctCautious: number;
  pctWide: number;
  pctStress: number;
  trendingCount: number;
  meanRevertCount: number;
  choppyCount: number;
  breakoutCount: number;
}

export function computeVolLiquidity(rows: ExecutionRiskRow[]): VolLiquiditySummary {
  const n = rows.length || 1;
  const vols = rows.map((r) => r.realizedVol).sort((a, b) => a - b);
  return {
    avgRealizedVol: rows.reduce((a, r) => a + r.realizedVol, 0) / n,
    medianVolZ: vols[Math.floor(n / 2)] ?? 0,
    avgVolumeZ: rows.reduce((a, r) => a + r.volumeZ, 0) / n,
    pctNormal: rows.filter((r) => r.riskLevel === "Normal").length / n * 100,
    pctCautious: rows.filter((r) => r.riskLevel === "Cautious").length / n * 100,
    pctWide: rows.filter((r) => r.riskLevel === "Wide").length / n * 100,
    pctStress: rows.filter((r) => r.riskLevel === "Stress").length / n * 100,
    trendingCount: rows.filter((r) => r.regime === "Trending").length,
    meanRevertCount: rows.filter((r) => r.regime === "Mean-Reverting").length,
    choppyCount: rows.filter((r) => r.regime === "Choppy").length,
    breakoutCount: rows.filter((r) => r.regime === "Breakout").length,
  };
}
