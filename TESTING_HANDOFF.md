# Testing Handoff: Comprehensive Test Suite Plan

## Overview

This document defines a full test suite covering smoke tests, unit tests, integration tests, and data-provenance audits for the Market Terminal. The primary goal beyond correctness is ensuring **no simulated data is silently displayed when the user believes they're seeing real data**.

---

## 1. Existing Test Infrastructure

**Runner:** Vitest (node environment)
**Config:** `vitest.config.ts`
**Run:** `npx vitest run`

### Existing Tests (23 tests across 4 files)

| File | Tests | Covers |
|------|-------|--------|
| `src/lib/provenance.test.ts` | 5 | Freshness classification (FRESH/AGING/STALE) |
| `src/lib/charting/studies.test.ts` | 5 | Spread, ratio, correlation, beta, percentile |
| `src/lib/charting/indicators.test.ts` | 7 | SMA, EMA, Bollinger, RSI, MACD, gaps, OHLC |
| `src/lib/charting/transforms.test.ts` | 6 | pctChange, log, vsLag, index100, zscore |

### What's Missing

- No API route tests
- No hook fallback-chain tests
- No component rendering tests
- No E2E / smoke tests
- No data-provenance contract tests

---

## 2. Data Provenance Architecture

### Source Tiers (defined in `src/lib/provenance.ts`)

| Source | Live? | Meaning |
|--------|-------|---------|
| `FRED` | Yes | Live Federal Reserve API |
| `LIVE` | Yes | Live market_data_pipeline FastAPI |
| `DB` | Yes | Local DuckDB/Postgres cache |
| `FILE` | Yes | Exported JSON file cache |
| `ETL` | Yes | macro_data_etl gold tables |
| `SNAPSHOT` | No | Committed build-time JSON |
| `ECON` | No | Deterministic econ model |
| `SIM` | No | Deterministic synthetic data |
| `LOADING` | - | Request in flight |
| `ERR` | - | Resolution failed |

### Fallback Chains

**Market data** (`src/lib/useMarket.ts` + `src/app/api/market/[view]/route.ts`):
```
LIVE (FastAPI) → DB (DuckDB/Postgres) → FILE (exported JSON) → SNAPSHOT (committed)
```

**Econ data** (`src/lib/useEcon.ts` + `src/app/api/econ/series/route.ts`):
```
FRED (live API) → SNAPSHOT (committed observations) → ETL (World Bank/BIS) → SIM (synthetic)
```

### Silent SIM Risk Points

These are the specific locations where SIM data can appear without clear user indication:

1. **`useMarketView` initial render** (`useMarket.ts:21`): Always renders SNAPSHOT synchronously before API resolves. If the API fails silently, user sees SNAPSHOT data with no error indication.

2. **`useLiveIndicators` fallback** (`useEcon.ts:155-162`): Returns `{}` on failure. Pages that merge live + SIM data (`effective()` in `economics/page.tsx:94-107`) fall back to SIM values per-indicator without flagging which ones are SIM.

3. **Per-indicator mixed sources** (`api/econ/indicators/route.ts:93-134`): Each of the ~40 indicators independently resolves FRED → SNAPSHOT → SIM. The page shows a single overall source badge, but individual rows may silently be SIM while others are FRED.

4. **`mergeSnapshotIndices` / `mergeLiveIndices`** (`data/markets.ts`): Command center indices merge live FRED data with snapshot data. Some indices may be live while others are snapshot/SIM, but only one badge is shown.

---

## 3. Proposed Test Suite

### 3A. Unit Tests — Data Provenance (`src/lib/provenance.test.ts`)

**Existing:** 5 tests for `classifyFreshness()`.

**Add these tests:**

