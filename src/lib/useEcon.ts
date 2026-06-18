"use client";

import { useEffect, useState } from "react";
import { getSeriesHistory, type Observation } from "@/data/econSeries";
import { getCurrentCurve, type CurveSnapshot } from "@/data/econCurve";
import { getEconEvents, type EconEvent } from "@/data/econRates";

export type DataSource = "FRED" | "SIM" | "LOADING";

/**
 * Resilient econ data hooks. Each returns the deterministic simulation value
 * immediately (SSR-safe, no empty states), then transparently swaps in live
 * FRED data if the API route reports `source: "FRED"`. `source` drives a
 * LIVE/SIM badge in the UI.
 */
function useEconResource<T>(url: string, fallback: T, pick: (json: any) => T): { data: T; source: DataSource } {
  const [data, setData] = useState<T>(fallback);
  const [source, setSource] = useState<DataSource>("SIM");

  useEffect(() => {
    let alive = true;
    setSource("LOADING");
    fetch(url)
      .then((r) => r.json())
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
  }, [url]);

  return { data, source };
}

export function useEconSeries(id: string, n = 120): { data: Observation[]; source: DataSource } {
  return useEconResource<Observation[]>(`/api/econ/series?id=${id}&n=${n}`, getSeriesHistory(id, n), (j) => j.observations ?? []);
}

export function useLiveCurve(): { data: CurveSnapshot; source: DataSource } {
  return useEconResource<CurveSnapshot>(`/api/econ/curve`, getCurrentCurve(), (j) => j.curve);
}

export function useEconCalendar(): { data: EconEvent[]; source: DataSource } {
  return useEconResource<EconEvent[]>(`/api/econ/calendar`, getEconEvents(), (j) => j.events ?? []);
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
