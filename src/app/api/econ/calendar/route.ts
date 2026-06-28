import { json } from "@/lib/server/http";
import { fredEnabled, fredReleaseDates } from "@/lib/server/fred";
import { getEconEvents } from "@/data/econRates";

/**
 * GET /api/econ/calendar
 * Returns the full 12-month historical + upcoming calendar. When FRED is
 * available, upcoming FRED release dates are merged in alongside the
 * simulated history so the user always sees the full timeline.
 */
export async function GET() {
  const events = getEconEvents();

  if (!fredEnabled()) {
    return json({ source: "SIM", events });
  }

  try {
    const releases = await fredReleaseDates(60);
    const today = Date.now();
    const fredEvents = releases.slice(0, 40).map((r, i) => {
      const daysOut = Math.round((new Date(r.date).getTime() - today) / 86400000);
      return {
        id: `FR-${r.release_id}-${i}`,
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

    const existingNames = new Set(events.map((e) => e.name.toLowerCase()));
    const merged = [
      ...events,
      ...fredEvents.filter((fe) => !existingNames.has(fe.name.toLowerCase())),
    ].sort((a, b) => a.daysOut - b.daysOut);

    return json({ source: "FRED", events: merged });
  } catch (err) {
    return json({ source: "SIM", note: err instanceof Error ? err.message : "FRED error", events });
  }
}
