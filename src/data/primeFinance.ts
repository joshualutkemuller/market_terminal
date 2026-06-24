import { Rng } from "@/lib/rng";
import { HEDGE_FUNDS } from "./universe";
import { type MarketConditions } from "./marketConditions";

export const DATA_SOURCE = "SIM" as const;

/** Prime Finance — hedge fund financing exposure, client analytics, risk. */

export interface PrimeClient {
  id: string;
  name: string;
  rating: string;
  region: string;
  gross: number;
  net: number;
  longExp: number;
  shortExp: number;
  financingRevenue: number; // annualized USD
  marginRequirement: number;
  balanceSheet: number; // bs consumption USD
  roa: number; // return on assets bps
  spreadBps: number;
  utilization: number;
}

export function getPrimeClients(): PrimeClient[] {
  const rng = new Rng("pb-clients");
  return HEDGE_FUNDS.map((c) => {
    const gross = rng.float(2, 28) * 1e9;
    const netRatio = rng.float(0.15, 0.55);
    const net = gross * netRatio;
    const longExp = (gross + net) / 2;
    const shortExp = (gross - net) / 2;
    const spreadBps = rng.float(28, 145);
    const bs = gross * rng.float(0.35, 0.7);
    const financingRevenue = (longExp + shortExp) * (spreadBps / 10000) * rng.float(0.8, 1.2);
    return {
      id: c.id, name: c.name, rating: c.rating, region: c.region,
      gross, net, longExp, shortExp,
      financingRevenue,
      marginRequirement: gross * rng.float(0.08, 0.18),
      balanceSheet: bs,
      roa: (financingRevenue / bs) * 10000,
      spreadBps,
      utilization: rng.float(45, 96),
    };
  }).sort((a, b) => b.financingRevenue - a.financingRevenue);
}

export interface PrimeSummary {
  grossExposure: number;
  netExposure: number;
  longExposure: number;
  shortExposure: number;
  financingRevenue: number;
  balanceSheet: number;
  avgRoa: number;
  clientCount: number;
  var95: number;
  var99: number;
  stressLoss: number;
  liquidityCoverage: number;
  fundingRisk: number;
  revenueTrend: number[];
  exposureTrend: number[];
}

export function getPrimeSummary(): PrimeSummary {
  const clients = getPrimeClients();
  const rng = new Rng("pb-sum");
  const gross = clients.reduce((a, c) => a + c.gross, 0);
  const net = clients.reduce((a, c) => a + c.net, 0);
  const long = clients.reduce((a, c) => a + c.longExp, 0);
  const short = clients.reduce((a, c) => a + c.shortExp, 0);
  const rev = clients.reduce((a, c) => a + c.financingRevenue, 0);
  const bs = clients.reduce((a, c) => a + c.balanceSheet, 0);
  return {
    grossExposure: gross, netExposure: net, longExposure: long, shortExposure: short,
    financingRevenue: rev, balanceSheet: bs,
    avgRoa: (rev / bs) * 10000,
    clientCount: clients.length,
    var95: gross * 0.018, var99: gross * 0.031,
    stressLoss: gross * 0.067,
    liquidityCoverage: rng.float(118, 142),
    fundingRisk: rng.float(0.6, 0.85),
    revenueTrend: new Rng("pb-rev-t").walk(60, rev / 360 * 0.85, 0.05, 0.003),
    exposureTrend: new Rng("pb-exp-t").walk(60, gross * 0.9, 0.02, 0.002),
  };
}

export interface StressScenario {
  name: string;
  pnl: number; // USD impact
  varImpact: number;
  liquidityDays: number;
}

export function getStressScenarios(): StressScenario[] {
  const rng = new Rng("pb-stress");
  const gross = getPrimeSummary().grossExposure;
  const scenarios = [
    "Equity -10% / Vol +50%",
    "2008 Lehman Replay",
    "Rates +100bps Shock",
    "Quant Deleveraging",
    "Liquidity Squeeze",
    "Credit Spread +200bps",
    "GME-style Short Squeeze",
    "USD Funding Stress",
  ];
  return scenarios.map((name) => ({
    name,
    pnl: -gross * rng.float(0.01, 0.09),
    varImpact: rng.float(1.2, 3.4),
    liquidityDays: rng.float(0.5, 6),
  }));
}

export interface FinancingOpp {
  client: string;
  ticker: string;
  type: "INTERNALIZE" | "CHEAPEN_FINANCE" | "BS_OPTIMIZE";
  currentBps: number;
  optimizedBps: number;
  savings: number; // annualized USD
  notional: number;
}

