import { Rng } from "@/lib/rng";
import { TRADERS } from "./universe";

/** Trading Desk Analytics — scorecards, execution, risk. */

export interface TraderScore {
  id: string;
  name: string;
  desk: string;
  revenueDay: number;
  revenueMtd: number;
  pnlDay: number;
  pnlMtd: number;
  utilization: number;
  financingSpreadBps: number;
  sharpe: number;
  hitRate: number;
  rank: number;
  pnlTrend: number[];
}

export function getTraderScores(): TraderScore[] {
  const rng = new Rng("desk-scores");
  const rows = TRADERS.map((t) => {
    const revenueDay = rng.float(0.2, 3.4) * 1e6;
    const pnlDay = rng.normal(0.4, 1.1) * 1e6;
    return {
      id: t.id, name: t.name, desk: t.desk,
      revenueDay,
      revenueMtd: revenueDay * rng.float(18, 23),
      pnlDay,
      pnlMtd: pnlDay * rng.float(15, 22),
      utilization: rng.float(58, 97),
      financingSpreadBps: rng.float(22, 88),
      sharpe: rng.float(0.9, 3.2),
      hitRate: rng.float(48, 71),
      rank: 0,
      pnlTrend: new Rng(`pnl-${t.id}`).walk(40, pnlDay * 0.7, 0.08, 0.003),
    };
  });
  rows.sort((a, b) => b.revenueMtd - a.revenueMtd).forEach((r, i) => (r.rank = i + 1));
  return rows;
}

export interface ExecutionRow {
  ticker: string;
  side: "BUY" | "SELL";
  qty: number;
  avgPx: number;
  vwap: number;
  twap: number;
  slippageBps: number;
  fillRate: number;
  venue: string;
  algo: string;
}

export function getExecutions(): ExecutionRow[] {
  const rng = new Rng("desk-exec");
  const tickers = ["AAPL", "NVDA", "TSLA", "SPY", "MSFT", "META", "AMZN", "GME", "QQQ", "JPM", "GS", "COIN", "PLTR", "SMCI"];
  const venues = ["NYSE", "NASDAQ", "ARCA", "BATS", "IEX", "DARK-1", "EDGX"];
  const algos = ["VWAP", "TWAP", "POV-10", "IS", "Sniper", "Iceberg"];
  return tickers.map((ticker) => {
    const vwap = rng.float(20, 600);
    const slip = rng.normal(0, 4);
    return {
      ticker, side: rng.bool() ? "BUY" : "SELL",
      qty: Math.round(rng.float(0.1, 4) * 1e5),
      avgPx: vwap * (1 + slip / 10000),
      vwap, twap: vwap * (1 + rng.normal(0, 0.0008)),
      slippageBps: slip,
      fillRate: rng.float(82, 100),
      venue: rng.pick(venues),
      algo: rng.pick(algos),
    };
  });
}

export interface DeskRisk {
  metric: string;
  value: number;
  limit: number;
  unit: string;
}

export function getDeskRisk(): DeskRisk[] {
  const rng = new Rng("desk-risk");
  return [
    { metric: "Net Delta", value: rng.float(-120, 180) * 1e6, limit: 250e6, unit: "$" },
    { metric: "Gross Exposure", value: rng.float(4, 7) * 1e9, limit: 8e9, unit: "$" },
    { metric: "Single-name Concentration", value: rng.float(12, 23), limit: 25, unit: "%" },
    { metric: "1-Day VaR (95%)", value: rng.float(18, 34) * 1e6, limit: 45e6, unit: "$" },
    { metric: "Liquidity Score", value: rng.float(72, 91), limit: 60, unit: "score" },
    { metric: "Overnight Funding", value: rng.float(2.2, 3.8) * 1e9, limit: 5e9, unit: "$" },
  ];
}

export interface PositionConc {
  ticker: string;
  netExposure: number;
  pctBook: number;
  liquidity: "DEEP" | "NORMAL" | "THIN";
}

export function getPositionConcentration(): PositionConc[] {
  const rng = new Rng("desk-conc");
  const tickers = ["NVDA", "AAPL", "TSLA", "MSFT", "META", "AMZN", "SPY", "GME", "COIN", "JPM", "GS", "SMCI"];
  const liq: PositionConc["liquidity"][] = ["DEEP", "NORMAL", "THIN"];
  return tickers
    .map((ticker) => ({
      ticker,
      netExposure: rng.normal(0, 1) * 800e6,
      pctBook: rng.float(1, 14),
      liquidity: rng.pick(liq),
    }))
    .sort((a, b) => Math.abs(b.netExposure) - Math.abs(a.netExposure));
}
