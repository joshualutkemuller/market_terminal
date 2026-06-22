/**
 * Live DATAOPS runs/lineage from the market_data_pipeline ingestion manifest.
 *
 * When MARKET_PIPELINE_URL is configured we fetch `/manifest/latest` (the
 * pipeline's per-series ingestion audit) and aggregate it into the terminal's
 * ProviderRun / SeriesRunResult / LineageRun shapes, so the DATAOPS Runs, Series
 * Outcomes and Lineage panels show real ingestion history. Returns null when no
 * pipeline is wired (→ the page keeps its fixture baseline).
 */
import type { ProviderName, ProviderRun, SeriesRunResult, LineageRun } from "@/data/dataOps";

interface ManifestRow {
  ingestion_run_id?: string;
  source?: string;
  dataset?: string;
  symbol_or_series_id?: string;
  request_url_or_endpoint?: string;
  requested_at?: string | Date | number;
  response_status?: string;
  row_count?: number | string;
  data_quality_status?: string;
  error_message?: string;
  latency_ms?: number | string;
}

export interface LiveRuns {
  runs: ProviderRun[];
  series: SeriesRunResult[];
  lineage: LineageRun[];
}

const DOWNSTREAM: Partial<Record<ProviderName, string[]>> = {
  FRED: ["ECON", "CURV", "CRDT", "STAT", "FUND"],
  YAHOO: ["MKT", "SNAP", "IRET", "QUILT", "LENS"],
  SYNTHETIC: ["HOME", "SLAB", "PB"],
};

function mapProvider(source?: string): ProviderName {
  const s = (source ?? "").toLowerCase();
  if (s.includes("fred")) return "FRED";
  if (s.includes("yahoo") || s.includes("yfinance")) return "YAHOO";
  if (s.includes("synth") || s.includes("fallback")) return "SYNTHETIC";
  return "YAHOO";
}

const rowFailed = (r: ManifestRow) => !!r.error_message || /fail|error/i.test(r.response_status ?? "") || /fail/i.test(r.data_quality_status ?? "");
const rowStale = (r: ManifestRow) => /stale|warn|partial/i.test(r.data_quality_status ?? "") || /synthetic|fallback/i.test(r.response_status ?? "");

// Accepts ISO strings, JS Dates (pg), or epoch ms (DuckDB) uniformly.
const toMs = (v: unknown): number => (typeof v === "number" ? v : Date.parse(String(v ?? "")));
const fmtTs = (ms: number): string => (Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16).replace("T", " ") : "—");
const minsAgo = (ms: number): number => (Number.isFinite(ms) ? Math.max(0, Math.round((Date.now() - ms) / 60000)) : 0);

function aggregate(rows: ManifestRow[]): LiveRuns {
  const byRun = new Map<string, ManifestRow[]>();
  for (const r of rows) {
    const key = r.ingestion_run_id ?? "unknown";
    (byRun.get(key) ?? byRun.set(key, []).get(key)!).push(r);
  }

  const runs: ProviderRun[] = [];
  const series: SeriesRunResult[] = [];
  const lineage: LineageRun[] = [];

  for (const [runId, members] of byRun) {
    const provider = mapProvider(members[0]?.source);
    const failed = members.filter(rowFailed).length;
    const status: ProviderRun["status"] = failed === 0 ? "OK" : failed >= members.length ? "FAILED" : "PARTIAL";
    const times = members.map((m) => toMs(m.requested_at)).filter(Number.isFinite);
    const start = times.length ? Math.min(...times) : Date.now();
    const end = times.length ? Math.max(...times) : start;
    const rowsIngested = members.reduce((a, m) => a + Number(m.row_count ?? 0), 0);
    const dataset = members[0]?.dataset ?? "market_data";

    runs.push({
      runId,
      provider,
      pipeline: "market_data_pipeline",
      started: fmtTs(start),
      completed: fmtTs(end),
      durationMs: Math.max(0, end - start),
      status,
      requestedSeries: members.length,
      successSeries: members.length - failed,
      failedSeries: failed,
      rowsIngested,
      rowsRejected: members.filter((m) => rowStale(m) && !rowFailed(m)).length,
      freshnessMin: minsAgo(end),
      artifact: members[0]?.request_url_or_endpoint ?? `manifest:${runId}`,
    });

    for (const m of members) {
      series.push({
        runId,
        provider,
        seriesId: m.symbol_or_series_id ?? "—",
        dataset: m.dataset ?? dataset,
        displayName: m.symbol_or_series_id ?? "—",
        status: rowFailed(m) ? "FAILED" : rowStale(m) ? "STALE" : "SUCCESS",
        rows: Number(m.row_count ?? 0),
        asOf: String(m.requested_at ?? "").slice(0, 10),
        latencyMs: Number(m.latency_ms ?? 0), // real per-series latency from the manifest
        message: m.error_message || m.response_status || m.data_quality_status || "ok",
      });
    }

    lineage.push({
      runId,
      source: provider,
      dataset,
      rows: rowsIngested,
      started: fmtTs(start),
      completed: fmtTs(end),
      durationMs: Math.max(0, end - start),
      status,
      upstreamRunId: runId,
      downstream: DOWNSTREAM[provider] ?? [],
      artifact: `manifest:${runId}`,
      qualityScore: status === "OK" ? 98 : status === "PARTIAL" ? 85 : 50,
    });
  }

  // newest first
  runs.sort((a, b) => b.started.localeCompare(a.started));
  lineage.sort((a, b) => b.started.localeCompare(a.started));
  return { runs, series, lineage };
}

