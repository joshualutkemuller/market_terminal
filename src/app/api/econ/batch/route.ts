import { json } from "@/lib/server/http";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { getSeriesHistory, getSeriesHistoryRaw, resolveFred } from "@/data/econSeries";
import { getSnapshotObservations, getSnapshotRawObservations } from "@/data/econSnapshot";


export interface BatchSeries {
  id: string;
  observations: { date: string; value: number }[];
  source: "FRED" | "SNAPSHOT" | "SIM";
}

/**
 * GET /api/econ/batch?ids=A,B,C&units=lin&n=15
 * Fetches many series in one request (one FRED call each, served concurrently).
 * `units` overrides the per-series default transform for the whole batch (e.g.
 * pass `lin` to get raw index levels so the client can derive MoM/YoY itself).
 * Per-series `source` is returned so the client only swaps in genuine FRED data.
 */
export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 60);
  const n = Number(new URL(req.url).searchParams.get("n") ?? 15);
  const unitsOverride = new URL(req.url).searchParams.get("units") ?? undefined;
  const live = fredEnabled();

  const series = await Promise.all(
    ids.map(async (id): Promise<BatchSeries> => {
      const r = resolveFred(id);
      const units = unitsOverride ?? r.units;
      if (live && !r.simOnly) {
        try {
          const obs = await fredSeries(id, { limit: n, units, scale: r.scale });
          if (obs.length) return { id, observations: obs as { date: string; value: number }[], source: "FRED" };
        } catch {
          /* fall through */
        }
      }
      const snap = units === "lin" ? getSnapshotRawObservations(id, n) ?? getSnapshotObservations(id, n) : getSnapshotObservations(id, n);
      if (snap) return { id, observations: snap as { date: string; value: number }[], source: "SNAPSHOT" };
      const wantsRaw = units === "lin" && r.units !== "lin";
      const simObs = wantsRaw ? getSeriesHistoryRaw(id, n) ?? getSeriesHistory(id, n) : getSeriesHistory(id, n);
      return { id, observations: simObs, source: "SIM" };
    })
  );

  const source = series.some((s) => s.source === "FRED")
    ? "FRED"
    : series.some((s) => s.source === "SNAPSHOT")
    ? "SNAPSHOT"
    : "SIM";
  return json({ source, series });
}
