import { NextRequest, NextResponse } from "next/server";
import { fetchLiveNews } from "@/lib/server/newsProviders";
import { enrichWithNlp, fetchNlpClusters } from "@/lib/server/sentimentNlp";
import { getHeadlines } from "@/data/news";

export const dynamic = "force-dynamic";

/**
 * GET /api/news?n=60
 * Layered: headlines from the first configured provider (Alpha Vantage →
 * Marketaux → Finnhub → NewsAPI) else the SIM engine, then optionally
 * re-scored + clustered by the Python FinBERT stage (NEWS_NLP_URL). Always 200
 * with a `source` provenance field; FinBERT enrichment appends "+ FinBERT" and
 * supplies transformer event clusters for NEWS-6 (empty → keyword clustering).
 */
export async function GET(req: NextRequest) {
  const n = Math.min(120, Math.max(10, Number(req.nextUrl.searchParams.get("n") ?? 60)));
  const live = await fetchLiveNews(n).catch(() => null);
  const base = live ?? { source: "SIM", headlines: getHeadlines(n) };
  const [{ headlines, nlp }, clusters] = await Promise.all([
    enrichWithNlp(base.headlines).catch(() => ({ headlines: base.headlines, nlp: false })),
    fetchNlpClusters(base.headlines).catch(() => null),
  ]);
  return NextResponse.json({ source: nlp ? `${base.source} + FinBERT` : base.source, headlines, clusters: clusters ?? [] });
}
