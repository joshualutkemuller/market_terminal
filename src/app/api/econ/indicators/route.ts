import { json } from "@/lib/server/http";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { FRED_CATALOG, getSeriesHistory, resolveFred, type FredSeries } from "@/data/econSeries";
import { getSnapshotObservations } from "@/data/econSnapshot";

type EconSource = "FRED" | "SNAPSHOT" | "SIM";

export interface LiveIndicator {
  id: string;
  value: number;
  prior: number;
  change: number;
  mom: number | null;
  qoq: number | null;
  yoy: number | null;
  monthlyPrint: number | null;
  asOf: string;
  history: number[];
  source: EconSource;
}

const pct = (now: number | undefined, then: number | undefined, decimals = 1): number | null => {
  if (now == null || then == null || then === 0) return null;
  return Number((((now - then) / Math.abs(then)) * 100).toFixed(decimals));
};

function buildPoint(
  s: FredSeries,
  hist: { date: string; value: number }[],
  source: EconSource,
  rawHist?: { date: string; value: number }[]
): LiveIndicator {
  const values = hist.map((h) => h.value);
  const rawValues = rawHist?.map((h) => h.value) ?? values;
  const value = values[values.length - 1] ?? s.level;
  const prior = values[values.length - 2] ?? value;
  const rawValue = rawValues[rawValues.length - 1];
  const mom = s.freq === "M" || s.freq === "Q" ? pct(rawValue, rawValues[rawValues.length - 2], 2) : null;
  const qoq = s.freq === "M" ? pct(rawValue, rawValues[rawValues.length - 4], 2) : s.freq === "Q" ? pct(rawValue, rawValues[rawValues.length - 2], 2) : null;
  // For YoY-transformed indicators the displayed value is the YoY reading; for
  // level indicators we derive YoY from raw levels when enough history exists.
  const yoy = s.unit.includes("y/y")
    ? Number(value.toFixed(s.decimals))
    : s.freq === "M" && rawValues.length >= 13
    ? pct(rawValue, rawValues[rawValues.length - 13], 1)
    : s.freq === "Q" && rawValues.length >= 5
    ? pct(rawValue, rawValues[rawValues.length - 5], 1)
    : null;
  return {
    id: s.id,
    value: Number(value.toFixed(s.decimals)),
    prior: Number(prior.toFixed(s.decimals)),
    change: Number((value - prior).toFixed(s.decimals)),
    mom,
    qoq,
    yoy,
    monthlyPrint: s.category === "INFLATION" && (s.freq === "M" || s.freq === "Q") ? mom : null,
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
          if (hist.length) {
            const needsRaw = s.freq === "M" || s.freq === "Q";
            const rawHist = needsRaw && r.units !== "lin"
              ? await fredSeries(s.id, { limit: 24, units: "lin", scale: r.scale })
              : hist;
            return buildPoint(s, hist as { date: string; value: number }[], "FRED", rawHist as { date: string; value: number }[]);
          }
        } catch {
          /* fall back */
        }
      }
      // Real snapshot before synthetic SIM (matches the live display units).
      const snap = getSnapshotObservations(s.id, 24);
      if (snap) return buildPoint(s, snap as { date: string; value: number }[], "SNAPSHOT");
      return buildPoint(s, getSeriesHistory(s.id, 24), "SIM");
    })
  );
  const source: EconSource = out.some((o) => o.source === "FRED")
    ? "FRED"
    : out.some((o) => o.source === "SNAPSHOT")
    ? "SNAPSHOT"
    : "SIM";
  return json({ source, indicators: out });
}
