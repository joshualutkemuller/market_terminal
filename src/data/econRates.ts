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

interface EventDef {
  name: string;
  category: string;
  time: string;
  importance: EventImportance;
  freq: "monthly" | "quarterly" | "8x" | "weekly";
  releaseDay: number;
  baseValue: number;
  volatility: number;
  unit: string;
  fmt: (v: number) => string;
}

const pctFmt = (v: number) => `${v.toFixed(1)}%`;
const kFmt = (v: number) => `${Math.round(v)}k`;
const mFmt = (v: number) => `${v.toFixed(2)}M`;
const idxFmt = (v: number) => `${v.toFixed(1)}`;
const rngFmt = (lo: number, hi: number) => `${lo.toFixed(2)}-${hi.toFixed(2)}%`;

const EVENT_SERIES: EventDef[] = [
  { name: "CPI (m/m)", category: "Inflation", time: "08:30", importance: "HIGH", freq: "monthly", releaseDay: 12, baseValue: 0.25, volatility: 0.15, unit: "%", fmt: pctFmt },
  { name: "Core CPI (m/m)", category: "Inflation", time: "08:30", importance: "HIGH", freq: "monthly", releaseDay: 12, baseValue: 0.3, volatility: 0.1, unit: "%", fmt: pctFmt },
  { name: "Nonfarm Payrolls", category: "Labor", time: "08:30", importance: "HIGH", freq: "monthly", releaseDay: 5, baseValue: 180, volatility: 60, unit: "k", fmt: kFmt },
  { name: "Unemployment Rate", category: "Labor", time: "08:30", importance: "HIGH", freq: "monthly", releaseDay: 5, baseValue: 4.2, volatility: 0.2, unit: "%", fmt: pctFmt },
  { name: "Initial Jobless Claims", category: "Labor", time: "08:30", importance: "MEDIUM", freq: "weekly", releaseDay: 4, baseValue: 230, volatility: 15, unit: "k", fmt: kFmt },
  { name: "Retail Sales (m/m)", category: "Consumer", time: "08:30", importance: "HIGH", freq: "monthly", releaseDay: 15, baseValue: 0.2, volatility: 0.3, unit: "%", fmt: pctFmt },
  { name: "FOMC Rate Decision", category: "Policy", time: "14:00", importance: "HIGH", freq: "8x", releaseDay: 0, baseValue: 4.125, volatility: 0, unit: "%", fmt: (v) => rngFmt(v - 0.125, v + 0.125) },
  { name: "Core PCE (m/m)", category: "Inflation", time: "08:30", importance: "HIGH", freq: "monthly", releaseDay: 28, baseValue: 0.25, volatility: 0.1, unit: "%", fmt: pctFmt },
  { name: "ISM Manufacturing", category: "Activity", time: "10:00", importance: "MEDIUM", freq: "monthly", releaseDay: 1, baseValue: 49.5, volatility: 1.5, unit: "", fmt: idxFmt },
  { name: "ISM Services", category: "Activity", time: "10:00", importance: "MEDIUM", freq: "monthly", releaseDay: 3, baseValue: 53.0, volatility: 1.2, unit: "", fmt: idxFmt },
  { name: "GDP (q/q ann.)", category: "Growth", time: "08:30", importance: "HIGH", freq: "quarterly", releaseDay: 27, baseValue: 2.2, volatility: 0.8, unit: "%", fmt: pctFmt },
  { name: "U. Mich Sentiment", category: "Consumer", time: "10:00", importance: "LOW", freq: "monthly", releaseDay: 14, baseValue: 68, volatility: 3, unit: "", fmt: idxFmt },
  { name: "JOLTS Job Openings", category: "Labor", time: "10:00", importance: "MEDIUM", freq: "monthly", releaseDay: 8, baseValue: 7.5, volatility: 0.4, unit: "M", fmt: mFmt },
  { name: "Housing Starts", category: "Housing", time: "08:30", importance: "LOW", freq: "monthly", releaseDay: 17, baseValue: 1.38, volatility: 0.08, unit: "M", fmt: mFmt },
  { name: "PPI (m/m)", category: "Inflation", time: "08:30", importance: "MEDIUM", freq: "monthly", releaseDay: 13, baseValue: 0.15, volatility: 0.2, unit: "%", fmt: pctFmt },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const FOMC_MONTHS = [0, 2, 4, 5, 6, 8, 10, 11];

export interface EventHistoryPoint {
  date: string;
  period: string;
  actual: number;
  consensus: number;
  prior: number;
  surprise: number;
}

export interface EventSeriesHistory {
  name: string;
  category: string;
  importance: EventImportance;
  unit: string;
  points: EventHistoryPoint[];
}

export function getEconEvents(anchor?: Date): EconEvent[] {
  const rng = new Rng("events-v2");
  const base = anchor ?? new Date();
  const todayMs = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());
  const events: EconEvent[] = [];
  let idCounter = 0;

  for (const def of EVENT_SERIES) {
    const months = def.freq === "weekly" ? 14 : 13;
    let prevActual = def.baseValue;

    for (let m = -months; m <= 1; m++) {
      if (def.freq === "quarterly" && m % 3 !== 0) continue;
      if (def.freq === "8x") {
        const monthIdx = (base.getUTCMonth() + m + 120) % 12;
        if (!FOMC_MONTHS.includes(monthIdx)) continue;
      }

      const releaseDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + m, def.releaseDay));
      if (def.freq === "weekly") {
        for (let w = 0; w < 4; w++) {
          const wDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + m, 1 + w * 7 + def.releaseDay));
          const wMs = wDate.getTime();
          const daysOut = Math.round((wMs - todayMs) / 86400000);
          if (daysOut < -365 || daysOut > 21) continue;
          const dateStr = wDate.toISOString().slice(0, 10);
          const consensus = prevActual + rng.float(-def.volatility * 0.3, def.volatility * 0.3);
          const actual = consensus + rng.float(-def.volatility * 0.5, def.volatility * 0.5);
          const released = daysOut < 0;
          const periodLabel = `Wk ${wDate.toISOString().slice(5, 10)}`;
          events.push({
            id: `EV-${idCounter++}`,
            date: dateStr,
            time: def.time,
            daysOut,
            name: def.name,
            category: def.category,
            importance: def.importance,
            period: periodLabel,
            prior: def.fmt(prevActual),
            consensus: def.fmt(consensus),
            actual: released ? def.fmt(actual) : null,
          });
          if (released) prevActual = actual;
        }
        continue;
      }

      const relMs = releaseDate.getTime();
      const daysOut = Math.round((relMs - todayMs) / 86400000);
      if (daysOut < -365 || daysOut > 30) continue;
      const dateStr = releaseDate.toISOString().slice(0, 10);
      const periodMonth = (base.getUTCMonth() + m - 1 + 12) % 12;
      const periodYear = releaseDate.getUTCFullYear() + (base.getUTCMonth() + m - 1 < 0 ? -1 : 0);
      const period = def.freq === "quarterly"
        ? `${QUARTERS[Math.floor(periodMonth / 3)]} ${periodYear}`
        : `${MONTHS[periodMonth]}`;
      const consensus = prevActual + rng.float(-def.volatility * 0.3, def.volatility * 0.3);
      const actual = consensus + rng.float(-def.volatility * 0.5, def.volatility * 0.5);
      const released = daysOut < 0;

      events.push({
        id: `EV-${idCounter++}`,
        date: dateStr,
        time: def.time,
        daysOut,
        name: def.name,
        category: def.category,
        importance: def.importance,
        period,
        prior: def.fmt(prevActual),
        consensus: def.fmt(consensus),
        actual: released ? def.fmt(actual) : null,
      });
      if (released) prevActual = actual;
    }
  }

  return events.sort((a, b) => a.daysOut - b.daysOut);
}

