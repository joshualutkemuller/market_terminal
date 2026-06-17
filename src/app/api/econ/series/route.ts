import { NextRequest, NextResponse } from "next/server";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { getSeriesHistory, seriesById } from "@/data/econSeries";

export const dynamic = "force-dynamic";

/**
 * GET /api/econ/series?id=DGS10&n=120
 * Returns observations for a FRED series. Uses live FRED when FRED_API_KEY is set,
 * otherwise returns the deterministic simulation. Always responds 200 with a
 * `source` field so the client can render uniformly and flag LIVE vs SIM.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id") ?? "DGS10";
  const n = Number(req.nextUrl.searchParams.get("n") ?? 120);
  const meta = seriesById(id);

  if (fredEnabled()) {
    try {
      const obs = (await fredSeries(id, { limit: n })).filter((o) => o.value !== null);
      return NextResponse.json({ source: "FRED", id, label: meta?.label ?? id, observations: obs });
    } catch (err) {
      // fall through to simulation on any FRED error
      return NextResponse.json({
        source: "SIM",
        id,
        label: meta?.label ?? id,
        note: err instanceof Error ? err.message : "FRED error",
        observations: getSeriesHistory(id, n),
      });
    }
  }

  return NextResponse.json({ source: "SIM", id, label: meta?.label ?? id, observations: getSeriesHistory(id, n) });
}
