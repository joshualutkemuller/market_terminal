import { NextResponse } from "next/server";
import { fetchLiveSocial } from "@/lib/server/socialProviders";
import { getSocialIntel } from "@/data/news";

export const dynamic = "force-dynamic";

/**
 * GET /api/social
 * Returns aggregated social sentiment (Reddit + StockTwits) when configured,
 * falling back to the SIM engine. Always 200 with a `source` provenance field.
 */
export async function GET() {
  const live = await fetchLiveSocial().catch(() => null);
  if (live) return NextResponse.json({ source: live.source, ...live.intel });
  return NextResponse.json({ source: "SIM", ...getSocialIntel() });
}
