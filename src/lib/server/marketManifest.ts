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
  requested_at?: string;
  response_status?: string;
  row_count?: number;
  data_quality_status?: string;
  error_message?: string;
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

const fmtTs = (iso?: string): string => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : "—";
};
const minsAgo = (iso?: string): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : 0;
};

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
    const times = members.map((m) => Date.parse(m.requested_at ?? "")).filter(Number.isFinite) as number[];
    const start = times.length ? Math.min(...times) : Date.now();
    const end = times.length ? Math.max(...times) : start;
    const rowsIngested = members.reduce((a, m) => a + (m.row_count ?? 0), 0);
    const dataset = members[0]?.dataset ?? "market_data";

    runs.push({
      runId,
      provider,
      pipeline: "market_data_pipeline",
      started: fmtTs(new Date(start).toISOString()),
      completed: fmtTs(new Date(end).toISOString()),
      durationMs: Math.max(0, end - start),
      status,
      requestedSeries: members.length,
      successSeries: members.length - failed,
      failedSeries: failed,
      rowsIngested,
      rowsRejected: members.filter((m) => rowStale(m) && !rowFailed(m)).length,
      freshnessMin: minsAgo(new Date(end).toISOString()),
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
        rows: m.row_count ?? 0,
        asOf: (m.requested_at ?? "").slice(0, 10),
        latencyMs: 0, // manifest does not record per-series latency
        message: m.error_message || m.response_status || m.data_quality_status || "ok",
      });
    }

    lineage.push({
      runId,
      source: provider,
      dataset,
      rows: rowsIngested,
      started: fmtTs(new Date(start).toISOString()),
      completed: fmtTs(new Date(end).toISOString()),
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

/** Fetch + aggregate the pipeline manifest, or null if no pipeline is configured/reachable. */
export async function fetchPipelineManifest(limit = 200): Promise<LiveRuns | null> {
  const base = process.env.MARKET_PIPELINE_URL;
  if (!base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/manifest/latest?limit=${limit}`, { cache: "no-store", signal: ctrl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const rows: ManifestRow[] = Array.isArray(j?.manifest) ? j.manifest : [];
    if (!rows.length) return null;
    return aggregate(rows);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
