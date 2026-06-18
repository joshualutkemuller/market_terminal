import { Rng } from "@/lib/rng";

/**
 * Credit spreads deep-dive — ICE BofA OAS by rating bucket, IG/HY aggregates,
 * quality & compression spreads, historical percentiles and stress episodes.
 * Each rating maps to its FRED OAS series id so it is drillable to 24m live data.
 */

export interface CreditRung {
  rating: string;
  fredId: string;
  grade: "IG" | "HY";
  oas: number; // bps
  prior: number;
  chg1d: number; // bps
  chg1m: number;
  yield: number; // %
  pctile: number; // 0-100 percentile vs 10y history (lower = tight)
  z: number; // z-score vs 1y
  dur: number; // spread duration (yrs)
}

// rating, fredId, grade, oas, yield, spreadDuration, 10y-percentile
const RUNGS: [string, string, "IG" | "HY", number, number, number, number][] = [
  ["AAA", "BAMLC0A1CAAA", "IG", 48, 4.78, 7.1, 22],
  ["AA", "BAMLC0A2CAA", "IG", 62, 4.92, 6.6, 26],
  ["A", "BAMLC0A3CA", "IG", 84, 5.1, 6.9, 31],
  ["BBB", "BAMLC0A4CBBB", "IG", 124, 5.46, 6.4, 34],
  ["BB", "BAMLH0A1HYBB", "HY", 215, 6.62, 4.2, 28],
  ["B", "BAMLH0A2HYB", "HY", 348, 7.84, 3.6, 33],
  ["CCC", "BAMLH0A3HYC", "HY", 742, 11.9, 2.8, 41],
];

export function getCreditCurve(): CreditRung[] {
  return RUNGS.map(([rating, fredId, grade, oas, yld, dur, pctile]) => {
    const rng = new Rng(`credit-${rating}`);
    const prior = oas - Math.round(rng.normal(0, oas * 0.02));
    return {
      rating, fredId, grade, oas, prior,
      chg1d: oas - prior,
      chg1m: Math.round(rng.normal(-2, oas * 0.05)),
      yield: yld,
      pctile,
      z: Number(rng.normal(-0.4, 0.7).toFixed(2)),
      dur,
    };
  });
}

export interface CreditSummary {
  igOas: number;
  hyOas: number;
  igHySpread: number; // HY - IG
  qualitySpread: number; // CCC - BB
  bbbAaa: number; // BBB - AAA (IG compression)
  igYield: number;
  hyYield: number;
  igChg1d: number;
  hyChg1d: number;
  igPctile: number;
  hyPctile: number;
  distressRatio: number; // % of HY trading >1000bps
  defaultRate: number; // trailing 12m HY default %
  regime: "TIGHT" | "NEUTRAL" | "WIDE" | "STRESS";
}

export function getCreditSummary(): CreditSummary {
  const c = getCreditCurve();
  const ig = 92, hy = 388; // master aggregates (bps)
  const get = (r: string) => c.find((x) => x.rating === r)!;
  const igChg = get("BBB").chg1d - 2;
  const hyChg = get("B").chg1d;
  const regime: CreditSummary["regime"] = hy > 800 ? "STRESS" : hy > 500 ? "WIDE" : hy < 350 ? "TIGHT" : "NEUTRAL";
  return {
    igOas: ig, hyOas: hy,
    igHySpread: hy - ig,
    qualitySpread: get("CCC").oas - get("BB").oas,
    bbbAaa: get("BBB").oas - get("AAA").oas,
    igYield: 5.18, hyYield: 7.62,
    igChg1d: igChg, hyChg1d: hyChg,
    igPctile: 18, hyPctile: 24,
    distressRatio: 5.4,
    defaultRate: 2.8,
    regime,
  };
}

