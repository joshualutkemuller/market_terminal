import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/refresh  — daily cache warmer (Vercel Cron).
 *
 * Hits the FRED-backed econ routes so their server caches (Next Data Cache +
 * in-memory) are refreshed once a day even with no user traffic — guaranteeing
 * the curve/rates/indicators are never more than ~a day stale. Each warmed route
 * re-pulls from FRED and re-populates the shared cache exactly as a user load
 * would (the historical points are immutable; only the recent tail advances).
 *
 * Schedule lives in vercel.json. When `CRON_SECRET` is set, Vercel sends it as a
 * Bearer token and this endpoint requires it, so it can't be triggered publicly.
 */
const TARGETS = [
  "/api/econ/curve-history?years=7",
  "/api/econ/curve",
  "/api/econ/indicators",
  "/api/econ/calendar",
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

  const results = await Promise.allSettled(
    TARGETS.map(async (path) => {
      const r = await fetch(`${base}${path}`, { cache: "no-store", signal: AbortSignal.timeout(25000) });
      const body = await r.json().catch(() => ({}));
      return { path, status: r.status, source: body?.source ?? null, asOf: body?.asOf ?? body?.curve?.date ?? null };
    })
  );

  const warmed = results.map((res, i) =>
    res.status === "fulfilled"
      ? res.value
      : { path: TARGETS[i], status: 0, error: res.reason instanceof Error ? res.reason.message : String(res.reason) }
  );

  return NextResponse.json({ ok: true, startedAt, finishedAt: new Date().toISOString(), warmed });
}
