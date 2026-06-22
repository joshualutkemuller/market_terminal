import { NextRequest, NextResponse } from "next/server";
import { fetchLiveNews } from "@/lib/server/newsProviders";
import { getHeadlines } from "@/data/news";

export const dynamic = "force-dynamic";

/**
 * GET /api/news?n=60
 * Returns live headlines from the first configured provider in the chain
 * (Alpha Vantage → Marketaux → Finnhub → NewsAPI), falling back to the
 * deterministic SIM engine. Always 200 with a `source` provenance field.
 */
export async function GET(req: NextRequest) {
  const n = Math.min(120, Math.max(10, Number(req.nextUrl.searchParams.get("n") ?? 60)));
  const live = await fetchLiveNews(n).catch(() => null);
  if (live) return NextResponse.json(live);
  return NextResponse.json({ source: "SIM", headlines: getHeadlines(n) });
}
