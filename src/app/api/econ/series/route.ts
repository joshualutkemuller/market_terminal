import { json } from "@/lib/server/http";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { getSeriesHistory, seriesById, resolveFred } from "@/data/econSeries";


/**
 * GET /api/econ/series?id=CPIAUCSL&n=24&units=pc1
 * Observations for a FRED series with correct unit handling. If `units` is
 * omitted the series' resolved display transform is used (e.g. CPI -> % YoY).
 * Always 200 with a `source` field (FRED | SIM) so clients render uniformly.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "DGS10";
  const n = Number(new URL(req.url).searchParams.get("n") ?? 24);
  const reqUnits = new URL(req.url).searchParams.get("units") ?? undefined;
  const meta = seriesById(id);
  const resolved = resolveFred(id);
  const units = reqUnits ?? resolved.units;

  if (fredEnabled() && !resolved.simOnly) {
    try {
      const obs = await fredSeries(id, { limit: n, units, scale: resolved.scale });
      if (obs.length) {
        return json({ source: "FRED", id, label: meta?.label ?? id, units, observations: obs });
      }
    } catch {
      // fall through to simulation
    }
  }

  return json({ source: "SIM", id, label: meta?.label ?? id, units, observations: getSeriesHistory(id, n) });
}
