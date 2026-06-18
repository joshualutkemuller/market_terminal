import { Rng } from "@/lib/rng";

/**
 * Policy-rate expectations & economic calendar.
 *
 * Rate-hike/cut probabilities use the CME FedWatch methodology: implied
 * probabilities derived from 30-Day Fed Funds futures (CME: ZQ). A free public
 * futures feed isn't generally available, so the simulation encodes a plausible
 * easing path; the structure is wired so a futures source can replace it.
 */

export const CURRENT_TARGET = { low: 4.0, high: 4.25, mid: 4.125 };
const BP = 0.25;

export interface FomcMeeting {
  date: string;
  label: string;
  daysOut: number;
  /** probability distribution over outcomes relative to current at that meeting */
  outcomes: { move: number; prob: number }[]; // move in bps (negative = cut)
  impliedRate: number; // expected effective rate after meeting
  mostLikely: string;
}

/** Upcoming FOMC meetings with an easing bias path. */
export function getFomcMeetings(): FomcMeeting[] {
  const meetings: [string, string, number][] = [
    ["2026-07-29", "Jul 2026", 42],
    ["2026-09-16", "Sep 2026", 91],
    ["2026-10-28", "Oct 2026", 133],
    ["2026-12-09", "Dec 2026", 175],
    ["2027-01-27", "Jan 2027", 224],
    ["2027-03-17", "Mar 2027", 273],
  ];
  // cumulative expected cuts grow with horizon
  let cumExpected = 0;
  return meetings.map(([date, label, daysOut], i) => {
    const rng = new Rng(`fomc-${date}`);
    // probability of a 25bp cut rises then fades as terminal approaches
    const cutProb = Math.max(0.05, Math.min(0.82, 0.18 + i * 0.16 - Math.max(0, i - 3) * 0.12));
    const holdProb = 1 - cutProb - 0.04;
    const cut50 = 0.04 * (i >= 2 ? 1 : 0.3);
    const outcomes = [
      { move: -50, prob: Number(cut50.toFixed(3)) },
      { move: -25, prob: Number((cutProb).toFixed(3)) },
      { move: 0, prob: Number((Math.max(0.02, holdProb - cut50)).toFixed(3)) },
      { move: 25, prob: 0.02 },
    ];
    cumExpected += outcomes.reduce((a, o) => a + (o.move / 100) * o.prob, 0);
    const impliedRate = Number((CURRENT_TARGET.mid + cumExpected).toFixed(3));
    const ml = outcomes.reduce((a, b) => (b.prob > a.prob ? b : a));
    const mostLikely = ml.move === 0 ? "Hold" : ml.move < 0 ? `${Math.abs(ml.move)}bp Cut` : `${ml.move}bp Hike`;
    return { date, label, daysOut, outcomes, impliedRate, mostLikely };
  });
}

/** Implied policy path (expected effective fed funds rate over time). */
export function getImpliedPath(): { label: string; rate: number }[] {
  const m = getFomcMeetings();
  return [{ label: "Now", rate: CURRENT_TARGET.mid }, ...m.map((x) => ({ label: x.label, rate: x.impliedRate }))];
}

export interface PathSnapshot {
  asOf: string; // ISO date the path was priced
  label: string;
  startRate: number;
  terminalRate: number;
  cutsImplied: number; // 25bp-equivalent cuts to terminal
  path: { label: string; rate: number }[];
  color: string;
}

const PATH_HORIZONS = ["Spot", "+3M", "+6M", "+9M", "+12M", "+18M", "+24M"];

/**
 * How the market-implied policy path has evolved. Each snapshot is the forward
 * fed-funds path as priced on its `asOf` date, so users can see the path drift
 * (hawkish/dovish repricing) over time with the exact generation date surfaced.
 */
export function getPolicyPathHistory(): PathSnapshot[] {
  // asOf, label, then-current rate, then-priced terminal, color
  const defs: [string, string, number, number, string][] = [
    ["2026-06-17", "Today", 4.125, 3.35, "#FF8C00"],
    ["2026-06-10", "1 Week Ago", 4.125, 3.4, "#3B9DFF"],
    ["2026-05-17", "1 Month Ago", 4.125, 3.28, "#2ECC71"],
    ["2026-04-29", "Last FOMC (Apr 29)", 4.375, 3.42, "#A78BFA"],
    ["2026-03-17", "3 Months Ago", 4.375, 3.55, "#22D3EE"],
    ["2026-01-02", "Year Start", 4.625, 3.5, "#EC4899"],
    ["2025-12-17", "6 Months Ago", 4.625, 3.15, "#FFB400"],
  ];
  return defs.map(([asOf, label, startRate, terminalRate, color]) => {
    const path = PATH_HORIZONS.map((h, i) => {
      // smooth ease from start toward terminal across the horizon
      const f = i / (PATH_HORIZONS.length - 1);
      const ease = 1 - Math.pow(1 - f, 1.7);
      return { label: h, rate: Number((startRate + (terminalRate - startRate) * ease).toFixed(3)) };
    });
    return {
      asOf, label, startRate, terminalRate,
      cutsImplied: Number(((startRate - terminalRate) / 0.25).toFixed(1)),
      path, color,
    };
  });
}

