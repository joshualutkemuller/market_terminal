import { json } from "@/lib/server/http";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { resolveFred } from "@/data/econSeries";
import { STAT_SERIES, simStatFull, monthlyDate } from "@/data/statsConfig";
import { getSnapshotObservations, getSnapshotRawObservations } from "@/data/econSnapshot";
import type { Obs } from "@/lib/stats";


/** Resample observations to one (last) value per month, within [start, end]. */
function toMonthly(obs: { date: string; value: number | null }[], start: string, end: string): Obs[] {
  const m = new Map<string, number>();
  for (const o of obs) {
    if (o.value == null || !isFinite(o.value)) continue;
    if (o.date < start || o.date > end) continue;
    m.set(o.date.slice(0, 7), o.value);
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, value]) => ({ date: `${ym}-01`, value }));
}

/**
 * GET /api/econ/stats?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Returns raw monthly points per series for the window (units=lin, scale applied).
 * The client caches these and only requests *incremental* (older) windows it does
 * not already hold — so changing the lookback never re-pulls the whole history.
 * All statistics are computed client-side from the cached series.
 */
export async function GET(req: Request) {
  const start = new URL(req.url).searchParams.get("start") ?? monthlyDate(240); // default 20y
  const end = new URL(req.url).searchParams.get("end") ?? monthlyDate(0);
  const live = fredEnabled();
  const sim = simStatFull(320);
  let anyFred = false;
  let anySnapshot = false;

  const series = await Promise.all(
    STAT_SERIES.map(async ([id, label], idx) => {
      const r = resolveFred(id);
      if (live && !r.simOnly) {
        try {
          const obs = await fredSeries(id, { start, end, units: "lin", scale: r.scale });
          const pts = toMonthly(obs, start, end);
          if (pts.length > 6) {
            anyFred = true;
            return { id, label, points: pts };
          }
        } catch {
          /* fall through */
        }
      }
      const snap = getSnapshotRawObservations(id) ?? getSnapshotObservations(id);
      if (snap) {
        const pts = toMonthly(snap, start, end);
        if (pts.length > 6) {
          anySnapshot = true;
          return { id, label, points: pts };
        }
      }
      return { id, label, points: sim[idx].points.filter((p) => p.date >= start && p.date <= end) };
    })
  );

  return json({ source: anyFred ? "FRED" : anySnapshot ? "SNAPSHOT" : "SIM", start, end, series });
}
