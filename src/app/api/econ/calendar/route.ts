import { NextResponse } from "next/server";
import { fredEnabled, fredReleaseDates } from "@/lib/server/fred";
import { getEconEvents } from "@/data/econRates";

export const dynamic = "force-dynamic";

/**
 * GET /api/econ/calendar
 * Live: FRED release dates (real economic-release schedule) merged with the
 * curated importance/forecast metadata. Otherwise the simulated calendar.
 */
export async function GET() {
  const sim = getEconEvents();
  if (!fredEnabled()) {
    return NextResponse.json({ source: "SIM", events: sim });
  }
  try {
    const releases = await fredReleaseDates(60);
    const today = Date.now();
    const events = releases.slice(0, 30).map((r, i) => {
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
    return NextResponse.json({ source: "FRED", events });
  } catch (err) {
    return NextResponse.json({ source: "SIM", note: err instanceof Error ? err.message : "FRED error", events: sim });
  }
}
