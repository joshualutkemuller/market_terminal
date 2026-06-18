import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { SNAPSHOTS, type MarketView } from "@/data/marketPipeline";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // needs fs + optional native DB drivers

/** FastAPI path for each terminal view (market_data_pipeline endpoints). */
const ENDPOINT: Record<MarketView, string> = {
  market: "/snapshot/market",
  "cross-asset": "/snapshot/cross-asset",
  rates: "/snapshot/rates",
  inflation: "/snapshot/inflation",
  regime: "/dashboard/regime",
  bilello: "/dashboard/bilello",
};

/** Exported-JSON filename for each view (matches `mdp export-views`). */
const FILE_NAME: Record<MarketView, string> = {
  market: "market_snapshot.json",
  "cross-asset": "cross_asset.json",
  rates: "rates.json",
  inflation: "inflation.json",
  regime: "regime.json",
  bilello: "bilello.json",
};

/** Require an optional module at runtime without the bundler resolving it. */
function optionalRequire(name: string): any {
  try {
    // eslint-disable-next-line no-eval
    return (eval("require") as NodeRequire)(name);
  } catch {
    return null;
  }
}

/**
 * Read one view's JSON payload from the pipeline's `analytics_api_views` table.
 * Supports a local DuckDB file (`*.duckdb` / `duckdb:<path>`) or Postgres
 * (`postgres://…`). Drivers are optional — install `duckdb` or `pg` to use them.
 */
async function readFromDb(dbUrl: string, view: MarketView): Promise<unknown | null> {
  const isPg = /^postgres(ql)?:\/\//.test(dbUrl);
  if (isPg) {
    const pg = optionalRequire("pg");
    if (!pg) return null;
    const client = new pg.Client({ connectionString: dbUrl });
    try {
      await client.connect();
      const r = await client.query(
        "SELECT payload_json FROM analytics_api_views WHERE view = $1",
        [view]
      );
      return r.rows[0]?.payload_json ? JSON.parse(r.rows[0].payload_json) : null;
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
    const rows: any[] = await new Promise((resolve, reject) =>
      con.all(
        "SELECT payload_json FROM analytics_api_views WHERE view = ?",
        view,
        (err: Error | null, res: any[]) => (err ? reject(err) : resolve(res))
      )
    );
    return rows[0]?.payload_json ? JSON.parse(rows[0].payload_json) : null;
  } finally {
    db.close();
  }
}

/** Read one view's JSON payload from a local directory of exported files. */
async function readFromDir(dir: string, view: MarketView): Promise<unknown | null> {
  try {
    const raw = await readFile(path.join(dir, FILE_NAME[view]), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * GET /api/market/[view]
 *
 * Resolves a market_data_pipeline view from the first configured source:
 *   1. MARKET_DB_URL    — local DuckDB file or Postgres `analytics_api_views`  → source "DB"
 *   2. MARKET_DATA_DIR  — directory of exported view JSON (`mdp export-views`) → source "FILE"
 *   3. MARKET_PIPELINE_URL — the running FastAPI service                       → source "LIVE"
 *   4. committed build-time snapshot                                          → source "SNAPSHOT"
 *
 * Always 200 with a `source` field so the UI renders uniformly and never blocks.
 */
export async function GET(_req: NextRequest, { params }: { params: { view: string } }) {
  const view = params.view as MarketView;
  if (!(view in SNAPSHOTS)) {
    return NextResponse.json({ error: `unknown view '${view}'` }, { status: 404 });
  }

  // 1. local database (DuckDB file or Postgres)
  const dbUrl = process.env.MARKET_DB_URL;
  if (dbUrl) {
    try {
      const data = await readFromDb(dbUrl, view);
      if (data) return NextResponse.json({ source: "DB", view, data });
    } catch {
      // fall through
    }
  }

  // 2. local exported-file cache
  const dir = process.env.MARKET_DATA_DIR;
  if (dir) {
    const data = await readFromDir(dir, view);
    if (data) return NextResponse.json({ source: "FILE", view, data });
  }

  // 3. live FastAPI service
  const base = process.env.MARKET_PIPELINE_URL;
  if (base) {
    try {
      const r = await fetch(`${base.replace(/\/$/, "")}${ENDPOINT[view]}`, {
        signal: AbortSignal.timeout(4000),
        cache: "no-store",
      });
      if (r.ok) return NextResponse.json({ source: "LIVE", view, data: await r.json() });
    } catch {
      // fall through
    }
  }

  // 4. committed build-time snapshot
  return NextResponse.json({ source: "SNAPSHOT", view, data: SNAPSHOTS[view] });
}
