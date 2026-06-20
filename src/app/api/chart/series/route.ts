import { NextRequest, NextResponse } from "next/server";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { getSeriesHistory, seriesById, resolveFred } from "@/data/econSeries";
import { getMarketLensSeries } from "@/data/marketLens";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/chart/series?source=econ&id=DGS10
 * GET /api/chart/series?source=market&id=SPY&assetClass=EQUITY
 *
 * Unified series resolver for the charting studios. Reuses existing feeds:
 *   • econ/fred  -> /api/econ/series semantics (FRED live, else econ model)
 *   • market/lens -> the Market Lens series engine (committed snapshots + FRED)
 * Always 200 with a `source` provenance field so the UI renders uniformly.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const source = (sp.get("source") ?? "econ").toLowerCase();
  const id = sp.get("id") ?? "";
  const assetClass = sp.get("assetClass") ?? undefined;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Market / lens / book — daily price or macro level series from the engine.
  if (source === "market" || source === "lens" || source === "book") {
    try {
      const s = await getMarketLensSeries(id, assetClass);
      const badge =
        s.source === "fred" ? "FRED"
        : s.source === "econ-sim" ? "ECON"
        : s.source === "synthetic" ? "SIM"
        : "SNAPSHOT"; // index-monthly | bilello-yearly
      return NextResponse.json({
        source: badge,
        id,
        label: id,
        observations: s.dates.map((d, i) => ({ date: d, value: s.values[i] })),
      });
    } catch {
      return NextResponse.json({ source: "ERR", id, label: id, observations: [] });
    }
  }

  // Econ / FRED — mirror /api/econ/series unit semantics.
  const meta = seriesById(id);
  const resolved = resolveFred(id);
  const freq = meta?.freq ?? "D";
  const n = freq === "D" ? 1800 : freq === "W" ? 520 : freq === "M" ? 360 : 120;

  if (fredEnabled() && !resolved.simOnly) {
    try {
      const obs = await fredSeries(id, { limit: n, units: resolved.units, scale: resolved.scale });
      if (obs.length) {
        return NextResponse.json({ source: "FRED", id, label: meta?.label ?? id, observations: obs });
      }
    } catch {
      // fall through to the deterministic econ model
    }
  }

  return NextResponse.json({ source: "SIM", id, label: meta?.label ?? id, observations: getSeriesHistory(id, n) });
}
