/**
 * Server-only FRED (Federal Reserve Economic Data) client.
 *
 * Activated when FRED_API_KEY is set in the environment. FRED does not send CORS
 * headers, so it must be called server-side (these helpers run only inside the
 * /api/econ route handlers). A small in-memory TTL cache avoids hammering the API
 * and keeps us comfortably inside FRED's free rate limits.
 *
 * Get a free key: https://fred.stlouisfed.org/docs/api/api_key.html
 */

const BASE = "https://api.stlouisfed.org/fred";
const DEFAULT_REVALIDATE = 600; // 10 minutes

type CacheEntry = { at: number; ttlMs: number; data: unknown };
const cache = new Map<string, CacheEntry>();

export function fredEnabled(): boolean {
  return Boolean(process.env.FRED_API_KEY);
}

/**
 * Lightweight liveness probe: does the configured key actually reach FRED?
 * Makes one tiny real request (1 observation) and returns the outcome with the
 * real error message, so health/diagnostics can distinguish "no key in this
 * runtime" from "key present but rejected/unreachable" instead of silently
 * falling back to SIM.
 */
let probeCache: { at: number; result: { keyPresent: boolean; ok: boolean; detail: string } } | null = null;
const PROBE_TTL_MS = 60_000;

export async function fredProbe(): Promise<{ keyPresent: boolean; ok: boolean; detail: string }> {
  const key = process.env.FRED_API_KEY;
  if (!key) return { keyPresent: false, ok: false, detail: "FRED_API_KEY not present in this runtime" };
  if (probeCache && Date.now() - probeCache.at < PROBE_TTL_MS) return probeCache.result;
  const masked = `${key.slice(0, 4)}…(${key.length} chars)`;
  let result: { keyPresent: boolean; ok: boolean; detail: string };
  try {
    const url = `${BASE}/series/observations?series_id=DGS10&api_key=${encodeURIComponent(key)}&file_type=json&sort_order=desc&limit=1`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      result = { keyPresent: true, ok: false, detail: `FRED HTTP ${res.status} (key ${masked}): ${body.slice(0, 160)}` };
    } else {
      result = { keyPresent: true, ok: true, detail: `FRED reachable (key ${masked})` };
    }
  } catch (err) {
    result = { keyPresent: true, ok: false, detail: `FRED fetch failed (key ${masked}): ${(err as Error).message}` };
  }
  probeCache = { at: Date.now(), result };
  return result;
}

/**
 * `revalidateSec` controls the in-memory TTL below. Deep daily history (e.g. the
 * curve point-in-time) only changes at its recent tail once a day, so callers
 * pass a long window to cache it over time and avoid re-pulling decades of
 * observations on every request.
 *
 * The cache is a plain module-level `Map`, portable across runtimes (the
 * dev-server middleware and the standalone production server). It is not a
 * Next.js Data Cache — the previous `next: { revalidate }` fetch option was a
 * no-op outside Next and has been removed.
 */
async function fredGet<T>(path: string, params: Record<string, string>, revalidateSec = DEFAULT_REVALIDATE): Promise<T> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY not configured");
  const qs = new URLSearchParams({ ...params, api_key: key, file_type: "json" }).toString();
  const url = `${BASE}${path}?${qs}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < cached.ttlMs) return cached.data as T;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const data = (await res.json()) as T;
  cache.set(url, { at: Date.now(), ttlMs: revalidateSec * 1000, data });
  return data;
}

export interface FredObservation {
  date: string;
  value: number | null;
}

/**
 * Series observations between dates (defaults to recent window).
 * `units` applies a FRED transform (pc1 = % YoY, pch = % MoM, chg = change,
 * pca = compounded annual rate, lin = level). `scale` rescales the result for
 * display (e.g. spreads pp -> bps, $ millions -> $ trillions).
 */
export async function fredSeries(
  seriesId: string,
  opts: { start?: string; end?: string; limit?: number; units?: string; scale?: number; revalidateSec?: number } = {}
): Promise<FredObservation[]> {
  const params: Record<string, string> = { series_id: seriesId, sort_order: "asc" };
  if (opts.start) params.observation_start = opts.start;
  if (opts.end) params.observation_end = opts.end;
  if (opts.units && opts.units !== "lin") params.units = opts.units;
  if (opts.limit) {
    // pull extra so a YoY/MoM transform still yields `limit` populated points
    params.limit = String(opts.limit + (opts.units && opts.units !== "lin" ? 14 : 1));
    params.sort_order = "desc";
  }
  const json = await fredGet<{ observations: { date: string; value: string }[] }>("/series/observations", params, opts.revalidateSec);
  const scale = opts.scale ?? 1;
  let obs = json.observations.map((o) => ({ date: o.date, value: o.value === "." ? null : Number(o.value) * scale }));
  if (opts.limit) obs = obs.reverse();
  // trim leading nulls produced by transforms, then cap to the requested count
  obs = obs.filter((o) => o.value !== null);
  if (opts.limit && obs.length > opts.limit) obs = obs.slice(obs.length - opts.limit);
  return obs;
}

/** Latest non-missing value for a series, with optional units transform. */
export async function fredLatest(seriesId: string, opts: { units?: string; scale?: number } = {}): Promise<FredObservation | null> {
  const obs = await fredSeries(seriesId, { limit: 6, ...opts });
  for (let i = obs.length - 1; i >= 0; i--) if (obs[i].value !== null) return obs[i];
  return null;
}

/** Upcoming economic-release dates (drives the live calendar). Requests the
 *  forward schedule from today so the calendar shows what's coming, not past
 *  releases. `include_release_dates_with_no_data` surfaces dates not yet
 *  released; the future `realtime_end` exposes the scheduled calendar. */
export async function fredReleaseDates(limit = 60): Promise<{ release_id: number; release_name: string; date: string }[]> {
  const now = new Date();
  const start = now.toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 120 * 86400000).toISOString().slice(0, 10);
  const json = await fredGet<{ release_dates: { release_id: number; release_name: string; date: string }[] }>(
    "/releases/dates",
    {
      limit: String(limit),
      sort_order: "asc",
      include_release_dates_with_no_data: "true",
      realtime_start: start,
      realtime_end: end,
    },
    600
  );
  return json.release_dates;
}
