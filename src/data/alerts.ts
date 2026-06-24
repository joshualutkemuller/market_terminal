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

export type LiveAlertData = Record<string, { observations: { date: string; value: number }[]; source: string }>;

export const ALERT_FRED_IDS = ["VIXCLS", "SOFR", "BAMLH0A0HYM2", "DGS10", "T10Y2Y"];

interface LiveThreshold {
  id: string;
  label: string;
  category: AlertCategory;
  thresholds: { level: number; op: "gte" | "lte"; severity: AlertSeverity; title: string; detail: (v: number) => string }[];
}

const LIVE_THRESHOLDS: LiveThreshold[] = [
  {
    id: "VIXCLS", label: "VIX", category: "MARKET",
    thresholds: [
      { level: 30, op: "gte", severity: "CRITICAL", title: "VIX spike — extreme volatility", detail: (v) => `CBOE VIX at ${v.toFixed(1)} — extreme fear regime, cross-asset hedging warranted` },
      { level: 22, op: "gte", severity: "HIGH", title: "VIX elevated — risk-off signal", detail: (v) => `CBOE VIX at ${v.toFixed(1)} — elevated uncertainty, tighten exposure` },
      { level: 18, op: "gte", severity: "MEDIUM", title: "VIX rising — volatility uptick", detail: (v) => `CBOE VIX at ${v.toFixed(1)} — above calm regime` },
    ],
  },
  {
    id: "BAMLH0A0HYM2", label: "HY OAS", category: "MARKET",
    thresholds: [
      { level: 600, op: "gte", severity: "CRITICAL", title: "HY spreads — stress level", detail: (v) => `ICE BofA HY OAS at ${v.toFixed(0)}bps — credit stress` },
      { level: 450, op: "gte", severity: "HIGH", title: "HY spreads widening", detail: (v) => `ICE BofA HY OAS at ${v.toFixed(0)}bps — risk premium elevated` },
      { level: 350, op: "gte", severity: "MEDIUM", title: "HY spreads above average", detail: (v) => `ICE BofA HY OAS at ${v.toFixed(0)}bps — above long-run median` },
    ],
  },
  {
    id: "T10Y2Y", label: "10Y-2Y Spread", category: "TREASURY",
    thresholds: [
      { level: -80, op: "lte", severity: "HIGH", title: "Deep yield curve inversion", detail: (v) => `10Y-2Y spread at ${v.toFixed(0)}bps — deep inversion, recession signal` },
      { level: -40, op: "lte", severity: "MEDIUM", title: "Yield curve inverted", detail: (v) => `10Y-2Y spread at ${v.toFixed(0)}bps — inverted` },
      { level: 150, op: "gte", severity: "MEDIUM", title: "Yield curve steep", detail: (v) => `10Y-2Y spread at ${v.toFixed(0)}bps — unusually steep` },
    ],
  },
  {
    id: "DGS10", label: "US 10Y", category: "TREASURY",
    thresholds: [
      { level: 5.0, op: "gte", severity: "HIGH", title: "10Y yield breach — 5% handle", detail: (v) => `US 10Y at ${v.toFixed(2)}% — funding cost pressure` },
      { level: 4.75, op: "gte", severity: "MEDIUM", title: "10Y yield elevated", detail: (v) => `US 10Y at ${v.toFixed(2)}% — above recent range` },
    ],
  },
];

export function evaluateLiveAlerts(liveData: LiveAlertData): Alert[] {
  const alerts: Alert[] = [];
  const simTitles = new Set(TEMPLATES.map((t) => t.title));
  let seq = 5000;

  for (const def of LIVE_THRESHOLDS) {
    const series = liveData[def.id];
    if (!series?.observations?.length) continue;
    const latest = series.observations[series.observations.length - 1];
    if (latest == null) continue;
    const v = latest.value;

    for (const t of def.thresholds) {
      const triggered = t.op === "gte" ? v >= t.level : v <= t.level;
      if (!triggered) continue;
      const title = t.title;
      if (simTitles.has(title)) continue;
      alerts.push({
        id: `ALR-LIVE-${seq++}`,
        ts: new Date().toISOString().slice(11, 19),
        minsAgo: 0,
        severity: t.severity,
        category: def.category,
        title,
        detail: t.detail(v),
        metric: def.id === "VIXCLS" ? `VIX ${v.toFixed(1)}` : `${v.toFixed(1)}`,
        acked: false,
      });
      break;
    }
  }
  return alerts;
}
