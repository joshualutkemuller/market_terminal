import { NextResponse } from "next/server";
import { fetchPipelineManifest } from "@/lib/server/marketManifest";

export const dynamic = "force-dynamic";

/**
 * GET /api/dataops/runs
 * Live ingestion runs / series outcomes / lineage from the market_data_pipeline
 * manifest (MARKET_PIPELINE_URL → /manifest/latest), aggregated into the
 * terminal shapes. `live:false` (and empty arrays) when no pipeline is wired so
 * the page keeps its fixture baseline.
 */
export async function GET() {
  const data = await fetchPipelineManifest().catch(() => null);
  if (!data) return NextResponse.json({ live: false, runs: [], series: [], lineage: [] });
  return NextResponse.json({ live: true, ...data });
}
