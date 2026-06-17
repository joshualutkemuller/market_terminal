import { NextResponse } from "next/server";
import { fredEnabled, fredLatest } from "@/lib/server/fred";
import { getCurrentCurve } from "@/data/econCurve";

export const dynamic = "force-dynamic";

/**
 * GET /api/econ/curve
 * Live: pulls the latest yield for each tenor's FRED series (DGS1MO … DGS30).
 * Otherwise returns the simulated current curve. Historical snapshots remain
 * simulation-sourced (multi-decade daily history would be many FRED calls).
 */
export async function GET() {
  const sim = getCurrentCurve();
  if (!fredEnabled()) {
    return NextResponse.json({ source: "SIM", curve: sim });
  }
  try {
    const points = await Promise.all(
      sim.points.map(async (p) => {
        const latest = await fredLatest(p.fredId);
        return { ...p, yield: latest?.value ?? p.yield };
      })
    );
    return NextResponse.json({ source: "FRED", curve: { ...sim, label: "Today (live)", points } });
  } catch (err) {
    return NextResponse.json({ source: "SIM", note: err instanceof Error ? err.message : "FRED error", curve: sim });
  }
}