```
TEST: PROVENANCE_META covers all ProvenanceSource values
  - Every key in the ProvenanceSource union has a corresponding PROVENANCE_META entry
  - Every entry has: label, live (boolean), tone, title

TEST: Live sources are correctly classified
  - FRED, LIVE, DB, FILE, ETL → live: true
  - SNAPSHOT, ECON, SIM → live: false

TEST: classifyFreshness edge cases
  - Future date → FRESH
  - Exactly at threshold boundary → correct bucket
  - Empty string → UNKNOWN
  - Invalid format "not-a-date" → UNKNOWN
```

### 3B. Unit Tests — Market Hook Source Resolution (`src/lib/useMarket.test.ts`)

```
TEST: fallbackSnapshot returns total snapshot by default
  - fallbackSnapshot("market", "total") === SNAPSHOTS.market

TEST: fallbackSnapshot returns price snapshot when basis is "price"
  - fallbackSnapshot("market", "price") === PRICE_SNAPSHOTS.market

TEST: fallbackSnapshot falls back to total when no price snapshot exists
  - For views not in PRICE_SNAPSHOTS (e.g. "rates"), returns SNAPSHOTS.rates

TEST: Source mapping from API response
  - { source: "LIVE" } → MarketSource "LIVE"
  - { source: "DB" } → MarketSource "DB"
  - { source: "FILE" } → MarketSource "FILE"
  - { source: "garbage" } → MarketSource "SNAPSHOT"
  - { source: undefined } → MarketSource "SNAPSHOT"
  - Missing source field → MarketSource "SNAPSHOT"
```

### 3C. Unit Tests — Econ Hook Source Resolution (`src/lib/useEcon.test.ts`)

```
TEST: mapSource correctly classifies
  - "FRED" → "FRED"
  - "SNAPSHOT" → "SNAPSHOT"
  - "ETL" → "ETL"
  - "SIM" → "SIM"
  - undefined → "SIM"
  - "UNKNOWN" → "SIM"
  - "" → "SIM"

TEST: Snapshot seeding
  - When econSnapshot has series data, hook pre-seeds with SNAPSHOT source
  - When econSnapshot is empty, hook falls back to SIM
```

### 3D. Unit Tests — API Route Source Resolution (`src/app/api/econ/indicators/route.test.ts`)

```
TEST: buildPoint computes change correctly for level series
  - value=100, prior=95 → change=5, changePct=5.26%

TEST: buildPoint computes change correctly for YoY series
  - CPI: value=4.17, prior=3.78 → change=0.4 (change in YoY rate)

TEST: buildPoint derives MoM from raw levels
  - rawValues last 2: [320, 325] → mom = pct(325, 320) = 1.56%

TEST: buildPoint derives YoY from raw levels for monthly series
  - 13 raw values → yoy = pct(last, 13th-from-last)

TEST: buildPoint returns null for MoM/QoQ/YoY when insufficient history

TEST: Per-indicator source independence
  - Simulate: FRED available for DGS10 but not CPIAUCSL
  - DGS10 returns source: "FRED", CPIAUCSL returns source: "SIM"
  - Overall source: "FRED" (because at least one is FRED)
```

### 3E. Unit Tests — Asset Quilt Returns (`src/app/asset-quilt/page.test.ts`)

```
TEST: quiltFromBilello returns full-year annual returns when no asof
  - SPY 2020 total_return matches snapshot value

TEST: quiltFromBilello filters years by asof
  - asof="2020-12-31" → only years 2016-2020

TEST: quiltFromBilello uses daily prices for intra-month dates
  - asof="2020-03-15" → 2020 SPY return differs from asof="2020-03-31"

TEST: quiltFromBilello falls back to monthly when no daily prices
  - Remove asset_daily_prices → uses asset_monthly_returns
  - asof="2020-06-30" compounds months 1-6

TEST: quiltFromBilello falls back to annual when no monthly/daily
  - Remove both → uses full-year total_return for all years

TEST: Daily price return calculation accuracy
  - returnFromDaily computes (end/base - 1) correctly
  - Handles missing prior-year-end price gracefully (returns null)
  - Handles series with no data in the target year (returns null)

TEST: Rankings re-sort correctly for partial years
  - Full year 2020 leader differs from Q1 2020 leader
```

