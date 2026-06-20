"use client";

import { useEffect, useState } from "react";
import { fetchJson, peekFresh } from "@/lib/fetchCache";
import { getSeriesHistory, type Observation } from "@/data/econSeries";
import {
  getCurrentCurve,
  getCurveSnapshots,
  getInversionsForSpread,
  getInversionStats,
  getSpreadSeriesFor,
  type CurveSnapshot,
  type Inversion,
} from "@/data/econCurve";
import { getEconEvents, type EconEvent } from "@/data/econRates";

export type DataSource = "FRED" | "SIM" | "LOADING" | "ETL";

/**
 * Resilient econ data hooks. Each returns the deterministic simulation value
 * immediately (SSR-safe, no empty states), then transparently swaps in live
 * FRED data if the API route reports `source: "FRED"`. `source` drives a
 * LIVE/SIM badge in the UI.
 */
function useEconResource<T>(url: string, fallback: T, pick: (json: any) => T): { data: T; source: DataSource } {
  // Seed from a recently-cached response so re-navigation renders real data
  // instantly instead of flashing the SIM fallback.
  const cached = peekFresh<any>(url);
  const [data, setData] = useState<T>(cached ? pick(cached) : fallback);
  const [source, setSource] = useState<DataSource>(cached ? (cached.source === "FRED" ? "FRED" : "SIM") : "SIM");

  useEffect(() => {
    let alive = true;
    const seed = peekFresh<any>(url);
    if (seed) {
      setData(pick(seed));
      setSource(seed.source === "FRED" ? "FRED" : "SIM");
    } else {
      setSource("LOADING");
    }
    fetchJson<any>(url)
      .then((json) => {
        if (!alive) return;
        setData(pick(json));
        setSource(json.source === "FRED" ? "FRED" : "SIM");
      })
      .catch(() => {
        if (!alive) return;
        setSource("SIM");
      });
    return () => {
      alive = false;
    };
    // `pick` is a stable per-call-site projection; re-running only on `url` is intended.
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, source };
}

export function useEconSeries(id: string, n = 120): { data: Observation[]; source: DataSource } {
  return useEconResource<Observation[]>(`/api/econ/series?id=${id}&n=${n}`, getSeriesHistory(id, n), (j) => j.observations ?? []);
}

export function useLiveCurve(): { data: CurveSnapshot; source: DataSource } {
  return useEconResource<CurveSnapshot>(`/api/econ/curve`, getCurrentCurve(), (j) => j.curve);
}

/**
 * Real point-in-time curve snapshots (Today + 1M/3M/6M/1Y/2Y ago + deep
 * reference curves), assembled server-side from each tenor's FRED daily
 * history. Falls back to the simulated presets without a key.
 */
export function useCurveSnapshots(years = 7): { data: CurveSnapshot[]; source: DataSource } {
  return useEconResource<CurveSnapshot[]>(
    `/api/econ/curve-history?years=${years}`,
    getCurveSnapshots(),
    (j) => (Array.isArray(j.snapshots) && j.snapshots.length ? j.snapshots : getCurveSnapshots())
  );
}

export function useEconCalendar(): { data: EconEvent[]; source: DataSource } {
  return useEconResource<EconEvent[]>(`/api/econ/calendar`, getEconEvents(), (j) => j.events ?? []);
}

export interface InversionData {
  inversions: Inversion[];
  stats: ReturnType<typeof getInversionStats>;
  timeline: { date: string; value: number; recession: boolean }[];
}

/**
 * Live inversion detection for any curve spread — pulls the spread's real daily
 * FRED history server-side and detects every unique inversion period. Falls back
 * to the curated/simulated record without a key.
 */
export function useInversions(spreadId: string): { data: InversionData; source: DataSource } {
  return useEconResource<InversionData>(
    `/api/econ/inversions?spread=${encodeURIComponent(spreadId)}`,
    {
      inversions: getInversionsForSpread(spreadId),
      stats: getInversionStats(spreadId),
      timeline: getSpreadSeriesFor(spreadId),
    },
    (j) => ({
      inversions: j.inversions ?? [],
      stats: j.stats ?? getInversionStats(spreadId),
      timeline: j.timeline ?? [],
    })
  );
}

export interface LiveIndicator {
  id: string;
  value: number;
  prior: number;
  change: number;
  yoy: number | null;
  asOf: string;
  history: number[];
  source: "FRED" | "SIM";
}

/** All indicators with live current value + 24m history, keyed by series id. */
export function useLiveIndicators(): { data: Record<string, LiveIndicator>; source: DataSource } {
  const { data, source } = useEconResource<Record<string, LiveIndicator>>(
    `/api/econ/indicators`,
    {},
    (j) => Object.fromEntries((j.indicators ?? []).map((i: LiveIndicator) => [i.id, i]))
  );
  return { data, source };
}

export interface SeriesObs {
  observations: { date: number; value: number }[] | { date: string; value: number }[];
  source: "FRED" | "SIM";
}

/**
 * Batch-fetch many series (one request). Returns a map keyed by id of the raw
 * observations + per-series source. Pass `units: "lin"` to get raw index levels
 * so the page can derive MoM/YoY/acceleration itself. Empty map until loaded;
 * callers keep their simulation values unless a series reports source "FRED".
 */
export function useLiveSeriesSet(
  ids: string[],
  units?: string,
  n = 15
): { data: Record<string, { observations: { date: string; value: number }[]; source: "FRED" | "SIM" }>; source: DataSource } {
  const key = ids.join(",");
  const url = `/api/econ/batch?ids=${encodeURIComponent(key)}${units ? `&units=${units}` : ""}&n=${n}`;
  return useEconResource(
    url,
    {} as Record<string, { observations: { date: string; value: number }[]; source: "FRED" | "SIM" }>,
    (j) => Object.fromEntries((j.series ?? []).map((s: { id: string; observations: { date: string; value: number }[]; source: "FRED" | "SIM" }) => [s.id, { observations: s.observations, source: s.source }]))
  );
}
