import { Rng } from "@/lib/rng";
import { getSentimentIndex, getSurveySocialDivergence, getBehavior } from "./sentiment";

export type AlertSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type AlertCategory = "SEC_LENDING" | "PRIME" | "OPTIMIZATION" | "COLLATERAL" | "TREASURY" | "MARKET" | "SENTIMENT";

export interface Alert {
  id: string;
  ts: string; // HH:MM:SS
  minsAgo: number;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  detail: string;
  metric?: string;
  acked: boolean;
}

const TEMPLATES: { category: AlertCategory; severity: AlertSeverity; title: string; detail: string; metric?: string }[] = [
  { category: "SEC_LENDING", severity: "CRITICAL", title: "Utilization breach — GME", detail: "Lending utilization crossed 98.4% with available inventory near zero", metric: "98.4%" },
  { category: "SEC_LENDING", severity: "HIGH", title: "Borrow rate spike — SMCI", detail: "Borrow fee jumped +420bps intraday on heavy short demand", metric: "+420bps" },
  { category: "SEC_LENDING", severity: "HIGH", title: "Recall event — TSLA", detail: "Beneficial owner BlackRock recalled 280k shares, redelivery T+1", metric: "280k sh" },
  { category: "SEC_LENDING", severity: "MEDIUM", title: "Inventory shortage — COIN", detail: "Available inventory below 5% threshold across all sources", metric: "4.2%" },
  { category: "SEC_LENDING", severity: "MEDIUM", title: "Specials roll risk", detail: "12 special loans maturing today representing $84M revenue at risk", metric: "$84M" },
  { category: "PRIME", severity: "CRITICAL", title: "Exposure breach — Balyasny", detail: "Gross exposure exceeded approved limit by $1.2B", metric: "+$1.2B" },
  { category: "PRIME", severity: "HIGH", title: "Margin call issued — Marshall Wace", detail: "VM call of $340M due to overnight mark-to-market move", metric: "$340M" },
  { category: "PRIME", severity: "HIGH", title: "Financing stress — Brevan Howard", detail: "Funding cost rose 38bps; client RoA dropped below desk hurdle", metric: "-38bps" },
  { category: "PRIME", severity: "MEDIUM", title: "Concentration warning", detail: "Top-3 clients now represent 47% of book gross exposure", metric: "47%" },
  { category: "OPTIMIZATION", severity: "CRITICAL", title: "Solver failure — Collateral run #4471", detail: "Gurobi returned INFEASIBLE — eligibility schedule conflict detected", metric: "INFEAS" },
  { category: "OPTIMIZATION", severity: "HIGH", title: "Constraint violation — concentration", detail: "Optimized allocation breaches single-issuer 25% cap on UST", metric: "27.1%" },
  { category: "OPTIMIZATION", severity: "LOW", title: "Savings opportunity detected", detail: "Re-running collateral optimization could save est. $2.1M/yr", metric: "$2.1M" },
  { category: "COLLATERAL", severity: "HIGH", title: "Margin deficit — CCP cleared", detail: "IM deficit of $156M at LCH requires posting by 11:00 ET", metric: "$156M" },
  { category: "COLLATERAL", severity: "MEDIUM", title: "Haircut change — corporate bonds", detail: "Counterparty raised haircut on BBB corporates from 8% to 12%", metric: "+400bps" },
  { category: "TREASURY", severity: "HIGH", title: "Funding gap — intraday", detail: "Projected USD funding shortfall of $480M at 14:00 settlement", metric: "$480M" },
  { category: "TREASURY", severity: "MEDIUM", title: "Repo rate dislocation", detail: "GC repo trading 14bps above SOFR — funding cost pressure", metric: "+14bps" },
  { category: "MARKET", severity: "MEDIUM", title: "Volatility regime shift", detail: "VIX +18% intraday; cross-asset correlation rising", metric: "VIX +18%" },
  { category: "MARKET", severity: "LOW", title: "Liquidity thinning — small caps", detail: "Russell 2000 names showing widening bid/ask spreads", metric: "—" },
];

/** Sentiment-driven alerts derived live from the SENT engine (extremes + divergence). */
function sentimentTemplates(): { category: AlertCategory; severity: AlertSeverity; title: string; detail: string; metric?: string }[] {
  const idx = getSentimentIndex();
  const dv = getSurveySocialDivergence();
  const bh = getBehavior();
  const out: { category: AlertCategory; severity: AlertSeverity; title: string; detail: string; metric?: string }[] = [];
  if (idx.regime === "Extreme Greed")
    out.push({ category: "SENTIMENT", severity: "HIGH", title: "Extreme Greed — contrarian caution", detail: "Crowd euphoria historically precedes below-average forward returns; tighten risk, fade chasing", metric: `${idx.score}` });
  else if (idx.regime === "Extreme Fear")
    out.push({ category: "SENTIMENT", severity: "HIGH", title: "Extreme Fear — contrarian support", detail: "Capitulation has historically marked contrarian support; selective accumulation rewarded", metric: `${idx.score}` });
  else if (idx.regime === "Greed" || idx.regime === "Fear")
    out.push({ category: "SENTIMENT", severity: "MEDIUM", title: `Sentiment regime — ${idx.regime}`, detail: `Sentiment Index at ${idx.score} (${idx.regime}); behavioral edge building`, metric: `${idx.score}` });
  if (dv.status === "DIVERGENT")
    out.push({ category: "SENTIMENT", severity: "MEDIUM", title: "Survey–social divergence", detail: dv.note, metric: `gap ${dv.gapNow >= 0 ? "+" : ""}${dv.gapNow}` });
  if (Math.abs(bh.gapNow) >= 14)
    out.push({ category: "SENTIMENT", severity: "LOW", title: "Retail–manager positioning gap", detail: bh.signal, metric: `${bh.gapNow >= 0 ? "+" : ""}${bh.gapNow}` });
  return out;
}

export function getAlerts(): Alert[] {
  const rng = new Rng("alerts-1");
  return [...TEMPLATES, ...sentimentTemplates()].map((t, i) => {
    const minsAgo = rng.int(0, 220);
    const d = new Date(Date.UTC(2026, 5, 17, 13, 30, 0) - minsAgo * 60000);
    return {
      id: `ALR-${4400 + i}`,
      ts: d.toISOString().slice(11, 19),
      minsAgo,
      severity: t.severity,
      category: t.category,
      title: t.title,
      detail: t.detail,
      metric: t.metric,
      acked: rng.bool(0.25),
    };
  }).sort((a, b) => a.minsAgo - b.minsAgo);
}

export function getActiveAlerts(): Alert[] {
  return getAlerts().filter((a) => !a.acked);
}

export const SEVERITY_TONE: Record<AlertSeverity, "down" | "amber" | "blue" | "neutral"> = {
  CRITICAL: "down",
  HIGH: "amber",
  MEDIUM: "blue",
  LOW: "neutral",
};

export const CATEGORY_LABEL: Record<AlertCategory, string> = {
  SEC_LENDING: "Sec Lending",
  PRIME: "Prime",
  OPTIMIZATION: "Optimization",
  COLLATERAL: "Collateral",
  TREASURY: "Treasury",
  MARKET: "Market",
  SENTIMENT: "Sentiment",
};
