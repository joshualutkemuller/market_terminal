import { NextRequest, NextResponse } from "next/server";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { CURVE_TENORS, buildLiveSnapshots, getCurveSnapshots, type CurveHistory } from "@/data/econCurve";

export const dynamic = "force-dynamic";

/**
 * GET /api/econ/curve-history?years=7
 *
 * Real point-in-time Treasury curves. Pulls each tenor's full daily history
 * (DGS1MO…DGS30) from FRED in one call per tenor, then assembles the curve as-of
 * each anchor date (Today, 1M/3M/6M/1Y/2Y ago, + deep reference curves where the
 * window reaches). FRED returns decades of history, so this is genuine
 * point-in-time data — not the curated presets. Cached server-side (the FRED
 * client memoizes + Next revalidates), so the heavy fetch is paid once.
 *
 * Always 200 with a `source` field (FRED | SIM); falls back to the simulated
 * presets without a key or on error.
 */
export async function GET(req: NextRequest) {
  const sim = getCurveSnapshots();
  if (!fredEnabled()) {
    return NextResponse.json({ source: "SIM", snapshots: sim });
  }

  const reqYears = Number(req.nextUrl.searchParams.get("years") ?? 7);
  const years = Math.max(2, Math.min(25, Number.isFinite(reqYears) ? reqYears : 7));
  const start = `${new Date().getUTCFullYear() - years}-01-01`;

  try {
    const history: CurveHistory = {};
    await Promise.all(
      CURVE_TENORS.map(async ([, , fredId]) => {
        // 6h cache: deep daily history only changes at its recent tail once a day.
        const obs = await fredSeries(fredId, { start, revalidateSec: 6 * 60 * 60 });
        history[fredId] = obs
          .filter((o) => o.value !== null)
          .map((o) => ({ date: o.date, value: o.value as number }));
      })
    );
    const snapshots = buildLiveSnapshots(history);
    const asOf = snapshots.find((s) => s.id === "now")?.date ?? null;
    return NextResponse.json({ source: "FRED", asOf, years, snapshots });
  } catch (err) {
    return NextResponse.json({
      source: "SIM",
      note: err instanceof Error ? err.message : "FRED error",
      snapshots: sim,
    });
  }
}