export const POLICY_PATH_HORIZONS = PATH_HORIZONS;

export interface DotPlotDot {
  year: string;
  rate: number;
  count: number;
}

/** Stylized FOMC Summary of Economic Projections "dot plot". */
export function getDotPlot(): { years: string[]; dots: DotPlotDot[]; median: Record<string, number> } {
  const years = ["2026", "2027", "2028", "Longer run"];
  const centers = [3.6, 3.1, 2.9, 2.9];
  const spreads = [0.55, 0.7, 0.6, 0.4];
  const dots: DotPlotDot[] = [];
  const rng = new Rng("dotplot");
  const median: Record<string, number> = {};
  years.forEach((year, yi) => {
    const levels = new Map<number, number>();
    for (let d = 0; d < 19; d++) {
      const r = Math.round((centers[yi] + rng.normal(0, spreads[yi])) / BP) * BP;
      levels.set(r, (levels.get(r) ?? 0) + 1);
    }
    [...levels.entries()].forEach(([rate, count]) => dots.push({ year, rate, count }));
    median[year] = Math.round(centers[yi] / BP) * BP;
  });
  return { years, dots, median };
}

export type EventImportance = "HIGH" | "MEDIUM" | "LOW";

export interface EconEvent {
  id: string;
  date: string;
  time: string;
  daysOut: number;
  name: string;
  category: string;
  importance: EventImportance;
  period: string;
  prior: string;
  consensus: string;
  actual: string | null;
  fredId?: string;
}

const EVENT_DEFS: [string, string, string, EventImportance, string, string, string][] = [
  // name, category, time, importance, period, prior, consensus
  ["CPI (m/m)", "Inflation", "08:30", "HIGH", "May", "0.2%", "0.2%"],
  ["Core CPI (m/m)", "Inflation", "08:30", "HIGH", "May", "0.3%", "0.3%"],
  ["Nonfarm Payrolls", "Labor", "08:30", "HIGH", "Jun", "139k", "145k"],
  ["Unemployment Rate", "Labor", "08:30", "HIGH", "Jun", "4.3%", "4.3%"],
  ["Initial Jobless Claims", "Labor", "08:30", "MEDIUM", "Wk", "233k", "235k"],
  ["Retail Sales (m/m)", "Consumer", "08:30", "HIGH", "May", "0.1%", "0.3%"],
  ["FOMC Rate Decision", "Policy", "14:00", "HIGH", "Jul", "4.00-4.25%", "4.00-4.25%"],
  ["FOMC Press Conference", "Policy", "14:30", "HIGH", "Jul", "—", "—"],
  ["Core PCE (m/m)", "Inflation", "08:30", "HIGH", "May", "0.2%", "0.2%"],
  ["ISM Manufacturing", "Activity", "10:00", "MEDIUM", "Jun", "49.2", "49.5"],
  ["ISM Services", "Activity", "10:00", "MEDIUM", "Jun", "52.6", "52.8"],
  ["GDP (q/q, 2nd est.)", "Growth", "08:30", "HIGH", "Q1", "2.1%", "2.1%"],
  ["U. Mich Sentiment", "Consumer", "10:00", "LOW", "Jun", "68.4", "69.0"],
  ["JOLTS Job Openings", "Labor", "10:00", "MEDIUM", "May", "7.4M", "7.3M"],
  ["Housing Starts", "Housing", "08:30", "LOW", "May", "1.36M", "1.35M"],
  ["10Y Treasury Auction", "Supply", "13:00", "MEDIUM", "Jun", "4.16%", "—"],
  ["PPI (m/m)", "Inflation", "08:30", "MEDIUM", "May", "0.1%", "0.2%"],
  ["Fed Beige Book", "Policy", "14:00", "LOW", "Jul", "—", "—"],
];

export function getEconEvents(): EconEvent[] {
  const rng = new Rng("events");
  return EVENT_DEFS.map((d, i) => {
    const [name, category, time, importance, period, prior, consensus] = d;
    const daysOut = rng.int(-3, 18);
    const date = new Date(Date.UTC(2026, 5, 17) + daysOut * 86400000).toISOString().slice(0, 10);
    // released if in the past
    const released = daysOut < 0;
    const actual = released ? consensus : null;
    return { id: `EV-${i}`, date, time, daysOut, name, category, importance, period, prior, consensus, actual };
  }).sort((a, b) => a.daysOut - b.daysOut);
}
