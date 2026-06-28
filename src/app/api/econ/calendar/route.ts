import { json } from "@/lib/server/http";
import { fredEnabled, fredSeries, fredReleaseDates, type FredObservation } from "@/lib/server/fred";
import { getEconEvents, EVENT_SERIES, type EconEvent } from "@/data/econRates";

const BATCH_SIZE = 25;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function batchFred(
  defs: typeof EVENT_SERIES,
  startDate: string,
): Promise<(PromiseSettledResult<FredObservation[]>)[]> {
  const results: (PromiseSettledResult<FredObservation[]>)[] = [];
  for (let i = 0; i < defs.length; i += BATCH_SIZE) {
    const batch = defs.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((def) =>
        fredSeries(def.fredId!, {
          start: startDate,
          limit: def.freq === "weekly" ? 60 : def.freq === "quarterly" ? 8 : 15,
          units: def.fredUnits,
          scale: def.fredScale,
          revalidateSec: 3600,
        })
      )
    );
    results.push(...batchResults);
  }
  return results;
}

/**
 * GET /api/econ/calendar
 *
 * When FRED is configured: pulls real historical observations and merges them
 * with SIM-generated upcoming events (central bank meetings, future releases
 * that FRED can't provide). This ensures the calendar always has both real
 * history AND a forward-looking schedule.
 *
 * Falls back entirely to SIM when FRED is unavailable or produces too few results.
 */
export async function GET() {
  if (!fredEnabled()) {
    return json({ source: "SIM", events: getEconEvents() });
  }

  try {
    const now = new Date();
    const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const startDate = new Date(todayMs - 400 * 86400000).toISOString().slice(0, 10);
    const fredEvents: EconEvent[] = [];
    let idCounter = 0;
    let fulfilled = 0;
    let rejected = 0;

    const seriesWithFred = EVENT_SERIES.filter((d) => d.fredId);
    const fredResults = await batchFred(seriesWithFred, startDate);

    for (let si = 0; si < seriesWithFred.length; si++) {
      const def = seriesWithFred[si];
      const result = fredResults[si];
      if (result.status === "rejected") {
        rejected++;
        continue;
      }
      fulfilled++;
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
          period = MONTHS[month];
        }

        fredEvents.push({
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

    if (rejected > 0) {
      console.warn(`[calendar] FRED: ${rejected}/${seriesWithFred.length} series failed`);
    }

    // If FRED returned too few results, fall back entirely to SIM
    if (fredEvents.length < 10) {
      console.warn(`[calendar] FRED returned only ${fredEvents.length} observations (${fulfilled} ok, ${rejected} failed) — falling back to SIM`);
      return json({ source: "SIM", events: getEconEvents() });
    }

    // Merge in FRED release dates for upcoming releases not covered by observations
    let fredReleases: EconEvent[] = [];
    try {
      const releases = await fredReleaseDates(40);
      const existingNames = new Set(fredEvents.map((e) => e.name.toLowerCase()));
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
      // release dates are supplementary
    }

    // Merge SIM upcoming events (central bank meetings, future scheduled releases)
    // that FRED can't provide — FRED only has historical observations
    const simEvents = getEconEvents();
    const fredDateNames = new Set(fredEvents.map((e) => `${e.date}|${e.name.toLowerCase()}`));
    const simUpcoming = simEvents.filter((e) => {
      if (e.daysOut < 0) return false;
      return !fredDateNames.has(`${e.date}|${e.name.toLowerCase()}`);
    });

    const merged = [...fredEvents, ...fredReleases, ...simUpcoming].sort((a, b) => a.daysOut - b.daysOut);
    console.log(`[calendar] FRED: ${fredEvents.length} real observations (${fulfilled}/${seriesWithFred.length} series ok) + ${fredReleases.length} release dates + ${simUpcoming.length} SIM upcoming`);
    return json({ source: "FRED", events: merged });
  } catch (err) {
    console.warn(`[calendar] FRED failed, falling back to SIM:`, err instanceof Error ? err.message : err);
    return json({ source: "SIM", events: getEconEvents() });
  }
}
