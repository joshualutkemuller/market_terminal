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

// Override with FRED_BASE_URL to point at a mirror/proxy endpoint; defaults to
// the public FRED API. FRED rejects plain HTTP, so upgrade the official host even
// if an older runtime env var still says http://api.stlouisfed.org/fred.
function normalizeFredBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  try {
    const url = new URL(trimmed);
    if (url.hostname === "api.stlouisfed.org") url.protocol = "https:";
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
}

const BASE = normalizeFredBaseUrl(process.env.FRED_BASE_URL || "https://api.stlouisfed.org/fred");
const DEFAULT_REVALIDATE = 600; // 10 minutes

type CacheEntry = { at: number; ttlMs: number; data: unknown };
const cache = new Map<string, CacheEntry>();
const FRED_HEADERS = {
  accept: "application/json,text/csv,text/plain,*/*",
  "user-agent": "market-terminal/0.1 (+https://github.com/joshualutkemuller/market_terminal)",
};

class FredHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
    this.name = "FredHttpError";
  }
}

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
    const res = await fetch(url, { headers: FRED_HEADERS, signal: AbortSignal.timeout(6000) });
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

  let res: Response;
  try {
    res = await fetch(url, { headers: FRED_HEADERS });
  } catch (err) {
    // Network-level failure (blocked egress, DNS, proxy, TLS). The econ routes
    // swallow this and fall back to SIM, so log it loudly here — it shows up in
    // the `npm run dev` / server terminal as the real reason econ went SIM.
    console.warn(`[fred] network error calling ${path}: ${(err as Error).message}`);
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    console.warn(`[fred] ${path} via ${new URL(url).protocol} → HTTP ${res.status}: ${body.slice(0, 200)}`);
    throw new FredHttpError(`FRED ${res.status}: ${body}`, res.status, body);
  }
  const data = (await res.json()) as T;
  cache.set(url, { at: Date.now(), ttlMs: revalidateSec * 1000, data });
  return data;
}

function parseFredCsv(csv: string, seriesId: string): FredObservation[] {
  const rows = csv.trim().split(/\r?\n/);
  const out: FredObservation[] = [];
  for (const row of rows.slice(1)) {
    const [date, raw] = row.split(",");
    if (!date || raw == null) continue;
    out.push({ date, value: raw === "." ? null : Number(raw) });
  }
  if (!out.length) throw new Error(`FRED CSV fallback returned no observations for ${seriesId}`);
  return out.filter((o) => o.value == null || Number.isFinite(o.value));
}

function medianGapDays(obs: FredObservation[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < Math.min(obs.length, 40); i++) {
    const a = Date.parse(obs[i - 1].date);
    const b = Date.parse(obs[i].date);
    if (Number.isFinite(a) && Number.isFinite(b)) gaps.push((b - a) / 86400000);
  }
  if (!gaps.length) return 30;
  return gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
}

function periodsPerYear(obs: FredObservation[]): number {
  const gap = medianGapDays(obs);
  if (gap <= 3) return 252;
  if (gap <= 10) return 52;
  if (gap <= 45) return 12;
  if (gap <= 110) return 4;
  return 1;
}

function transformFredObservations(obs: FredObservation[], units?: string): FredObservation[] {
  if (!units || units === "lin") return obs;
  const perYear = periodsPerYear(obs);
  const yoyLag = perYear === 252 ? 252 : perYear;
  return obs.map((o, i) => {
    const prev = obs[i - 1]?.value;
    const yearAgo = obs[i - yoyLag]?.value;
    const value =
      o.value == null ? null
      : units === "chg" ? (prev == null ? null : o.value - prev)
      : units === "pch" ? (prev == null || prev === 0 ? null : ((o.value - prev) / Math.abs(prev)) * 100)
      : units === "pc1" ? (yearAgo == null || yearAgo === 0 ? null : ((o.value - yearAgo) / Math.abs(yearAgo)) * 100)
      : units === "pca" ? (prev == null || prev <= 0 || o.value <= 0 ? null : (Math.pow(o.value / prev, perYear) - 1) * 100)
      : o.value;
    return { date: o.date, value };
  });
}

async function fredGraphSeries(
  seriesId: string,
  opts: { start?: string; end?: string; units?: string; scale?: number; revalidateSec?: number } = {}
): Promise<FredObservation[]> {
  const params = new URLSearchParams({ id: seriesId });
  if (opts.start) params.set("cosd", opts.start);
  if (opts.end) params.set("coed", opts.end);
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?${params.toString()}`;
  const cacheKey = `${url}|units=${opts.units ?? "lin"}|scale=${opts.scale ?? 1}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < cached.ttlMs) return cached.data as FredObservation[];

  const res = await fetch(url, { headers: FRED_HEADERS });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new FredHttpError(`FRED CSV ${res.status}: ${body}`, res.status, body);
  }
  const raw = parseFredCsv(await res.text(), seriesId);
  const scale = opts.scale ?? 1;
  const data = transformFredObservations(raw, opts.units).map((o) => ({
    date: o.date,
    value: o.value == null ? null : o.value * scale,
  }));
  cache.set(cacheKey, { at: Date.now(), ttlMs: (opts.revalidateSec ?? DEFAULT_REVALIDATE) * 1000, data });
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
  let json: { observations: { date: string; value: string }[] };
  try {
    json = await fredGet<{ observations: { date: string; value: string }[] }>("/series/observations", params, opts.revalidateSec);
  } catch (err) {
    if (!(err instanceof FredHttpError)) throw err;
    console.warn(`[fred] JSON API failed for ${seriesId}; trying public CSV fallback (${err.status})`);
    let fallback = await fredGraphSeries(seriesId, opts);
    fallback = fallback.filter((o) => o.value !== null);
    if (opts.limit && fallback.length > opts.limit) fallback = fallback.slice(fallback.length - opts.limit);
    return fallback;
  }
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
