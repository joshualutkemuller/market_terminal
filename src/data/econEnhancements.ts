/** Shared Economics & Macro enhancement data used by the roadmap feature pass. */

export interface SfeFactorLink {
  metric: string;
  macroFactorId: string;
  factorLabel: string;
  source: "FRED" | "YAHOO" | "LOCAL";
  sensitivityBps: number;
  confidence: number;
  deskUse: string;
}

export interface SfePnlBridge {
  driver: string;
  factorId: string;
  baseBps: number;
  shockBps: number;
  pnlImpact: number;
  desk: "SLAB" | "REINV" | "CASH" | "COLL";
}

export interface SfeScenario {
  scenario: string;
  repoShockBps: number;
  rebateShockBps: number;
  reinvestShockBps: number;
  specialnessShockBps: number;
  pnlImpact: number;
}

export interface StatStudyPack {
  id: string;
  name: string;
  question: string;
  driver: string;
  target: string;
  series: string[];
  transform: "level" | "chg" | "yoy";
  lag: number;
  rollingWindow: number;
  deskUse: string;
  confidence: number;
}

export function getSfeFactorLinks(): SfeFactorLink[] {
  return [
    { metric: "Cash reinvestment yield", macroFactorId: "SOFR", factorLabel: "SOFR", source: "FRED", sensitivityBps: 82, confidence: 89, deskUse: "Reset ladder yield and rebate economics" },
    { metric: "Funding cost of book", macroFactorId: "EFFR", factorLabel: "Effective Fed Funds", source: "FRED", sensitivityBps: 96, confidence: 91, deskUse: "Book funding cost and prime financing NIM" },
    { metric: "GC repo pressure", macroFactorId: "SOFR_EFFR", factorLabel: "SOFR minus EFFR", source: "FRED", sensitivityBps: 67, confidence: 76, deskUse: "Repo squeeze warning and cash funding premium" },
    { metric: "Specials activity", macroFactorId: "HYG_LQD", factorLabel: "HY vs IG credit proxy", source: "YAHOO", sensitivityBps: 38, confidence: 64, deskUse: "Short demand and HTB fee pressure" },
    { metric: "Collateral drag", macroFactorId: "BAMLH0A0HYM2", factorLabel: "HY OAS", source: "FRED", sensitivityBps: 44, confidence: 72, deskUse: "Haircut overlays and eligibility pressure" },
    { metric: "Liquidity buffer", macroFactorId: "LOCAL_LIQ_BUFFER", factorLabel: "Internal liquidity buffer", source: "LOCAL", sensitivityBps: 52, confidence: 69, deskUse: "Optimization penalty for scarce cash and HQLA" },
  ];
}

export function getSfePnlBridge(): SfePnlBridge[] {
  return [
    { driver: "Rebate repricing", factorId: "EFFR", baseBps: 388, shockBps: -25, pnlImpact: 4.2e6, desk: "SLAB" },
    { driver: "Reinvestment carry", factorId: "SOFR", baseBps: 433, shockBps: -21, pnlImpact: -3.8e6, desk: "REINV" },
    { driver: "GC funding cost", factorId: "SOFR_EFFR", baseBps: 455, shockBps: -24, pnlImpact: 5.1e6, desk: "CASH" },
    { driver: "Specialness pickup", factorId: "HYG_LQD", baseBps: 48, shockBps: 7, pnlImpact: 2.4e6, desk: "SLAB" },
    { driver: "Collateral haircut drag", factorId: "BAMLH0A0HYM2", baseBps: 32, shockBps: 5, pnlImpact: -1.6e6, desk: "COLL" },
  ];
}

export function getSfeScenarioLibrary(): SfeScenario[] {
  return [
    { scenario: "Fed 25bp cut", repoShockBps: -24, rebateShockBps: -23, reinvestShockBps: -21, specialnessShockBps: 4, pnlImpact: 3.1e6 },
    { scenario: "Fed 100bp cut", repoShockBps: -96, rebateShockBps: -91, reinvestShockBps: -84, specialnessShockBps: 16, pnlImpact: 9.8e6 },
    { scenario: "Repo squeeze", repoShockBps: 38, rebateShockBps: 4, reinvestShockBps: 8, specialnessShockBps: 11, pnlImpact: -5.6e6 },
    { scenario: "Credit shock", repoShockBps: 12, rebateShockBps: 0, reinvestShockBps: -6, specialnessShockBps: 28, pnlImpact: 1.7e6 },
    { scenario: "Reserve drain", repoShockBps: 24, rebateShockBps: 3, reinvestShockBps: 5, specialnessShockBps: 9, pnlImpact: -2.9e6 },
  ];
}

export function getStatStudyPacks(): StatStudyPack[] {
  return [
    {
      id: "rates-reinvestment",
      name: "Rates to reinvestment income",
      question: "Do policy rates lead cash collateral reinvestment economics?",
      driver: "EFFR",
      target: "10Y",
      series: ["EFFR", "10Y", "2Y", "2s10s"],
      transform: "chg",
      lag: 2,
      rollingWindow: 12,
      deskUse: "Feed SFE and REINV rate-beta assumptions.",
      confidence: 82,
    },
    {
      id: "oas-haircuts",
      name: "HY OAS to haircut stress",
      question: "Does credit spread widening lead collateral haircut pressure?",
      driver: "HY OAS",
      target: "2s10s",
      series: ["HY OAS", "2s10s", "VIX", "USD"],
      transform: "chg",
      lag: 3,
      rollingWindow: 24,
      deskUse: "Feed COLL dynamic haircut overlays.",
      confidence: 74,
    },
    {
      id: "vol-htb",
      name: "Volatility to HTB demand",
      question: "Does volatility explain specials and HTB pressure?",
      driver: "VIX",
      target: "HY OAS",
      series: ["VIX", "HY OAS", "10Y", "USD"],
      transform: "chg",
      lag: 1,
      rollingWindow: 12,
      deskUse: "Feed SLAB fair-fee and recall queues.",
      confidence: 69,
    },
    {
      id: "curve-demand",
      name: "Curve to lending demand",
      question: "Does curve inversion lead recession-linked borrow demand?",
      driver: "2s10s",
      target: "U-3",
      series: ["2s10s", "U-3", "EFFR", "HY OAS"],
      transform: "level",
      lag: 4,
      rollingWindow: 24,
      deskUse: "Feed REGIME and SLAB demand playbooks.",
      confidence: 78,
    },
    {
      id: "funding-stress",
      name: "Funding stress proxy",
      question: "Do rate and credit shocks travel together into funding stress?",
      driver: "EFFR",
      target: "HY OAS",
      series: ["EFFR", "HY OAS", "VIX", "USD"],
      transform: "chg",
      lag: 2,
      rollingWindow: 12,
      deskUse: "Feed LIQ and CASH early-warning rules.",
      confidence: 71,
    },
  ];
}
