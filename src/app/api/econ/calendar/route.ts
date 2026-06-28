import { json } from "@/lib/server/http";
import { fredEnabled, fredSeries, fredReleaseDates, type FredObservation } from "@/lib/server/fred";
import { getEconEvents, EVENT_SERIES, type EconEvent } from "@/data/econRates";

/**
 * GET /api/econ/calendar
 *
 * When FRED is available, pulls real historical observations for each calendar
 * series (CPI, NFP, GDP, etc.) and builds the 12-month event calendar from
 * actual prints. Consensus is approximated from the prior value (real consensus
 * requires a paid data source like Bloomberg). Upcoming FRED release dates are
 * merged for the forward schedule.
 *
 * Without FRED, falls back to the deterministic SIM calendar.
 */
export async function GET() {
  if (!fredEnabled()) {
    return json({ source: "SIM", events: getEconEvents() });
  }

  try {
    const now = new Date();
    const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startDate = new Date(todayMs - 400 * 86400000).toISOString().slice(0, 10);
    const events: EconEvent[] = [];
    let idCounter = 0;

    const seriesWithFred = EVENT_SERIES.filter((d) => d.fredId);
    const fredResults = await Promise.allSettled(
      seriesWithFred.map((def) =>
        fredSeries(def.fredId!, {
          start: startDate,
          limit: def.freq === "weekly" ? 60 : def.freq === "quarterly" ? 8 : 15,
          units: def.fredUnits,
          scale: def.fredScale,
          revalidateSec: 3600,
        })
      )
    );

    for (let si = 0; si < seriesWithFred.length; si++) {
      const def = seriesWithFred[si];
      const result = fredResults[si];
      if (result.status === "rejected") {
        console.warn(`[calendar] FRED fetch failed for ${def.fredId}: ${result.reason}`);
        continue;
      }
      const obs = result.value.filter((o): o is FredObservation & { value: number } => o.value != null);
      if (!obs.length) continue;

      for (let i = 0; i < obs.length; i++) {
        const o = obs[i];
        const obsDate = new Date(o.date + "T00:00:00Z");
        const daysOut = Math.round((obsDate.getTime() - todayMs) / 86400000);
        if (daysOut < -365 || daysOut > 30) continue;

        const prior = i > 0 ? obs[i - 1].value : o.value;
        const actual = o.value;
        const released = daysOut < 0;
        const month = obsDate.getUTCMonth();
        const year = obsDate.getUTCFullYear();

        let period: string;
        if (def.freq === "quarterly") {
          const q = Math.floor(month / 3) + 1;
          period = `Q${q} ${year}`;
        } else if (def.freq === "weekly") {
          period = `Wk ${obsDate.toISOString().slice(5, 10)}`;
        } else {
          const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
          period = MONTHS[month];
        }

        events.push({
          id: `FR-${def.fredId}-${idCounter++}`,
          date: o.date,
          time: def.time,
          daysOut,
          name: def.name,
          category: def.category,
          importance: def.importance,
          period,
          prior: def.fmt(prior),
          consensus: def.fmt(prior),
          actual: released ? def.fmt(actual) : null,
        });
      }
    }

    let fredReleases: EconEvent[] = [];
    try {
      const releases = await fredReleaseDates(40);
      const existingNames = new Set(events.map((e) => e.name.toLowerCase()));
      fredReleases = releases
        .filter((r) => !existingNames.has(r.release_name.toLowerCase()))
        .slice(0, 30)
        .map((r, i) => {
          const daysOut = Math.round((new Date(r.date).getTime() - todayMs) / 86400000);
          return {
            id: `FRD-${r.release_id}-${i}`,
            date: r.date,
            time: "—",
            daysOut,
            name: r.release_name,
            category: "Release",
            importance: "MEDIUM" as const,
            period: "",
            prior: "",
            consensus: "",
            actual: daysOut < 0 ? "released" : null,
          };
        });
    } catch {
      // release dates are supplementary; don't fail the whole response
    }

    const merged = [...events, ...fredReleases].sort((a, b) => a.daysOut - b.daysOut);
    console.log(`[calendar] FRED: ${events.length} real observations + ${fredReleases.length} upcoming releases`);
    return json({ source: "FRED", events: merged });
  } catch (err) {
    console.warn(`[calendar] FRED failed, falling back to SIM:`, err instanceof Error ? err.message : err);
    return json({ source: "SIM", events: getEconEvents() });
  }
}
