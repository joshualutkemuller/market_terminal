import { NextResponse } from "next/server";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { resolveFred } from "@/data/econSeries";
import { STAT_SERIES, simStatSeries } from "@/data/statsConfig";
import { buildStatsPayload, type Obs } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * GET /api/econ/stats
 * Loads the macro series (live FRED or simulation), aligns to a monthly grid and
 * returns the full statistics payload: correlation matrix, pairwise Granger
 * causality, ADF stationarity, descriptive moments — plus the aligned matrix so
 * the client can compute regressions/distributions interactively.
 */
export async function GET() {
  const live = fredEnabled();
  const sim = simStatSeries(84);
  let anyFred = false;

  const series = await Promise.all(
    STAT_SERIES.map(async ([id, label], idx) => {
      const r = resolveFred(id);
      if (live && !r.simOnly) {
        try {
          const obs = await fredSeries(id, { start: "2017-06-01", units: r.units, scale: r.scale });
          const clean = obs.filter((o) => o.value != null) as Obs[];
          if (clean.length > 24) {
            anyFred = true;
            return { label, obs: clean };
          }
        } catch {
          /* fall through */
        }
      }
      return sim[idx];
    })
  );

  return NextResponse.json(buildStatsPayload(series, anyFred ? "FRED" : "SIM"));
}