function optionalRequire(name: string): any {
  try {
    // eslint-disable-next-line no-eval
    return (eval("require") as NodeRequire)(name);
  } catch {
    return null;
  }
}

const MANIFEST_SQL = (limit: number) => `SELECT * FROM ingestion_manifest ORDER BY requested_at DESC LIMIT ${limit}`;

/** Read the manifest directly from MARKET_DB_URL (Postgres or DuckDB), mirroring the market views path. */
async function readManifestFromDb(dbUrl: string, limit: number): Promise<ManifestRow[] | null> {
  const isPg = /^postgres(ql)?:\/\//.test(dbUrl);
  if (isPg) {
    const pg = optionalRequire("pg");
    if (!pg) return null;
    const client = new pg.Client({ connectionString: dbUrl });
    try {
      await client.connect();
      const r = await client.query(MANIFEST_SQL(limit));
      return (r.rows ?? []) as ManifestRow[];
    } finally {
      await client.end().catch(() => {});
    }
  }
  // DuckDB file
  const duckdb = optionalRequire("duckdb");
  if (!duckdb) return null;
  const file = dbUrl.replace(/^duckdb:/, "");
  const db = new duckdb.Database(file, duckdb.OPEN_READONLY ?? 1);
  const con = db.connect();
  try {
    return await new Promise<ManifestRow[]>((resolve, reject) =>
      con.all(MANIFEST_SQL(limit), (err: Error | null, res: ManifestRow[]) => (err ? reject(err) : resolve(res ?? [])))
    );
  } finally {
    db.close();
  }
}

/** Fetch the FastAPI manifest endpoint. */
async function readManifestFromPipeline(base: string, limit: number): Promise<ManifestRow[] | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/manifest/latest?limit=${limit}`, { cache: "no-store", signal: ctrl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j?.manifest) ? (j.manifest as ManifestRow[]) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve + aggregate the ingestion manifest from the first configured source —
 * MARKET_DB_URL (DuckDB/Postgres) → MARKET_PIPELINE_URL (FastAPI) — mirroring the
 * market-views resolver. Returns null when nothing is wired/reachable.
 */
export async function fetchPipelineManifest(limit = 200): Promise<LiveRuns | null> {
  const dbUrl = process.env.MARKET_DB_URL;
  if (dbUrl) {
    try {
      const rows = await readManifestFromDb(dbUrl, limit);
      if (rows && rows.length) return aggregate(rows);
    } catch {
      // fall through to the service
    }
  }
  const base = process.env.MARKET_PIPELINE_URL;
  if (base) {
    const rows = await readManifestFromPipeline(base, limit);
    if (rows && rows.length) return aggregate(rows);
  }
  return null;
}