export function getFinancingOpportunities(): FinancingOpp[] {
  const rng = new Rng("pb-opp");
  const tickers = ["NVDA", "TSLA", "AAPL", "META", "GME", "COIN", "PLTR", "MSTR", "SMCI", "AMZN"];
  const types: FinancingOpp["type"][] = ["INTERNALIZE", "CHEAPEN_FINANCE", "BS_OPTIMIZE"];
  return Array.from({ length: 14 }, () => {
    const cur = rng.float(40, 160);
    const opt = cur * rng.float(0.55, 0.88);
    const notional = rng.float(0.1, 2.2) * 1e9;
    return {
      client: rng.pick(HEDGE_FUNDS).name,
      ticker: rng.pick(tickers),
      type: rng.pick(types),
      currentBps: cur, optimizedBps: opt,
      savings: notional * ((cur - opt) / 10000),
      notional,
    };
  }).sort((a, b) => b.savings - a.savings);
}

// ── Margin Pressure Score ───────────────────────────────────────────────────

export interface GaugeComponent {
  label: string;
  contribution: number;
  detail: string;
}

export interface MarginPressureScore {
  score: number;
  regime: "Low" | "Elevated" | "High" | "Critical";
  components: GaugeComponent[];
  readThrough: string;
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeMarginPressure(cond: MarketConditions): MarginPressureScore {
  const eqDd = Math.max(Math.abs(cond.spyDrawdown), Math.abs(cond.qqqDrawdown), Math.abs(cond.iwmDrawdown));
  const cEq = clamp(eqDd * 5);
  const cCredit = clamp((cond.hyOas - 300) / 4);
  const cVol = clamp((cond.vix - 14) * 3.5);
  const cFunding = clamp(cond.fundingStress);
  const cBasis = clamp(Math.max(0, cond.fraOisBps - 10) * 3);

  const components: GaugeComponent[] = [
    { label: "Equity Drawdown", contribution: Math.round(cEq), detail: `${eqDd.toFixed(1)}% max` },
    { label: "Credit Widening", contribution: Math.round(cCredit), detail: `HY ${cond.hyOas.toFixed(0)}bps` },
    { label: "Volatility", contribution: Math.round(cVol), detail: `VIX ${cond.vix.toFixed(1)}` },
    { label: "Funding Spread", contribution: Math.round(cFunding), detail: `stress ${cond.fundingStress.toFixed(0)}/100` },
    { label: "Bank Funding", contribution: Math.round(cBasis), detail: `FRA-OIS ${cond.fraOisBps.toFixed(0)}bps` },
  ];

  const score = Math.round(clamp(0.25 * cEq + 0.25 * cCredit + 0.2 * cVol + 0.18 * cFunding + 0.12 * cBasis));
  const regime: MarginPressureScore["regime"] =
    score >= 75 ? "Critical" : score >= 50 ? "High" : score >= 30 ? "Elevated" : "Low";

  const readThrough =
    regime === "Critical"
      ? "Multiple stress factors converging — expect margin calls, forced deleveraging, and elevated counterparty risk. Widen haircuts."
      : regime === "High"
      ? "Margin conditions tightening — monitor concentrated positions and pre-fund anticipated calls. Review limit utilization."
      : regime === "Elevated"
      ? "Some stress signals building — watch equity vol and credit spreads for further deterioration."
      : "Margin conditions benign — standard risk parameters apply.";

  return { score, regime, components, readThrough };
}

// ── Client Financing Risk Overlay ───────────────────────────────────────────

export interface FinancingRiskOverlay {
  client: string;
  rating: string;
  gross: number;
  sensitivity: "Low" | "Med" | "High";
  fundingCostDelta: number;
  marginCallRisk: number;
  bsUtilShift: number;
  action: string;
}

export function computeFinancingOverlay(
  clients: PrimeClient[],
  cond: MarketConditions,
): FinancingRiskOverlay[] {
  const rng = new Rng("pb-overlay");
  return clients.slice(0, 12).map((c) => {
    const leverage = c.gross / Math.max(c.net, 1e6);
    const utilFactor = c.utilization / 100;
    const ratingPenalty = c.rating.startsWith("B") ? 1.3 : c.rating.startsWith("A") ? 0.7 : 1.0;
    const rawSens = leverage * utilFactor * ratingPenalty * (1 + cond.fundingStress / 100);

    const sensitivity: FinancingRiskOverlay["sensitivity"] =
      rawSens >= 4 ? "High" : rawSens >= 2.2 ? "Med" : "Low";

    const fundingDelta = cond.sofrEffrBps * leverage * rng.float(0.8, 1.3);
    const marginRisk = clamp(
      Math.abs(cond.spyDrawdown) * leverage * 3 + Math.max(0, cond.vix - 18) * leverage * 0.8,
    );
    const bsShift = (cond.hyOas - 300) / 300 * utilFactor * rng.float(3, 8);

    const action =
      sensitivity === "High"
        ? "Increase monitoring frequency. Pre-fund margin buffer. Review exposure limits."
        : sensitivity === "Med"
        ? "Watch leverage and credit exposure. Confirm collateral eligibility."
        : "Standard monitoring. No action required.";

    return {
      client: c.name,
      rating: c.rating,
      gross: c.gross,
      sensitivity,
      fundingCostDelta: fundingDelta,
      marginCallRisk: Math.round(marginRisk),
      bsUtilShift: bsShift,
      action,
    };
  });
}

// ── Parameterized Scenario Shocks ───────────────────────────────────────────

export interface DetailedShock {
  name: string;
  equityShock: number;
  creditShock: number;
  volShock: number;
  rateShock: number;
  pnlImpact: number;
  marginCall: number;
  liquidityDays: number;
  bsImpact: number;
  roaShift: number;
}

export function computeDetailedShocks(summary: PrimeSummary): DetailedShock[] {
  const gross = summary.grossExposure;
  const bs = summary.balanceSheet;
  const baseRoa = summary.avgRoa;
  const rng = new Rng("pb-dshock");

  const defs: { name: string; eq: number; cr: number; vol: number; rate: number }[] = [
    { name: "Rates +150bps", eq: -3, cr: 25, vol: 5, rate: 150 },
    { name: "Rates −100bps", eq: 2, cr: -10, vol: -2, rate: -100 },
    { name: "HY Widen +200bps", eq: -8, cr: 200, vol: 12, rate: -25 },
    { name: "Equity −15% Gap", eq: -15, cr: 80, vol: 18, rate: -50 },
    { name: "Liquidity Squeeze", eq: -6, cr: 120, vol: 14, rate: 20 },
    { name: "Vol Spike (VIX 40)", eq: -10, cr: 60, vol: 22, rate: -30 },
    { name: "USD Funding Stress", eq: -4, cr: 40, vol: 8, rate: 10 },
    { name: "Quant Deleveraging", eq: -12, cr: 50, vol: 16, rate: 0 },
  ];

  return defs.map((d) => {
    const eqImpact = gross * (d.eq / 100) * rng.float(0.7, 1.1);
    const crImpact = gross * (d.cr / 10000) * rng.float(0.4, 0.7) * -1;
    const pnl = eqImpact + crImpact;
    const marginCall = Math.abs(pnl) * rng.float(0.3, 0.6);
    const bsImpact = bs * (Math.abs(d.eq) / 100) * rng.float(0.15, 0.35);
    const revHit = Math.abs(d.eq) * 0.012 + d.cr * 0.0003;
    return {
      name: d.name,
      equityShock: d.eq,
      creditShock: d.cr,
      volShock: d.vol,
      rateShock: d.rate,
      pnlImpact: pnl,
      marginCall,
      liquidityDays: rng.float(0.5, 5),
      bsImpact,
      roaShift: -(baseRoa * revHit),
    };
  });
}

// ── BS Utilization by Financing Condition ────────────────────────────────────

export interface BsConditionRow {
  condition: string;
  tone: "up" | "amber" | "down";
  currentRoa: number;
  conditionedRoa: number;
  currentUtil: number;
  conditionedUtil: number;
  revenueImpact: number;
  bsCapacity: number;
}

export function computeBsConditions(summary: PrimeSummary): BsConditionRow[] {
  const baseRoa = summary.avgRoa;
  const baseRev = summary.financingRevenue;
  const bs = summary.balanceSheet;
  const avgUtil = 72;

  return [
    {
      condition: "Funding ample",
      tone: "up",
      currentRoa: baseRoa,
      conditionedRoa: baseRoa * 0.88,
      currentUtil: avgUtil,
      conditionedUtil: avgUtil * 0.92,
      revenueImpact: -baseRev * 0.08,
      bsCapacity: bs * 1.12,
    },
    {
      condition: "Funding neutral",
      tone: "amber",
      currentRoa: baseRoa,
      conditionedRoa: baseRoa,
      currentUtil: avgUtil,
      conditionedUtil: avgUtil,
      revenueImpact: 0,
      bsCapacity: bs,
    },
    {
      condition: "Funding tightening",
      tone: "amber",
      currentRoa: baseRoa,
      conditionedRoa: baseRoa * 1.15,
      currentUtil: avgUtil,
      conditionedUtil: avgUtil * 1.08,
      revenueImpact: baseRev * 0.06,
      bsCapacity: bs * 0.93,
    },
    {
      condition: "Funding stressed",
      tone: "down",
      currentRoa: baseRoa,
      conditionedRoa: baseRoa * 1.35,
      currentUtil: avgUtil,
      conditionedUtil: avgUtil * 1.18,
      revenueImpact: baseRev * 0.14,
      bsCapacity: bs * 0.82,
    },
    {
      condition: "Credit-driven squeeze",
      tone: "down",
      currentRoa: baseRoa,
      conditionedRoa: baseRoa * 0.65,
      currentUtil: avgUtil,
      conditionedUtil: Math.min(99, avgUtil * 1.3),
      revenueImpact: -baseRev * 0.18,
      bsCapacity: bs * 0.75,
    },
  ];
}
