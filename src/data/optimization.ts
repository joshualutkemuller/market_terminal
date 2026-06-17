import { Rng } from "@/lib/rng";

/** Optimization Center — solver runs, duals, before/after, recommended trades. */

export type OptType = "COLLATERAL" | "CASH" | "SEC_LENDING" | "DELTA_NEUTRAL";
export type SolverStatus = "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "RUNNING" | "TIME_LIMIT";

export interface OptimizationRun {
  id: string;
  type: OptType;
  solver: "Gurobi" | "OR-Tools" | "Pyomo/CBC";
  status: SolverStatus;
  objective: number; // USD value
  savings: number;
  runtimeMs: number;
  iterations: number;
  variables: number;
  constraints: number;
  constraintsHit: number;
  gap: number; // MIP gap %
  ts: string;
  minsAgo: number;
}

export interface DualValue {
  constraint: string;
  shadowPrice: number; // $ per unit
  slack: number;
  binding: boolean;
}

export interface RecommendedTrade {
  action: "MOVE" | "SUBSTITUTE" | "RECALL" | "PLEDGE" | "UNWIND";
  from: string;
  to: string;
  asset: string;
  qty: number;
  notional: number;
  impact: number; // USD benefit
}

const TYPES: OptType[] = ["COLLATERAL", "CASH", "SEC_LENDING", "DELTA_NEUTRAL"];
const SOLVERS: OptimizationRun["solver"][] = ["Gurobi", "OR-Tools", "Pyomo/CBC"];

export function getOptimizationRuns(): OptimizationRun[] {
  const rng = new Rng("opt-runs");
  const out: OptimizationRun[] = [];
  for (let i = 0; i < 16; i++) {
    const type = rng.pick(TYPES);
    const status: SolverStatus = i === 0 ? "RUNNING" : rng.bool(0.84) ? "OPTIMAL" : rng.bool(0.5) ? "TIME_LIMIT" : "INFEASIBLE";
    const vars = rng.int(2400, 48000);
    out.push({
      id: `OPT-${4471 - i}`,
      type,
      solver: rng.pick(SOLVERS),
      status,
      objective: rng.float(2, 40) * 1e6,
      savings: status === "INFEASIBLE" ? 0 : rng.float(0.3, 8) * 1e6,
      runtimeMs: rng.float(40, 4200),
      iterations: rng.int(120, 9800),
      variables: vars,
      constraints: Math.round(vars * rng.float(0.3, 0.8)),
      constraintsHit: rng.int(2, 14),
      gap: status === "OPTIMAL" ? 0 : rng.float(0.01, 1.8),
      ts: "",
      minsAgo: i * rng.int(3, 18),
    });
  }
  return out;
}

export function getDualValues(): DualValue[] {
  const rng = new Rng("opt-duals");
  const defs = [
    "Balance-sheet cap",
    "Single-issuer concentration",
    "Cash buffer (LCR)",
    "Eligibility — HY cap",
    "Counterparty exposure limit",
    "Min haircut floor",
    "Cross-currency mismatch",
    "Regulatory NSFR",
    "Inventory availability",
    "Recall horizon",
  ];
  return defs.map((constraint) => {
    const binding = rng.bool(0.45);
    return { constraint, shadowPrice: binding ? rng.float(0.2, 5.4) * 1e6 : 0, slack: binding ? 0 : rng.float(0.5, 18), binding };
  });
}

export function getRecommendedTrades(): RecommendedTrade[] {
  const rng = new Rng("opt-trades");
  const actions: RecommendedTrade["action"][] = ["MOVE", "SUBSTITUTE", "RECALL", "PLEDGE", "UNWIND"];
  const venues = ["Triparty BNYM", "LCH CCP", "Citadel CSA", "JPM GMRA", "Internal Box", "Vanguard Acct", "Eurex CCP", "Millennium CSA"];
  const assets = ["US Treasuries", "Agency MBS", "USD Cash", "Corp IG", "S&P Index", "Gold", "NVDA", "Bund 10Y"];
  return Array.from({ length: 12 }, () => {
    const notional = rng.float(0.05, 2.4) * 1e9;
    return {
      action: rng.pick(actions),
      from: rng.pick(venues),
      to: rng.pick(venues),
      asset: rng.pick(assets),
      qty: notional,
      notional,
      impact: notional * rng.float(0.0002, 0.0018),
    };
  }).sort((a, b) => b.impact - a.impact);
}

export interface BeforeAfter {
  metric: string;
  before: number;
  after: number;
  fmt: "usd" | "bps" | "pct";
  better: "lower" | "higher";
}

export function getBeforeAfter(): BeforeAfter[] {
  const rng = new Rng("opt-ba");
  return [
    { metric: "Funding cost", before: 4.62 * 100, after: 4.55 * 100, fmt: "bps", better: "lower" },
    { metric: "Collateral cost", before: rng.float(28, 34) * 1e6, after: rng.float(20, 26) * 1e6, fmt: "usd", better: "lower" },
    { metric: "Balance-sheet usage", before: 88.4, after: 79.1, fmt: "pct", better: "lower" },
    { metric: "Excess collateral", before: rng.float(2, 3) * 1e9, after: rng.float(3.4, 4.2) * 1e9, fmt: "usd", better: "higher" },
    { metric: "SL revenue capture", before: 91.2, after: 96.8, fmt: "pct", better: "higher" },
    { metric: "Internalization rate", before: 42.1, after: 58.7, fmt: "pct", better: "higher" },
  ];
}
