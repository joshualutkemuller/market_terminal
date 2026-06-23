/**
 * Build-time exporter: capture real FRED observations for the redistributable
 * catalog series into `src/data/econSnapshot.json`. This gives the econ modules
 * a real (frozen) data fallback labelled SNAPSHOT — the same pattern the market
 * pipeline uses — instead of degrading to synthetic SIM when FRED is
 * unavailable (no key, no network egress, or the API layer isn't deployed).
 *
 * Run with a key (requires network egress to api.stlouisfed.org):
 *   FRED_API_KEY=xxxx npm run export:econ-snapshot
 *
 * Licensing: series marked `simOnly` in econSeries.ts (e.g. ISM PMIs, which were
 * pulled from FRED for licensing) are skipped — they cannot be redistributed and
 * remain simulation-only.
 */
import fs from "node:fs";
import path from "node:path";
import { FRED_CATALOG, resolveFred } from "@/data/econSeries";
import { fredSeries, fredEnabled } from "@/lib/server/fred";
import { ensureProxy } from "@/lib/server/fetchProxy";

const OUT = path.resolve(process.cwd(), "src/data/econSnapshot.json");
// Enough history for YoY (13 months) plus the display windows the pages use.
const LIMIT = 130;

async function main(): Promise<void> {
  if (!fredEnabled()) {
    console.error("FRED_API_KEY not set — cannot export the econ snapshot.");
    process.exit(1);
  }
  await ensureProxy();

  const series: Record<string, { asOf: string; observations: { date: string; value: number }[] }> = {};
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const s of FRED_CATALOG) {
    const r = resolveFred(s.id);
    if (r.simOnly) {
      skipped++;
      continue;
    }
    try {
      const obs = await fredSeries(s.id, { limit: LIMIT, units: r.units, scale: r.scale });
      const clean = obs.filter((o) => o.value != null) as { date: string; value: number }[];
      if (clean.length) {
        series[s.id] = { asOf: clean[clean.length - 1].date, observations: clean };
        written++;
      } else {
        failed++;
      }
    } catch (err) {
      console.warn(`  skip ${s.id}: ${(err as Error).message}`);
      failed++;
    }
  }

  const payload = { generatedAt: new Date().toISOString(), series };
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n");
  console.log(`econ snapshot → ${OUT}: ${written} series written, ${skipped} simOnly skipped, ${failed} failed.`);
}

void main();
