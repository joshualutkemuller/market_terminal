import { Rng } from "@/lib/rng";

/** Sources & Uses matching engine — internalization & funding savings. */

export interface SourceNode {
  id: string;
  label: string;
  category: "INTERNAL_INV" | "CLIENT_INV" | "LENDING_INV" | "TREASURY_CASH";
  amount: number;
  costBps: number;
}

export interface UseNode {
  id: string;
  label: string;
  category: "SHORT_DEMAND" | "MARGIN_REQ" | "FINANCING_DEMAND" | "SETTLEMENT";
  amount: number;
  bidBps: number;
}

export interface MatchRow {
  source: string;
  use: string;
  asset: string;
  amount: number;
  internalized: boolean;
  fundingSavingBps: number;
  revenueImpact: number;
}

export function getSources(): SourceNode[] {
  const rng = new Rng("sxu-src");
  const defs: [string, SourceNode["category"], number][] = [
    ["Internal Inventory Box", "INTERNAL_INV", 14.2],
    ["Agency Lending Pool", "LENDING_INV", 22.8],
    ["Prime Client Long Inventory", "CLIENT_INV", 31.4],
    ["Beneficial Owner Supply", "LENDING_INV", 18.6],
    ["Treasury Cash Reserve", "TREASURY_CASH", 9.4],
    ["Reinvested Cash Collateral", "TREASURY_CASH", 12.1],
  ];
  return defs.map(([label, category, amtB], i) => ({
    id: `S${i}`, label, category, amount: amtB * 1e9, costBps: rng.float(2, 18),
  }));
}

export function getUses(): UseNode[] {
  const rng = new Rng("sxu-use");
  const defs: [string, UseNode["category"], number][] = [
    ["Prime Short Demand", "SHORT_DEMAND", 26.4],
    ["CCP Margin Requirement", "MARGIN_REQ", 17.2],
    ["Hedge Fund Financing", "FINANCING_DEMAND", 28.9],
    ["Bilateral Margin Calls", "MARGIN_REQ", 11.8],
    ["DTC Settlement Need", "SETTLEMENT", 8.6],
    ["Specials Borrow Demand", "SHORT_DEMAND", 14.3],
  ];
  return defs.map(([label, category, amtB], i) => ({
    id: `U${i}`, label, category, amount: amtB * 1e9, bidBps: rng.float(12, 95),
  }));
}

export function getMatches(): MatchRow[] {
  const rng = new Rng("sxu-match");
  const sources = getSources();
  const uses = getUses();
  const assets = ["US Treasuries", "USD Cash", "S&P Index", "NVDA", "Agency MBS", "TSLA", "Corp IG", "GME", "Gold"];
  const out: MatchRow[] = [];
  for (let i = 0; i < 14; i++) {
    const s = rng.pick(sources);
    const u = rng.pick(uses);
    const amount = rng.float(0.3, 6) * 1e9;
    const internalized = rng.bool(0.55);
    const savingBps = internalized ? rng.float(6, 24) : rng.float(1, 6);
    out.push({
      source: s.label, use: u.label, asset: rng.pick(assets), amount, internalized,
      fundingSavingBps: savingBps,
      revenueImpact: (amount * savingBps) / 10000,
    });
  }
  return out.sort((a, b) => b.revenueImpact - a.revenueImpact);
}

export interface SxuSummary {
  totalSources: number;
  totalUses: number;
  matched: number;
  internalizationRate: number;
  fundingSavings: number;
  revenueImpact: number;
  unmatchedDemand: number;
}

export function getSxuSummary(): SxuSummary {
  const sources = getSources();
  const uses = getUses();
  const matches = getMatches();
  const totalSources = sources.reduce((a, s) => a + s.amount, 0);
  const totalUses = uses.reduce((a, u) => a + u.amount, 0);
  const matched = matches.reduce((a, m) => a + m.amount, 0);
  const internalized = matches.filter((m) => m.internalized).reduce((a, m) => a + m.amount, 0);
  return {
    totalSources, totalUses,
    matched,
    internalizationRate: (internalized / matched) * 100,
    fundingSavings: matches.reduce((a, m) => a + m.revenueImpact, 0),
    revenueImpact: matches.reduce((a, m) => a + m.revenueImpact, 0),
    unmatchedDemand: Math.max(0, totalUses - matched),
  };
}
