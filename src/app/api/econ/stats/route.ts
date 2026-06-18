import { NextRequest, NextResponse } from "next/server";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { resolveFred } from "@/data/econSeries";
import { STAT_SERIES, simStatFull, monthlyDate } from "@/data/statsConfig";
import type { Obs } from "@/lib/stats";

export const dynamic = "force-dynamic";

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
export async function GET(req: NextRequest) {
  const start = req.nextUrl.searchParams.get("start") ?? monthlyDate(240); // default 20y
  const end = req.nextUrl.searchParams.get("end") ?? monthlyDate(0);
  const live = fredEnabled();
  const sim = simStatFull(320);
  let anyFred = false;

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
      return { id, label, points: sim[idx].points.filter((p) => p.date >= start && p.date <= end) };
    })
  );

  return NextResponse.json({ source: anyFred ? "FRED" : "SIM", start, end, series });
}
