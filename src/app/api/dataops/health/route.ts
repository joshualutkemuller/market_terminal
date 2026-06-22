import { NextResponse } from "next/server";
import { fredEnabled } from "@/lib/server/fred";
import { configuredNewsProviders } from "@/lib/server/newsProviders";
import { configuredSocialProviders } from "@/lib/server/socialProviders";

export const dynamic = "force-dynamic";

type Status = "LIVE" | "CACHED" | "SIM" | "STALE" | "ERROR" | "FALLBACK_AVAILABLE";
interface ProviderProbe {
  status: Status;
  detail: string;
  live: boolean;
}

/** Reachability probe for URL-based upstreams (news_nlp, market pipeline). */
async function probe(base: string, path = "/health", ms = 3000): Promise<{ ok: boolean; body?: Record<string, unknown> }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}${path}`, { cache: "no-store", signal: ctrl.signal });
    if (!r.ok) return { ok: false };
    return { ok: true, body: await r.json().catch(() => undefined) };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/dataops/health
 * Probes each backend's real status from the server (env config + reachability
 * checks for URL-based services) so the DATAOPS provider panel reflects what's
 * actually wired, not just fixtures. Always 200.
 */
export async function GET() {
  const providers: Record<string, ProviderProbe> = {};

  // FRED — key presence (we don't spend quota just to probe).
  providers.FRED = fredEnabled()
    ? { status: "LIVE", detail: "FRED_API_KEY configured", live: true }
    : { status: "SIM", detail: "no FRED_API_KEY — deterministic econ model", live: false };

  // Market pipeline (YAHOO) — resolver order DB → FILE → PIPELINE → snapshot.
  const { MARKET_DB_URL, MARKET_DATA_DIR, MARKET_PIPELINE_URL } = process.env;
  if (MARKET_PIPELINE_URL) {
    const p = await probe(MARKET_PIPELINE_URL);
    providers.YAHOO = p.ok
      ? { status: "LIVE", detail: `pipeline service reachable (${MARKET_PIPELINE_URL})`, live: true }
      : { status: "STALE", detail: "MARKET_PIPELINE_URL set but unreachable", live: false };
  } else if (MARKET_DB_URL) {
    providers.YAHOO = { status: "LIVE", detail: "MARKET_DB_URL (DuckDB/Postgres)", live: true };
  } else if (MARKET_DATA_DIR) {
    providers.YAHOO = { status: "LIVE", detail: "MARKET_DATA_DIR (exported views)", live: true };
  } else {
    providers.YAHOO = { status: "CACHED", detail: "committed market snapshot", live: false };
  }

  // macro_data_etl — committed gold snapshot at build time.
  providers.MACRO_ETL = { status: "CACHED", detail: "committed macro_data_etl gold snapshot", live: false };

  // news_nlp + the news/social provider chains.
  const newsP = configuredNewsProviders();
  const socialP = configuredSocialProviders();
  const feeds = [...newsP, ...socialP];
  const nlpUrl = process.env.NEWS_NLP_URL;
  if (nlpUrl) {
    const p = await probe(nlpUrl);
    const model = (p.body?.model as string) ?? "?";
    providers.NEWS_NLP = p.ok
      ? { status: "LIVE", detail: `FinBERT service up (model=${model})${feeds.length ? ` · feeds: ${feeds.join(", ")}` : ""}`, live: true }
      : { status: "STALE", detail: "NEWS_NLP_URL set but /health unreachable", live: false };
  } else if (feeds.length) {
    providers.NEWS_NLP = { status: "CACHED", detail: `provider sentiment + in-house heuristic · feeds: ${feeds.join(", ")}`, live: false };
  } else {
    providers.NEWS_NLP = { status: "SIM", detail: "no news/social keys, no NEWS_NLP_URL — heuristic/SIM", live: false };
  }

  // Internal books — not connected in this build.
  providers.LOCAL_BOOK = { status: "SIM", detail: "internal books not connected", live: false };

  // Deterministic fallback — always available.
  providers.SYNTHETIC = { status: "FALLBACK_AVAILABLE", detail: "deterministic fallback available; not a live upstream", live: false };

  return NextResponse.json({ probedAt: new Date().toISOString(), providers });
}