### 3F. Unit Tests — Heatmap Horizon Returns (`src/data/markets.test.ts`)

```
TEST: horizonReturn extracts correct field per horizon
  - 1D → ret_1d, 1W → ret_5d, MTD → mtd, YTD → ytd
  - 1Y → ret_1y, 3Y → cagr_3y, 5Y → cagr_5y

TEST: isAnnualized returns true only for 3Y and 5Y

TEST: horizonDateRange formats correctly
  - 1D with asOf "2026-06-23" → "2026-06-20 → 2026-06-23"
  - YTD → "2025-12-31 → 2026-06-23"

TEST: heatmapFromCards uses ETF_SECTOR mapping
  - SPY → "Broad Mkt", XLK → "Technology"

TEST: heatmapFromCards uses ETF_WEIGHT for sizing
  - SPY weight > XLB weight

TEST: moversFromCards sorts gainers desc, losers asc
```

### 3G. Integration Tests — API Routes (`src/app/api/**/*.test.ts`)

```
TEST: GET /api/market/market returns valid response shape
  - Response has { data, source } keys
  - source is one of LIVE/DB/FILE/SNAPSHOT
  - data.cards is an array of SnapshotCard-shaped objects

TEST: GET /api/econ/series?id=DGS10 returns valid response
  - Response has { source, observations } keys
  - observations are { date, value } objects sorted ascending
  - Values are finite numbers

TEST: GET /api/econ/indicators returns all catalog indicators
  - Response has { source, indicators } keys
  - indicators.length === FRED_CATALOG.length
  - Every indicator has: id, value, prior, change, changePct, asOf, history, source

TEST: GET /api/econ/indicators source field is per-indicator
  - Each indicator.source is one of FRED/SNAPSHOT/SIM

TEST: Fallback to SNAPSHOT when API is unavailable
  - With no MARKET_PIPELINE_URL set, market routes return SNAPSHOT source
  - With no FRED_API_KEY set, econ routes return SNAPSHOT or SIM source
```

---

## 4. Smoke Tests (E2E via Playwright)

### 4A. Page Load Smoke Tests

Every page should load without console errors and render its primary content.

```
FOR EACH page in [
  "/", "/markets", "/market-snapshot", "/asset-quilt", "/index-returns",
  "/market-lens", "/market-chart", "/securities-lending",
  "/securities-lending/squeeze", "/prime-finance", "/collateral",
  "/cash-optimizer", "/reinvestment", "/liquidity", "/sources-uses",
  "/optimization", "/trading-desk", "/economics", "/economics/yield-curve",
  "/economics/inflation", "/economics/global-cpi", "/economics/global-policy",
  "/economics/credit", "/economics/rate-probabilities", "/economics/calendar",
  "/statistics", "/economics/regime", "/economics/ml",
  "/economics/sec-finance", "/economics/funding", "/economics/benchmark",
  "/economics/rate-analysis", "/economics/utilization",
  "/economics/yield-curve-analytics", "/economics/rate-vol",
  "/economics/funding-cost", "/macro-chart", "/economics/motion",
  "/news", "/sentiment", "/copilot", "/dataops", "/alerts"
]:
  TEST: {page} loads without JS errors
    - Navigate to page, wait for networkidle
    - No uncaught exceptions in console
    - Page title or code badge is visible
    - No "undefined" or "NaN" visible in primary content
```

### 4B. Provenance Badge Smoke Tests

```
TEST: Every page displays a data source indicator
  - Navigate to each page
  - Assert at least one of: ProvenanceBadge, SourceBadge, or source text
    (SIM/SNAPSHOT/FRED/LIVE/etc.) is visible in the page header or panel headers
  - Flag any page where source is unclear

TEST: Badge accurately reflects data tier
  - With no FRED_API_KEY and no MARKET_PIPELINE_URL:
    → All badges should show SNAPSHOT or SIM, never FRED or LIVE
  - With valid FRED_API_KEY:
    → Econ pages with live-eligible series should show FRED badge
    → Pages with only SIM data should still show SIM

TEST: STALE indicator appears for old snapshot data
  - ProvenanceBadge with asOf > 7 days ago shows "STALE · Nd" suffix
  - ProvenanceBadge with asOf < 1 day shows no suffix
```

