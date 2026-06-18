import { Rng } from "@/lib/rng";
import { seriesById, ECON_TODAY } from "./econSeries";

/** Macro series analyzed in the Statistical Analysis module (id -> short label). */
export const STAT_SERIES: [string, string][] = [
  ["DGS10", "10Y"],
  ["DGS2", "2Y"],
  ["T10Y2Y", "2s10s"],
  ["FEDFUNDS", "EFFR"],
  ["CPIAUCSL", "CPI"],
  ["CPILFESL", "CoreCPI"],
  ["UNRATE", "U-3"],
  ["BAMLH0A0HYM2", "HY OAS"],
  ["VIXCLS", "VIX"],
  ["DTWEXBGS", "USD"],
];

export const STAT_LABELS = STAT_SERIES.map(([, l]) => l);

export function monthlyDate(monthsAgo: number): string {
  const d = new Date(Date.UTC(ECON_TODAY.getUTCFullYear(), ECON_TODAY.getUTCMonth() - monthsAgo, 1));
  return d.toISOString().slice(0, 10);
}

export interface StatPoint {
  date: string;
  value: number;
}
export interface StatSeries {
  id: string;
  label: string;
  points: StatPoint[];
}

/**
 * Deterministic long monthly history (default ~25y) for every stat series, used
 * as the simulation source. A mean-reverting walk anchored to each series' level
 * keeps server and client output identical.
 */
export function simStatFull(months = 300): StatSeries[] {
  return STAT_SERIES.map(([id, label]) => {
    const s = seriesById(id);
    const level = s?.level ?? 1;
    const vol = (s?.vol ?? 0.05) * 1.4;
    const rng = new Rng(`statfull-${id}`);
    // build backwards from level so the latest point matches level
    const raw: number[] = [];
    let x = level;
    for (let i = 0; i < months; i++) {
      x = x - rng.normal(0, vol);
      raw.push(x);
    }
    raw.reverse();
    const shift = level - raw[raw.length - 1];
    const dp = s?.decimals ?? 2;
    const points = raw.map((v, i) => ({ date: monthlyDate(months - 1 - i), value: Number((v + shift).toFixed(dp)) }));
    return { id, label, points };
  });
}
