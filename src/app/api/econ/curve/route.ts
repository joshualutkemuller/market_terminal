import { json } from "@/lib/server/http";
import { fredEnabled, fredLatest } from "@/lib/server/fred";
import { getCurrentCurve } from "@/data/econCurve";


/**
 * GET /api/econ/curve
 * Live: pulls the latest yield for each tenor's FRED series (DGS1MO … DGS30).
 * Otherwise returns the simulated current curve. Historical snapshots remain
 * simulation-sourced (multi-decade daily history would be many FRED calls).
 */
export async function GET() {
  const sim = getCurrentCurve();
  if (!fredEnabled()) {
    return json({ source: "SIM", curve: sim });
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
    return json({ source: "SIM", note: err instanceof Error ? err.message : "FRED error", curve: sim });
  }
}
