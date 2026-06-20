"use client";

import { useEffect, useMemo, useState } from "react";
import { type SeriesRef, type RangePreset, type Transform, rangeMonths } from "./spec";

export interface ResolvedSeries {
  ref: SeriesRef;
  label: string;
  source: string; // provenance badge: FRED | SIM | SNAPSHOT | ECON | ERR
  values: (number | null)[]; // aligned to the shared axis
}

export interface ChartData {
  axis: string[]; // ISO dates, ascending
  series: ResolvedSeries[];
  loading: boolean;
}

interface RawSeries {
  ref: SeriesRef;
  label: string;
  source: string;
  obs: { date: string; value: number | null }[];
}

/** ISO cutoff date for a range preset relative to the latest axis date. */
function rangeStart(lastIso: string, range: RangePreset): string | null {
  const months = rangeMonths(range);
  if (months == null) return null;
  const d = new Date(`${lastIso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve a set of series refs from the unified /api/chart/series endpoint,
 * align them to a shared date axis, filter to the range, and apply the
 * normalize transform. Pure client-side; provenance is preserved per series.
 */
export function useChartSeries(refs: SeriesRef[], range: RangePreset, transform: Transform): ChartData {
  const key = JSON.stringify(refs);
  const [raw, setRaw] = useState<RawSeries[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(
      refs.map((r) => {
        const qs = new URLSearchParams({ source: r.source, id: r.id });
        if (r.assetClass) qs.set("assetClass", r.assetClass);
        return fetch(`/api/chart/series?${qs}`)
          .then((x) => x.json())
          .then(
            (j): RawSeries => ({
              ref: r,
              label: j.label ?? r.id,
              source: j.source ?? "SIM",
              obs: Array.isArray(j.observations) ? j.observations : [],
            })
          )
          .catch((): RawSeries => ({ ref: r, label: r.id, source: "ERR", obs: [] }));
      })
    ).then((res) => {
      if (alive) {
        setRaw(res);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { axis, series } = useMemo(() => {
    if (!raw.length) return { axis: [] as string[], series: [] as ResolvedSeries[] };

    const dateSet = new Set<string>();
    for (const r of raw) for (const o of r.obs) dateSet.add(o.date);
    const axisAll = [...dateSet].sort();
    if (!axisAll.length) return { axis: [], series: [] };

    const start = rangeStart(axisAll[axisAll.length - 1], range);
    const axis = start ? axisAll.filter((d) => d >= start) : axisAll;

    const series: ResolvedSeries[] = raw.map((r) => {
      const m = new Map(r.obs.map((o) => [o.date, o.value]));
      let values: (number | null)[] = axis.map((d) => (m.has(d) ? m.get(d)! : null));
      if (transform === "index100") {
        const base = values.find((v) => v != null && v !== 0) as number | undefined;
        if (base) values = values.map((v) => (v == null ? null : (v / base) * 100));
      }
      return { ref: r.ref, label: r.label, source: r.source, values };
    });

    return { axis, series };
  }, [raw, range, transform]);

  return { axis, series, loading };
}