### 4C. Data Interaction Smoke Tests

```
TEST: Asset quilt date picker updates returns
  - Load /asset-quilt
  - Note SPY return in last column
  - Set date to 6 months earlier
  - Assert last column SPY return changed
  - Assert KPI strip values updated (Leader, Dispersion, Years)

TEST: Asset quilt basis toggle updates returns
  - Load /asset-quilt on total basis
  - Note any cell return value
  - Switch to price basis
  - Assert the return value changed

TEST: Heatmap horizon toggle updates values
  - Load / (Command Center)
  - Note a heatmap cell value on 1D
  - Switch to YTD
  - Assert the cell value changed
  - Assert "ANNUALIZED" label appears on 3Y/5Y

TEST: Treemap hover tooltip shows data
  - Load / (Command Center)
  - Hover over a treemap cell
  - Assert tooltip appears with: ticker, sector, signed %, weight %

TEST: Economics indicator grid shows correct delta labels
  - Load /economics
  - Assert column headers include "Δ Prior" and "Δ% Prior"
  - Hover over CPI delta cell
  - Assert tooltip mentions "change in YoY rate"
```

---

## 5. Data Transparency Audit Tests

These tests specifically catch silent SIM data. They should run as part of CI.

### 5A. Badge Coverage Contract (`src/tests/badge-coverage.test.ts`)

```
TEST: Every page.tsx file imports ProvenanceBadge or SourceBadge or DataSourceStrip
  - Glob all src/app/**/page.tsx files
  - For each, check that the file either:
    a) imports ProvenanceBadge, SourceBadge, or DataSourceStrip, OR
    b) is listed in BADGE_EXEMPT_PAGES (pages that render badges via child components)
  - Fail on any unlisted page without a badge import

BADGE_EXEMPT_PAGES = [
  "macro-chart/page.tsx",     // badge rendered inside ChartStudio
  "market-chart/page.tsx",    // badge rendered inside ChartStudio
  "economics/motion/page.tsx", // badge rendered inside MotionStudio
  "market-lens/page.tsx",     // badge rendered inside lens components
]
```

### 5B. Source Propagation Contract (`src/tests/source-propagation.test.ts`)

```
TEST: useMarketView never returns "SIM" as source
  - The market hook only returns LIVE/DB/FILE/SNAPSHOT/LOADING
  - SIM is not in the market source vocabulary
  - (Market data is never simulated — it's snapshot or live)

TEST: useEconResource maps unknown sources to "SIM" not "SNAPSHOT"
  - If the API returns an unrecognized source string, it should map to SIM
  - This prevents unknown sources being silently labeled as SNAPSHOT

TEST: Overall source badge reflects worst-tier source in the mix
  - If 39 indicators are FRED and 1 is SIM, overall source should NOT be "FRED"
  - (Current behavior: overall IS "FRED" if any are — document this as known)
```

### 5C. Snapshot Staleness Contract (`src/tests/snapshot-staleness.test.ts`)

```
TEST: Committed market snapshots have asof dates
  - bilello.json has non-null asof field
  - market_snapshot.json cards have asof fields
  - index_returns.json has non-null asof

TEST: Committed econ snapshot has generatedAt
  - econSnapshot.json has non-null generatedAt
  - Each series entry has asOf date

TEST: Freshness badge triggers on stale data
  - classifyFreshness with date 30 days ago → "STALE"
  - ProvenanceBadge renders "STALE · 30d" text
```

### 5D. Mixed-Source Transparency (`src/tests/mixed-source.test.ts`)

