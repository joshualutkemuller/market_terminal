import { json } from "@/lib/server/http";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { getSeriesHistory, seriesById, resolveFred } from "@/data/econSeries";
import { getMarketLensSeries } from "@/data/marketLens";
import { getSnapshotObservations, getSnapshotRawObservations } from "@/data/econSnapshot";


/**
 * GET /api/chart/series?source=econ&id=DGS10
 * GET /api/chart/series?source=market&id=SPY&assetClass=EQUITY
 *
 * Unified series resolver for the charting studios. Reuses existing feeds:
 *   • econ/fred  -> /api/econ/series semantics (FRED live, else econ model)
 *   • market/lens -> the Market Lens series engine (committed snapshots + FRED)
 * Always 200 with a `source` provenance field so the UI renders uniformly.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const source = (sp.get("source") ?? "econ").toLowerCase();
  const id = sp.get("id") ?? "";
  const assetClass = sp.get("assetClass") ?? undefined;
  const reqUnits = sp.get("units") ?? undefined;
  if (!id) return json({ error: "id required" }, { status: 400 });

  // Market / lens / book — daily price or macro level series from the engine.
  if (source === "market" || source === "lens" || source === "book") {
    try {
      const s = await getMarketLensSeries(id, assetClass);
      const badge =
        s.source === "fred" ? "FRED"
        : s.source === "econ-sim" ? "ECON"
        : s.source === "synthetic" ? "SIM"
        : "SNAPSHOT"; // index-monthly | bilello-yearly
      return json({
        source: badge,
        id,
        label: id,
        observations: s.dates.map((d, i) => ({ date: d, value: s.values[i] })),
      });
    } catch {
      return json({ source: "ERR", id, label: id, observations: [] });
    }
  }

  // Econ / FRED — mirror /api/econ/series unit semantics.
  const meta = seriesById(id);
  const resolved = resolveFred(id);
  const units = reqUnits ?? resolved.units;
  const freq = meta?.freq ?? "D";
  const n = freq === "D" ? 1800 : freq === "W" ? 520 : freq === "M" ? 360 : 120;

  if (fredEnabled() && !resolved.simOnly) {
    try {
      const obs = await fredSeries(id, { limit: n, units, scale: resolved.scale });
      if (obs.length) {
        return json({ source: "FRED", id, label: meta?.label ?? id, observations: obs });
      }
    } catch {
      // fall through to the deterministic econ model
    }
  }

  const snap = units === "lin"
    ? getSnapshotRawObservations(id, n) ?? getSnapshotObservations(id, n)
    : getSnapshotObservations(id, n);
  if (snap) return json({ source: "SNAPSHOT", id, label: meta?.label ?? id, observations: snap });
  return json({ source: "SIM", id, label: meta?.label ?? id, observations: getSeriesHistory(id, n) });
}
