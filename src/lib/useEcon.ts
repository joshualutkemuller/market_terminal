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