```
TEST: Command center shows correct combined source
  - When FRED indices are live but market cards are SNAPSHOT:
    → Badge should show "FRED" (highest live tier present)
  - When no live data available:
    → Badge should show "SNAPSHOT" or "SIM"

TEST: Economics dashboard per-row source visibility
  - Each indicator row should have accessible source metadata
  - (Currently source is per-indicator in the API response but not shown per-row)
  - Recommendation: add per-row source dot or tooltip

TEST: Asset quilt shows source accurately with partial-year data
  - When using daily prices for partial year, source reflects the snapshot tier
  - When falling back to annual returns, source is still accurate
```

---

## 6. Pages Currently Missing Provenance Badges — COMPLETED

All pages now have provenance badges. Audit results:

| Page | Path | Status | Notes |
|------|------|--------|-------|
| DataOps | `/dataops` | **ADDED** | ProvenanceBadge showing LIVE/SIM based on health probe |
| Market Lens | `/market-lens` | **ADDED** | Replaced custom Tag with standard ProvenanceBadge |
| Statistics | `/economics/stats` | Already had badge | SourceBadge via useLiveSeriesSet |
| Credit Spreads | `/economics/credit` | Already had badge | SourceBadge with regime tag |
| Inflation Explorer | `/economics/inflation` | Already had badge | SourceBadge via useLiveSeriesSet |
| Global CPI | `/economics/global-cpi` | Already had badge | SourceBadge with country count |
| Global Policy | `/economics/policy-rates` | Already had badge | SourceBadge with ChartLink |
| Rate Probabilities | `/economics/rates` | Already had badge | SourceBadge via fedSource |
| Economic Calendar | `/economics/calendar` | Already had badge | SourceBadge via useEconCalendar |
| Sec-Finance Econ | `/economics/sec-finance` | Already had badge | SourceBadge via useLiveSeriesSet |
| Yield Curve | `/economics/yield-curve` | Already had badge | ProvenanceBadge via badgeSource |
| Squeeze Radar | `/securities-lending/squeeze` | Already had badge | ProvenanceBadge hardcoded SIM |

**Badge-exempt pages** (badges render inside child components):
- `/macro-chart` — badge rendered inside ChartStudio
- `/market-chart` — badge rendered inside ChartStudio
- `/economics/motion` — badge rendered inside MotionStudio

---

## 7. Recommended CI Pipeline

```yaml
test:
  steps:
    - npx vitest run                          # Unit tests
    - npx tsc --noEmit                        # Type check
    - npx vite build                          # Build check
    - npx playwright test tests/smoke/        # E2E smoke tests
    - npx vitest run tests/badge-coverage     # Badge audit
    - npx vitest run tests/source-propagation # Source contract
    - npx vitest run tests/snapshot-staleness  # Staleness contract
```

---

## 8. Key Risk: Silent SIM Data

### How It Happens Today

1. **Per-indicator fallback**: The `/api/econ/indicators` route resolves each of ~40 indicators independently. If FRED is down for one series, that one silently falls back to SIM while others show FRED. The page-level badge says "FRED" because at least one indicator resolved from FRED.

2. **Mixed market sources**: The command center merges FRED index data with pipeline snapshot data. The badge shows "FRED" even if the pipeline cards are stale snapshots.

3. **Initial render flash**: `useMarketView` renders committed SNAPSHOT data synchronously, then tries the API. If the API is slow or fails, the user sees SNAPSHOT data that may be days/weeks old with no staleness warning unless `asOf` is displayed.

### Recommended Mitigations

1. **Per-row source indicators**: Add a small colored dot to each indicator row and each index card showing its individual source (green=FRED/LIVE, blue=SNAPSHOT, amber=SIM).

2. **Worst-source badge**: Change the overall badge to show the lowest-tier source present, not the highest. If any data is SIM, the badge should indicate mixed sources.

3. **Staleness alerts**: When any displayed data has `asOf` older than 7 days, show a warning banner in the page header: "Some data is N days stale — run pipeline to refresh."

4. **Loading skeleton**: During the `LOADING` state, show a skeleton/shimmer instead of snapshot data to make the transition visible.