/** Long history of IG & HY OAS (bps) with stress episodes shaded by name. */
export function getSpreadHistory(years = 18): { date: string; ig: number; hy: number; episode: string | null }[] {
  const knots: [number, number, number, string | null][] = [
    // year, ig, hy, episode
    [2008, 555, 1650, "GFC"],
    [2009, 480, 1400, "GFC"],
    [2010, 170, 600, null],
    [2011, 240, 720, "EU Debt"],
    [2012, 160, 580, null],
    [2014, 130, 480, null],
    [2016, 215, 840, "Oil/EM"],
    [2018, 160, 540, null],
    [2020, 270, 1100, "COVID"],
    [2021, 95, 320, null],
    [2022, 165, 520, "Hiking"],
    [2023, 130, 460, "SVB"],
    [2024, 100, 340, null],
    [2025, 95, 360, null],
    [2026.45, 92, 388, null],
  ];
  const rng = new Rng("credit-hist");
  const out: { date: string; ig: number; hy: number; episode: string | null }[] = [];
  const start = 2026.45 - years;
  for (let t = start; t <= 2026.45; t += 0.25) {
    let ig = knots[knots.length - 1][1], hy = knots[knots.length - 1][2], ep: string | null = null;
    for (let k = 0; k < knots.length - 1; k++) {
      if (t >= knots[k][0] && t <= knots[k + 1][0]) {
        const f = (t - knots[k][0]) / (knots[k + 1][0] - knots[k][0]);
        ig = knots[k][1] + f * (knots[k + 1][1] - knots[k][1]);
        hy = knots[k][2] + f * (knots[k + 1][2] - knots[k][2]);
        ep = f < 0.5 ? knots[k][3] : knots[k + 1][3];
        break;
      }
    }
    const year = Math.floor(t);
    const q = Math.floor((t - year) * 4) + 1;
    out.push({ date: `${year}Q${q}`, ig: Math.round(ig + rng.normal(0, 8)), hy: Math.round(hy + rng.normal(0, 25)), episode: ep });
  }
  return out;
}

export interface SectorSpread {
  sector: string;
  oas: number;
  chg1m: number;
  grade: "IG" | "HY";
}

export function getSectorSpreads(): SectorSpread[] {
  const rng = new Rng("credit-sector");
  const defs: [string, number, "IG" | "HY"][] = [
    ["Financials", 96, "IG"], ["Energy", 138, "IG"], ["Technology", 78, "IG"], ["Healthcare", 88, "IG"],
    ["Utilities", 92, "IG"], ["Industrials", 102, "IG"], ["Consumer", 110, "IG"], ["Real Estate", 152, "IG"],
    ["Telecom", 124, "IG"], ["HY Energy", 420, "HY"], ["HY Retail", 510, "HY"], ["HY Media", 385, "HY"],
  ];
  return defs.map(([sector, oas, grade]) => ({ sector, oas, chg1m: Math.round(rng.normal(-3, 14)), grade })).sort((a, b) => b.oas - a.oas);
}

export interface CreditStress {
  name: string;
  peakIg: number;
  peakHy: number;
  drawdownPct: number; // HY total return drawdown
  defaultPeak: number;
}

export function getStressEpisodes(): CreditStress[] {
  return [
    { name: "GFC (2008-09)", peakIg: 618, peakHy: 1971, drawdownPct: -33.2, defaultPeak: 14.7 },
    { name: "EU Sovereign (2011)", peakIg: 264, peakHy: 902, drawdownPct: -7.1, defaultPeak: 2.1 },
    { name: "Oil/EM (2015-16)", peakIg: 221, peakHy: 887, drawdownPct: -5.4, defaultPeak: 5.1 },
    { name: "COVID (2020)", peakIg: 401, peakHy: 1100, drawdownPct: -21.0, defaultPeak: 8.4 },
    { name: "Hiking/SVB (2022-23)", peakIg: 168, peakHy: 599, drawdownPct: -11.2, defaultPeak: 3.0 },
  ];
}

/** Securities-finance linkage of credit conditions. */
export function getCreditLinkages(): { driver: string; impact: string; effect: "up" | "down" }[] {
  return [
    { driver: "HY spreads widening", impact: "Short demand for HY ETFs/credit rises; borrow fees firm", effect: "up" },
    { driver: "CCC distress ratio up", impact: "Specials in stressed issuers; recall risk on lent names", effect: "up" },
    { driver: "IG compression (BBB-AAA tight)", impact: "Low dispersion → less relative-value short demand", effect: "down" },
    { driver: "Primary issuance surge", impact: "More lendable supply; settlement/financing demand rises", effect: "up" },
    { driver: "Credit ETF creation/redemption", impact: "Drives borrow on HYG/JNK; arb financing flows", effect: "up" },
  ];
}