export function getEventSeriesHistory(seriesName?: string): EventSeriesHistory[] {
  const events = getEconEvents();
  const released = events.filter((e) => e.actual != null);
  const byName = new Map<string, EconEvent[]>();
  for (const e of released) {
    const arr = byName.get(e.name) ?? [];
    arr.push(e);
    byName.set(e.name, arr);
  }

  const parseNum = (s: string | null): number | null => {
    if (!s) return null;
    const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
    if (!m) return null;
    let v = parseFloat(m[0]);
    if (/k/i.test(s)) v *= 1;
    if (/M/i.test(s)) v *= 1;
    return isFinite(v) ? v : null;
  };

  const result: EventSeriesHistory[] = [];
  const names = seriesName ? [seriesName] : Array.from(byName.keys());

  for (const name of names) {
    const evts = byName.get(name);
    if (!evts?.length) continue;
    const def = EVENT_SERIES.find((d) => d.name === name);
    if (!def) continue;

    const points: EventHistoryPoint[] = [];
    for (const e of evts) {
      const a = parseNum(e.actual);
      const c = parseNum(e.consensus);
      const p = parseNum(e.prior);
      if (a == null || c == null) continue;
      points.push({
        date: e.date,
        period: e.period,
        actual: a,
        consensus: c,
        prior: p ?? a,
        surprise: a - c,
      });
    }
    points.sort((a, b) => a.date.localeCompare(b.date));
    if (points.length >= 2) {
      result.push({ name, category: def.category, importance: def.importance, unit: def.unit, points });
    }
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export const EVENT_SERIES_NAMES = EVENT_SERIES.map((d) => d.name);
