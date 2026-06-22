import { json } from "@/lib/server/http";
import { fetchPipelineManifest } from "@/lib/server/marketManifest";


/**
 * GET /api/dataops/runs
 * Live ingestion runs / series outcomes / lineage from the market_data_pipeline
 * manifest (MARKET_PIPELINE_URL → /manifest/latest), aggregated into the
 * terminal shapes. `live:false` (and empty arrays) when no pipeline is wired so
 * the page keeps its fixture baseline.
 */
export async function GET() {
  const data = await fetchPipelineManifest().catch(() => null);
  if (!data) return json({ live: false, runs: [], series: [], lineage: [] });
  return json({ live: true, ...data });
}
