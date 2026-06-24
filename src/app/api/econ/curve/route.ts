import { json } from "@/lib/server/http";
import { fredEnabled, fredLatest } from "@/lib/server/fred";
import { getCurrentCurve } from "@/data/econCurve";
import { getSnapshotObservations, getSnapshotRawObservations } from "@/data/econSnapshot";

function snapshotCurve() {
  const sim = getCurrentCurve();
  let matched = false;
  let asOf = sim.date;
  const points = sim.points.map((p) => {
    const obs = getSnapshotRawObservations(p.fredId, 1) ?? getSnapshotObservations(p.fredId, 1);
    const latest = obs?.[obs.length - 1];
    if (!latest) return p;
    matched = true;
    if (latest.date > asOf) asOf = latest.date;
    return { ...p, yield: Number(latest.value.toFixed(2)) };
  });
  return matched ? { ...sim, label: `Snapshot · ${asOf}`, date: asOf, points } : null;
}


/**
 * GET /api/econ/curve
 * Live: pulls the latest yield for each tenor's FRED series (DGS1MO … DGS30).
 * Otherwise returns the simulated current curve. Historical snapshots remain
 * simulation-sourced (multi-decade daily history would be many FRED calls).
 */
export async function GET() {
  const sim = getCurrentCurve();
  const snap = snapshotCurve();
  if (!fredEnabled()) {
    return snap ? json({ source: "SNAPSHOT", asOf: snap.date, curve: snap }) : json({ source: "SIM", curve: sim });
  }
  try {
    const resolved = await Promise.all(
      sim.points.map(async (p) => {
        const latest = await fredLatest(p.fredId);
        return { point: { ...p, yield: latest?.value ?? p.yield }, date: latest?.date ?? null };
      })
    );
    const points = resolved.map((r) => r.point);
    // The curve's "as of" is the most recent observation date across all tenors
    // (Treasury yields publish on the same business day, so they align).
    const dates = resolved.map((r) => r.date).filter((d): d is string => !!d).sort();
    const asOf = dates.length ? dates[dates.length - 1] : sim.date;
    return json({
      source: "FRED",
      asOf,
      curve: { ...sim, label: `Live · ${asOf}`, date: asOf, points },
    });
  } catch (err) {
    return snap
      ? json({ source: "SNAPSHOT", note: err instanceof Error ? err.message : "FRED error", asOf: snap.date, curve: snap })
      : json({ source: "SIM", note: err instanceof Error ? err.message : "FRED error", curve: sim });
  }
}
