import { json } from "@/lib/server/http";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { getSeriesHistory, resolveFred } from "@/data/econSeries";
import { getSnapshotObservations } from "@/data/econSnapshot";
import { BENCHMARK_SERIES } from "@/data/benchmarkRates";
import { worstSource } from "@/lib/provenance";

export interface BenchmarkBatchSeries {
  id: string;
  observations: { date: string; value: number }[];
  source: "FRED" | "SNAPSHOT" | "SIM";
}

/**
 * GET /api/econ/benchmark?ids=SOFR,DGS10&n=520
 * Batch fetch benchmark rate series. Each series tries FRED first, then
 * snapshot, then SIM. Per-series source is returned so the client can
 * badge provenance accurately.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 60);
  const n = Number(url.searchParams.get("n") ?? 520);
  const live = fredEnabled();

  const series = await Promise.all(
    ids.map(async (id): Promise<BenchmarkBatchSeries> => {
      const bmDef = BENCHMARK_SERIES.find((s) => s.id === id);
      const r = resolveFred(id);

      if (live && bmDef?.hasFred && !r.simOnly) {
        try {
          const obs = await fredSeries(id, { limit: n, units: "lin", scale: r.scale });
          if (obs.length) return { id, observations: obs as { date: string; value: number }[], source: "FRED" };
        } catch {
          /* fall through */
        }
      }

      const snap = getSnapshotObservations(id, n);
      if (snap) return { id, observations: snap as { date: string; value: number }[], source: "SNAPSHOT" };

      return { id, observations: getSeriesHistory(id, n), source: "SIM" };
    })
  );

  const source = worstSource(series.map((s) => s.source));
  return json({ source, series });
}
