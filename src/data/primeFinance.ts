import { Rng } from "@/lib/rng";
import { HEDGE_FUNDS } from "./universe";

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
