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
 * `revalidateSec` controls both the Next Data Cache and our in-memory TTL.
 * Deep daily history (e.g. the curve point-in-time) only changes at its recent
 * tail once a day, so callers pass a long window to cache it over time and avoid
 * re-pulling decades of observations on every request.
 */
async function fredGet<T>(path: string, params: Record<string, string>, revalidateSec = DEFAULT_REVALIDATE): Promise<T> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY not configured");
  const qs = new URLSearchParams({ ...params, api_key: key, file_type: "json" }).toString();
  const url = `${BASE}${path}?${qs}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < cached.ttlMs) return cached.data as T;

  const res = await fetch(url, { next: { revalidate: revalidateSec } } as RequestInit);
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

/** Upcoming economic-release dates (drives the live calendar). */
export async function fredReleaseDates(limit = 40): Promise<{ release_id: number; release_name: string; date: string }[]> {
  const json = await fredGet<{ release_dates: { release_id: number; release_name: string; date: string }[] }>("/releases/dates", {
    limit: String(limit),
    sort_order: "asc",
    include_release_dates_with_no_data: "true",
  });
  return json.release_dates;
}
