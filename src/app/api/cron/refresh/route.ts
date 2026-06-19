import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/refresh  — daily cache warmer (Vercel Cron).
 *
 * Hits the FRED-backed econ routes and market-data bridge routes so server
 * caches are refreshed once a day even with no user traffic. When
 * MARKET_PIPELINE_URL is configured, it first asks the Python pipeline to ingest
 * a small recent market window, keeping Yahoo use bounded by the daily cron.
 *
 * Schedule lives in vercel.json. When `CRON_SECRET` is set, Vercel sends it as a
 * Bearer token and this endpoint requires it, so it can't be triggered publicly.
 */
const ECON_TARGETS = [
  "/api/econ/curve-history?years=7",
  "/api/econ/curve",
  "/api/econ/indicators",
  "/api/econ/calendar",
];

const MARKET_TARGETS = [
  "/api/market/market",
  "/api/market/cross-asset",
  "/api/market/rates",
  "/api/market/inflation",
  "/api/market/regime",
  "/api/market/bilello",
];

function baseUrl(req: NextRequest): string {
  const host =
    process.env.CRON_TARGET_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL;
  if (host) return host.startsWith("http") ? host : `https://${host}`;
  // local dev: derive from the incoming request
  return req.nextUrl.origin;
}

function marketRefreshStart(): string {
  const raw = Number(process.env.MARKET_CRON_LOOKBACK_DAYS ?? "14");
  const days = Number.isFinite(raw) && raw > 0 ? raw : 14;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function refreshPipeline() {
  const base = process.env.MARKET_PIPELINE_URL?.replace(/\/$/, "");
  if (!base || process.env.MARKET_CRON_INGESTION === "0") {
    return { skipped: true, reason: base ? "disabled" : "MARKET_PIPELINE_URL unset" };
  }

  const start = process.env.MARKET_CRON_START_DATE || marketRefreshStart();
  const r = await fetch(`${base}/ingestion/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ start }),
    cache: "no-store",
    signal: AbortSignal.timeout(25000),
  });
  const body = await r.json().catch(() => ({}));
  return { skipped: false, status: r.status, start, body };
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const base = baseUrl(req).replace(/\/$/, "");
  const startedAt = new Date().toISOString();
  const pipeline = await refreshPipeline().catch((err) => ({
    skipped: false,
    status: 0,
    error: err instanceof Error ? err.message : String(err),
  }));
  const targets = [...ECON_TARGETS, ...MARKET_TARGETS];

  const results = await Promise.allSettled(
    targets.map(async (path) => {
      const r = await fetch(`${base}${path}`, { cache: "no-store", signal: AbortSignal.timeout(25000) });
      const body = await r.json().catch(() => ({}));
      return {
        path,
        status: r.status,
        source: body?.source ?? null,
        asOf: body?.asOf ?? body?.curve?.date ?? body?.data?.asof ?? body?.data?.cards?.[0]?.asof ?? null,
      };
    })
  );

  const warmed = results.map((res, i) =>
    res.status === "fulfilled"
      ? res.value
      : { path: targets[i], status: 0, error: res.reason instanceof Error ? res.reason.message : String(res.reason) }
  );

  return NextResponse.json({ ok: true, startedAt, finishedAt: new Date().toISOString(), pipeline, warmed });
}
