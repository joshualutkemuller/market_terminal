import { getSeriesHistory, ECON_TODAY } from "./econSeries";
import type { Obs } from "@/lib/stats";

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

export function monthlyDate(monthsAgo: number): string {
  const d = new Date(Date.UTC(ECON_TODAY.getUTCFullYear(), ECON_TODAY.getUTCMonth() - monthsAgo, 1));
  return d.toISOString().slice(0, 10);
}

/** Simulated monthly history for a series on a shared monthly grid (so all align). */
export function simStatSeries(n = 84): { label: string; obs: Obs[] }[] {
  return STAT_SERIES.map(([id, label]) => {
    const vals = getSeriesHistory(id, n).map((o) => o.value);
    return { label, obs: vals.map((value, i) => ({ date: monthlyDate(vals.length - 1 - i), value })) };
  });
}
