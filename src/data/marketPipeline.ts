/**
 * market_data_pipeline bridge.
 *
 * The Python service (`/market_data_pipeline`) ingests FRED + Yahoo (pluggable
 * vendors), lands a medallion warehouse, and serves market/macro snapshots over
 * FastAPI. Its gold "card" views are exported to JSON and committed here under
 * `src/data/market/`, imported at build time so the terminal renders them with
 * zero config and no hydration drift.
 *
 * At runtime the `/api/market/[view]` route will transparently upgrade to the
 * LIVE FastAPI service when `MARKET_PIPELINE_URL` is set; otherwise it serves
 * this committed snapshot. Identical shapes either way.
 */

import marketSnapshotRaw from "./market/market_snapshot.json";
import crossAssetRaw from "./market/cross_asset.json";
import ratesRaw from "./market/rates.json";
import inflationRaw from "./market/inflation.json";
import regimeRaw from "./market/regime.json";
import bilelloRaw from "./market/bilello.json";
import marketSnapshotPriceRaw from "./market/market_snapshot_price.json";
import crossAssetPriceRaw from "./market/cross_asset_price.json";
import regimePriceRaw from "./market/regime_price.json";
import bilelloPriceRaw from "./market/bilello_price.json";
import indexReturnsRaw from "./market/index_returns.json";
import indexReturnsPriceRaw from "./market/index_returns_price.json";

export interface SnapshotCard {
  series_id: string;
  display_name: string;
  asset_class: string;
  source: string | null;
  price: number | null;
  asof: string | null;
  ret_1d: number | null;
  ret_5d: number | null;
  mtd: number | null;
  ytd: number | null;
  ret_1y: number | null;
  cagr_3y: number | null;
  cagr_5y: number | null;
  max_drawdown: number | null;
  pct_from_52w_high: number | null;
}

export type ReturnBasis = "total" | "price";

export interface ReturnBasisPayload {
  return_basis?: ReturnBasis;
}

export interface CrossAssetItem {
  series_id: string;
  display_name: string;
  price: number | null;
  ytd: number | null;
  ret_1y: number | null;
  asof: string | null;
}

export interface CrossAsset {
  equities: CrossAssetItem[];
  bonds: CrossAssetItem[];
  commodities: CrossAssetItem[];
  credit: CrossAssetItem[];
  volatility: CrossAssetItem[];
  currencies: CrossAssetItem[];
  asof: string;
}

export interface RatesView {
  asof: string;
  curve: { series_id: string; tenor: string; label: string; yield: number | null }[];
  spreads: { two_s_ten_s_bps: number | null; three_m_ten_y_bps: number | null };
  changes: {
    series_id: string;
    label: string;
    latest: number | null;
    chg_1d_bps: number | null;
    chg_1w_bps: number | null;
    chg_1m_bps: number | null;
    chg_3m_bps: number | null;
    chg_ytd_bps: number | null;
  }[];
}

export interface InflationCard {
  series_id: string;
  label: string;
  yoy: number | null;
  prior_yoy: number | null;
  mom: number | null;
  trend: string | null;
  asof: string | null;
}

export interface RegimeScore {
  score: number;
  label: string;
}

export interface RegimeView {
  asof: string;
  risk_on_off: RegimeScore;
  inflation_pressure: RegimeScore;
  growth_momentum: RegimeScore;
  liquidity: RegimeScore;
  composite: RegimeScore;
  narrative: string;
}

export interface BilelloView {
  return_basis?: ReturnBasis;
  asof?: string | null;
  best_worst_ytd: { best: { series_id: string; display_name: string; ytd: number }[]; worst: { series_id: string; display_name: string; ytd: number }[] };
  asset_class_returns_by_year: { series_id?: string; display_name?: string; asset_class: string; year: number; total_return: number }[];
  current_drawdowns: { series_id: string; display_name: string; drawdown: number | null }[];
  rate_moves_ranked: Record<string, unknown>[];
  inflation_vs_policy_gap: Record<string, unknown>;
  unemployment_vs_longrun: Record<string, unknown>;
}

export interface IndexDefinition {
  symbol: string;
  proxy?: string;
  name: string;
  base: number;
  vol: number;
  drift: number;
}

export interface MonthlyReturnRow {
  month: string;
  values: Record<string, number | null>;
  monthAverage: number | null;
}

export interface IndexYearSummary {
  year: number;
  annualReturn: number | null;
  maxDrawdown: number | null;
  isYtd: boolean;
}

export interface IndexReturnMatrix {
  index: IndexDefinition;
  years: number[];
  ytdYear: number;
  rows: MonthlyReturnRow[];
  annualReturns: Record<string, number | null>;
  averageAnnualReturn: number;
  summaries: IndexYearSummary[];
}

export interface IndexReturnsView {
  return_basis?: ReturnBasis;
  asof?: string | null;
  indices: IndexDefinition[];
  matrices: Record<string, IndexReturnMatrix>;
}

export const marketSnapshot = (marketSnapshotRaw as { cards: SnapshotCard[] }).cards;
export const crossAsset = crossAssetRaw as unknown as CrossAsset;
export const ratesView = ratesRaw as unknown as RatesView;
export const inflationView = (inflationRaw as { cards: InflationCard[] }).cards;
export const regimeView = regimeRaw as unknown as RegimeView;
export const bilelloView = bilelloRaw as unknown as BilelloView;
export const indexReturnsView = indexReturnsRaw as unknown as IndexReturnsView;

/** Snapshot keyed by view name, mirroring the FastAPI endpoints. */
export const SNAPSHOTS = {
  market: marketSnapshotRaw,
  "cross-asset": crossAssetRaw,
  rates: ratesRaw,
  inflation: inflationRaw,
  regime: regimeRaw,
  bilello: bilelloRaw,
  "index-returns": indexReturnsRaw,
} as const;

export const PRICE_SNAPSHOTS = {
  market: marketSnapshotPriceRaw,
  "cross-asset": crossAssetPriceRaw,
  regime: regimePriceRaw,
  bilello: bilelloPriceRaw,
  "index-returns": indexReturnsPriceRaw,
} as const;

export type MarketView = keyof typeof SNAPSHOTS;
