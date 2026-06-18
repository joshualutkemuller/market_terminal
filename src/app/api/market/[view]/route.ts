import { NextRequest, NextResponse } from "next/server";
import { SNAPSHOTS, type MarketView } from "@/data/marketPipeline";

export const dynamic = "force-dynamic";

/** FastAPI path for each terminal view (market_data_pipeline endpoints). */
const ENDPOINT: Record<MarketView, string> = {
  market: "/snapshot/market",
  "cross-asset": "/snapshot/cross-asset",
  rates: "/snapshot/rates",
  inflation: "/snapshot/inflation",
  regime: "/dashboard/regime",
  bilello: "/dashboard/bilello",
};

/**
 * GET /api/market/[view]
 *
 * Serves a market_data_pipeline view. If MARKET_PIPELINE_URL points at a running
 * FastAPI service it proxies live data (source: "LIVE"); otherwise it returns
 * the committed gold snapshot (source: "SNAPSHOT"). Always 200 with a `source`
 * field so the UI renders uniformly and never blocks.
 */
export async function GET(req: NextRequest, { params }: { params: { view: string } }) {
  const view = params.view as MarketView;
  if (!(view in SNAPSHOTS)) {
    return NextResponse.json({ error: `unknown view '${view}'` }, { status: 404 });
  }

  const base = process.env.MARKET_PIPELINE_URL;
  if (base) {
    try {
      const r = await fetch(`${base.replace(/\/$/, "")}${ENDPOINT[view]}`, {
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      if (r.ok) {
        const data = await r.json();
        return NextResponse.json({ source: "LIVE", view, data });
      }
    } catch {
      // fall through to the committed snapshot
    }
  }

  return NextResponse.json({ source: "SNAPSHOT", view, data: SNAPSHOTS[view] });
}
