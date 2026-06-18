import { Rng } from "@/lib/rng";

/** Macro regime to desk playbook analytics. */

export type RegimeState = "EASING" | "TIGHTENING" | "RISK_ON" | "RISK_OFF" | "STAGFLATION" | "RECESSION_WATCH";
export type Desk = "SLAB" | "COLL" | "CASH" | "REINV" | "LIQ" | "OPT";

export interface RegimeSummary {
  state: RegimeState;
  probability: number;
  riskScore: number;
  growthScore: number;
  inflationScore: number;
  liquidityScore: number;
  policyBias: "DOVISH" | "NEUTRAL" | "HAWKISH";
  activePlaybooks: number;
}

export interface RegimeFactor {
  factor: string;
  source: "FRED" | "YAHOO" | "LOCAL";
  value: number;
  zScore: number;
  signal: "SUPPORTS" | "CONFLICTS" | "NEUTRAL";
  weight: number;
  stateLink: RegimeState;
}

export interface DeskPlaybook {
  desk: Desk;
  action: string;
  rationale: string;
  urgency: "HIGH" | "MED" | "LOW";
  expectedImpact: number;
  linkedFactor: string;
}

export interface RegimeTransition {
  from: RegimeState;
  to: RegimeState;
  probability: number;
  trigger: string;
}

export interface RegimeExposure {
  desk: Desk;
  carryImpact: number;
  marginImpact: number;
  liquidityImpact: number;
  recommendedBias: "ADD_RISK" | "HOLD" | "DEFEND";
}

export function getRegimeSummary(): RegimeSummary {
  return {
    state: "EASING",
    probability: 64,
    riskScore: 58,
    growthScore: 46,
    inflationScore: 52,
    liquidityScore: 61,
    policyBias: "DOVISH",
    activePlaybooks: 8,
  };
}

export function getRegimeFactors(): RegimeFactor[] {
  return [
    { factor: "2s10s curve slope", source: "FRED", value: -32, zScore: -1.4, signal: "SUPPORTS", weight: 16, stateLink: "EASING" },
    { factor: "3m10y curve slope", source: "FRED", value: -78, zScore: -1.8, signal: "SUPPORTS", weight: 15, stateLink: "RECESSION_WATCH" },
    { factor: "Core PCE momentum", source: "FRED", value: 2.7, zScore: 0.4, signal: "NEUTRAL", weight: 11, stateLink: "STAGFLATION" },
    { factor: "HY OAS level", source: "FRED", value: 382, zScore: 0.7, signal: "CONFLICTS", weight: 13, stateLink: "RISK_OFF" },
    { factor: "Equity drawdown proxy", source: "YAHOO", value: -4.1, zScore: -0.5, signal: "NEUTRAL", weight: 10, stateLink: "RISK_OFF" },
    { factor: "HYG/LQD relative return", source: "YAHOO", value: -1.2, zScore: -0.8, signal: "SUPPORTS", weight: 8, stateLink: "RISK_OFF" },
    { factor: "SOFR-EFFR spread", source: "FRED", value: 14, zScore: 1.1, signal: "SUPPORTS", weight: 9, stateLink: "TIGHTENING" },
    { factor: "Internal funding buffer", source: "LOCAL", value: 18.6, zScore: 0.9, signal: "SUPPORTS", weight: 18, stateLink: "EASING" },
  ];
}

export function getDeskPlaybooks(): DeskPlaybook[] {
  return [
    {
      desk: "REINV",
      action: "Shorten reset profile and keep T+0 liquidity above 40%.",
      rationale: "Easing path reduces cash collateral carry; protect reinvestment spread with faster resets.",
      urgency: "HIGH",
      expectedImpact: 2.8e6,
      linkedFactor: "2s10s curve slope",
    },
    {
      desk: "SLAB",
      action: "Raise review priority for specials with high recall value.",
      rationale: "Risk-off transition probability is rising, which can lift borrow demand but increase recall risk.",
      urgency: "MED",
      expectedImpact: 1.9e6,
      linkedFactor: "HYG/LQD relative return",
    },
    {
      desk: "COLL",
      action: "Favor HQLA collateral substitutions over HY and equity collateral.",
      rationale: "Credit spread pressure can raise haircut overlays and weaken eligibility breadth.",
      urgency: "HIGH",
      expectedImpact: 3.3e6,
      linkedFactor: "HY OAS level",
    },
    {
      desk: "CASH",
      action: "Keep term repo dry powder for CPI and FOMC event windows.",
      rationale: "Policy repricing can widen funding spreads quickly.",
      urgency: "MED",
      expectedImpact: 1.4e6,
      linkedFactor: "SOFR-EFFR spread",
    },
    {
      desk: "LIQ",
      action: "Run repo squeeze and prime client draw stress before close.",
      rationale: "Liquidity score is positive but early-warning breadth has moved from green to watch.",
      urgency: "HIGH",
      expectedImpact: 2.2e6,
      linkedFactor: "Internal funding buffer",
    },
    {
      desk: "OPT",
      action: "Increase penalty on term liquidity usage in optimization runs.",
      rationale: "Protect scarce collateral and cash optionality while policy path is repricing.",
      urgency: "MED",
      expectedImpact: 2.5e6,
      linkedFactor: "3m10y curve slope",
    },
  ];
}

export function getRegimeTransitions(): RegimeTransition[] {
  return [
    { from: "EASING", to: "RISK_OFF", probability: 28, trigger: "HY OAS widens by 75 bps and equity proxy falls 6%" },
    { from: "EASING", to: "RECESSION_WATCH", probability: 34, trigger: "3m10y inversion persists with claims acceleration" },
    { from: "EASING", to: "RISK_ON", probability: 24, trigger: "Core PCE slows and HY OAS tightens below 325 bps" },
    { from: "EASING", to: "STAGFLATION", probability: 9, trigger: "Inflation momentum re-accelerates while growth score weakens" },
    { from: "EASING", to: "TIGHTENING", probability: 5, trigger: "Policy path reprices higher by 50 bps" },
  ];
}

export function getRegimeExposures(): RegimeExposure[] {
  const rng = new Rng("regime-exposures");
  const desks: Desk[] = ["SLAB", "COLL", "CASH", "REINV", "LIQ", "OPT"];
  return desks.map((desk) => {
    const carryImpact = rng.float(-4.5, 4.8) * 1e6;
    const marginImpact = rng.float(-5.2, 2.4) * 1e6;
    const liquidityImpact = rng.float(-4.8, 3.2) * 1e6;
    const total = carryImpact + marginImpact + liquidityImpact;
    return {
      desk,
      carryImpact,
      marginImpact,
      liquidityImpact,
      recommendedBias: total > 2e6 ? "ADD_RISK" : total < -2e6 ? "DEFEND" : "HOLD",
    };
  });
}
