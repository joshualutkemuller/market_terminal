
import { useEffect, useState } from "react";
import { fetchJson, peekFresh } from "@/lib/fetchCache";
import { getSeriesHistory, type Observation } from "@/data/econSeries";
import { getSnapshotObservations, getSnapshotRawObservations } from "@/data/econSnapshot";
import {
  getCurrentCurve,
  getCurveSnapshots,
  getInversionsForSpread,
  getInversionStats,
  getSpreadSeriesFor,
  type CurveSnapshot,
  type Inversion,
} from "@/data/econCurve";
import { type EconEvent } from "@/data/econRates";

export type DataSource = "FRED" | "SNAPSHOT" | "SIM" | "LOADING" | "ETL";
export type RealEconSource = "FRED" | "SNAPSHOT";

/** True when a row came from an external/committed source rather than generated SIM. */
export function isRealEconSource(source: unknown): source is RealEconSource {
  return source === "FRED" || source === "SNAPSHOT";
}

/** Map a route's `source` string to the badge vocabulary. */
function mapSource(s: unknown): DataSource {
  if (typeof s !== "string") return "SIM";
  if (s === "FRED" || s.includes("FRED") || s.includes("Finnhub")) return "FRED";
  if (s === "SNAPSHOT") return "SNAPSHOT";
  if (s === "ETL") return "ETL";
  return "SIM";
}

/**
 * Resilient econ data hooks. Each returns a fallback value immediately (SSR-safe,
 * no empty states), then transparently swaps in whatever the API route reports
 * (`FRED` live, `SNAPSHOT` real-frozen, else `SIM`). `fallbackSource` is what the
 * fallback value itself represents — `SNAPSHOT` when seeded from the committed
 * real snapshot, otherwise `SIM` — so a static-only deploy (no `/api`) still
 * labels real frozen data correctly instead of calling it SIM.
 */
function useEconResource<T>(
  url: string,
  fallback: T,
  pick: (json: any) => T,
  fallbackSource: DataSource = "SIM"
): { data: T; source: DataSource } {
  // Seed from a recently-cached response so re-navigation renders real data
  // instantly instead of flashing the fallback.
  const cached = peekFresh<any>(url);
  const [data, setData] = useState<T>(cached ? pick(cached) : fallback);
  const [source, setSource] = useState<DataSource>(cached ? mapSource(cached.source) : fallbackSource);

  useEffect(() => {
    let alive = true;
    const seed = peekFresh<any>(url);
    if (seed) {
      setData(pick(seed));
      setSource(mapSource(seed.source));
    } else {
      setSource("LOADING");
    }
    fetchJson<any>(url)
      .then((json) => {
        if (!alive) return;
        setData(pick(json));
        setSource(mapSource(json.source));
      })
      .catch(() => {
        if (!alive) return;
        setSource(fallbackSource);
      });
    return () => {
      alive = false;
    };
    // `pick` is a stable per-call-site projection; re-running only on `url` is intended.
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, source };
}

export function useEconSeries(id: string, n = 120): { data: Observation[]; source: DataSource } {
  const snap = getSnapshotObservations(id, n);
  return useEconResource<Observation[]>(
    `/api/econ/series?id=${id}&n=${n}`,
    snap ?? getSeriesHistory(id, n),
    (j) => j.observations ?? [],
    snap ? "SNAPSHOT" : "SIM"
  );
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
  return useEconResource<EconEvent[]>(`/api/econ/calendar`, [], (j) => j.events ?? [], "LOADING");
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
  changePct: number | null;
  mom: number | null;
  momDelta: number | null;
  qoq: number | null;
  qoqDelta: number | null;
  yoy: number | null;
  yoyDelta: number | null;
  monthlyPrint: number | null;
  asOf: string;
  history: number[];
  source: "FRED" | "SNAPSHOT" | "SIM";
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
  source: "FRED" | "SNAPSHOT" | "SIM";
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
): { data: Record<string, { observations: { date: string; value: number }[]; source: "FRED" | "SNAPSHOT" | "SIM" }>; source: DataSource } {
  const key = ids.join(",");
  const url = `/api/econ/batch?ids=${encodeURIComponent(key)}${units ? `&units=${units}` : ""}&n=${n}`;
  // Seed from the committed snapshot so a static-only deploy still shows real
  // frozen series (labelled SNAPSHOT) rather than nothing/SIM.
  const seeded = Object.fromEntries(
    ids
      .map((id) => {
        const obs = units === "lin" ? getSnapshotRawObservations(id, n) ?? getSnapshotObservations(id, n) : getSnapshotObservations(id, n);
        return obs ? ([id, { observations: obs, source: "SNAPSHOT" as const }] as const) : null;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
  );
  return useEconResource(
    url,
    seeded as Record<string, { observations: { date: string; value: number }[]; source: "FRED" | "SNAPSHOT" | "SIM" }>,
    (j) => Object.fromEntries((j.series ?? []).map((s: { id: string; observations: { date: string; value: number }[]; source: "FRED" | "SNAPSHOT" | "SIM" }) => [s.id, { observations: s.observations, source: s.source }])),
    Object.keys(seeded).length ? "SNAPSHOT" : "SIM"
  );
}
