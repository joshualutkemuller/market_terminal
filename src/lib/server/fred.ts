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
const TTL_MS = 10 * 60 * 1000; // 10 minutes

type CacheEntry = { at: number; data: unknown };
const cache = new Map<string, CacheEntry>();

export function fredEnabled(): boolean {
  return Boolean(process.env.FRED_API_KEY);
}

async function fredGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY not configured");
  const qs = new URLSearchParams({ ...params, api_key: key, file_type: "json" }).toString();
  const url = `${BASE}${path}?${qs}`;
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data as T;

  const res = await fetch(url, { next: { revalidate: 600 } } as RequestInit);
  if (!res.ok) throw new Error(`FRED ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  const data = (await res.json()) as T;
  cache.set(url, { at: Date.now(), data });
  return data;
}

export interface FredObservation {
  date: string;
  value: number | null;
}

/** Series observations between dates (defaults to recent window). */
export async function fredSeries(seriesId: string, opts: { start?: string; limit?: number } = {}): Promise<FredObservation[]> {
  const params: Record<string, string> = { series_id: seriesId, sort_order: "asc" };
  if (opts.start) params.observation_start = opts.start;
  if (opts.limit) {
    params.limit = String(opts.limit);
    params.sort_order = "desc";
  }
  const json = await fredGet<{ observations: { date: string; value: string }[] }>("/series/observations", params);
  const obs = json.observations.map((o) => ({ date: o.date, value: o.value === "." ? null : Number(o.value) }));
  return opts.limit ? obs.reverse() : obs;
}

/** Latest non-missing value for a series. */
export async function fredLatest(seriesId: string): Promise<FredObservation | null> {
  const obs = await fredSeries(seriesId, { limit: 12 });
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
