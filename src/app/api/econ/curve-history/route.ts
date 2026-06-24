import { json } from "@/lib/server/http";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { CURVE_TENORS, buildLiveSnapshots, getCurveSnapshots, type CurveHistory } from "@/data/econCurve";
import { getSnapshotObservations, getSnapshotRawObservations } from "@/data/econSnapshot";

function snapshotHistory(): CurveHistory | null {
  const history: CurveHistory = {};
  for (const [, , fredId] of CURVE_TENORS) {
    const obs = getSnapshotRawObservations(fredId) ?? getSnapshotObservations(fredId);
    if (obs?.length) history[fredId] = obs.map((o) => ({ date: o.date, value: o.value }));
  }
  return Object.keys(history).length ? history : null;
}


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
 * Always 200 with a `source` field (FRED | SNAPSHOT | SIM); falls back to the
 * committed econ snapshot before the simulated presets without a key or on error.
 */
export async function GET(req: Request) {
  const sim = getCurveSnapshots();
  const snapHistory = snapshotHistory();
  const snap = snapHistory ? buildLiveSnapshots(snapHistory) : null;
  if (!fredEnabled()) {
    return snap ? json({ source: "SNAPSHOT", snapshots: snap }) : json({ source: "SIM", snapshots: sim });
  }

  const reqYears = Number(new URL(req.url).searchParams.get("years") ?? 7);
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
    return json({ source: "FRED", asOf, years, snapshots });
  } catch (err) {
    return snap
      ? json({ source: "SNAPSHOT", note: err instanceof Error ? err.message : "FRED error", snapshots: snap })
      : json({ source: "SIM", note: err instanceof Error ? err.message : "FRED error", snapshots: sim });
  }
}
