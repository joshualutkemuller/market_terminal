import { NextResponse } from "next/server";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { FRED_CATALOG, getSeriesHistory, resolveFred, type FredSeries } from "@/data/econSeries";

export const dynamic = "force-dynamic";

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

function buildPoint(s: FredSeries, hist: { date: string; value: number }[], source: "FRED" | "SIM"): LiveIndicator {
  const values = hist.map((h) => h.value);
  const value = values[values.length - 1] ?? s.level;
  const prior = values[values.length - 2] ?? value;
  // monthly series with >=13 points -> derive YoY from the level history
  const yoy = s.freq === "M" && values.length >= 13 && !s.unit.includes("y/y")
    ? Number((((value - values[values.length - 13]) / (Math.abs(values[values.length - 13]) || 1)) * 100).toFixed(1))
    : s.unit.includes("y/y")
    ? value
    : null;
  return {
    id: s.id,
    value: Number(value.toFixed(s.decimals)),
    prior: Number(prior.toFixed(s.decimals)),
    change: Number((value - prior).toFixed(s.decimals)),
    yoy,
    asOf: hist[hist.length - 1]?.date ?? "",
    history: values.map((v) => Number(v.toFixed(s.decimals))),
    source,
  };
}

/**
 * GET /api/econ/indicators
 * Live current value + 24-month history for every catalog indicator, with the
 * correct FRED units transform per series. Per-series fallback to simulation.
 */
export async function GET() {
  const live = fredEnabled();
  const out = await Promise.all(
    FRED_CATALOG.map(async (s) => {
      const r = resolveFred(s.id);
      if (live && !r.simOnly) {
        try {
          const hist = await fredSeries(s.id, { limit: 24, units: r.units, scale: r.scale });
          if (hist.length) return buildPoint(s, hist as { date: string; value: number }[], "FRED");
        } catch {
          /* fall back */
        }
      }
      return buildPoint(s, getSeriesHistory(s.id, 24), "SIM");
    })
  );
  const source = out.some((o) => o.source === "FRED") ? "FRED" : "SIM";
  return NextResponse.json({ source, indicators: out });
}
