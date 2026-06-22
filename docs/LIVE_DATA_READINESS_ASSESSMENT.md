# Live Data Readiness Assessment

Audit date: 2026-06-22. Scope: Next.js terminal, market data pipeline, macro ETL, DataOps, Market Lens Studio, news NLP, and supporting static data.

## Executive verdict

The terminal is **not yet an institutional live-data platform**. It is a strong terminal prototype with partial live upgrade paths. The only consistently live-capable foundations are: FRED-backed economics APIs when `FRED_API_KEY` is present; market pipeline views when `MARKET_DB_URL`, `MARKET_DATA_DIR`, or `MARKET_PIPELINE_URL` are configured; and optional news/NLP services when provider keys or `NEWS_NLP_URL` are configured. Most securities-finance, optimization, cash, prime, collateral, liquidity, alerting, sentiment, and copilot workflows are deterministic fixtures generated from seeded local functions.

The primary risk is **false-live perception**: global chrome says `LIVE`, DataOps fixtures report providers as live, and some modules label generated values as `FRED`, `YAHOO`, `LOCAL`, or `LIVE` without verifying an upstream observation at render time.

## Evidence-driven architecture facts

- Navigation exposes 37 terminal routes/modules across markets, financing, optimization, economics, and intelligence. The route list is driven by `NAV`, not by provider readiness. `NAV` includes live-market labels as product language rather than proof of live connectivity.
- DataOps has two incompatible truths: fixture functions hardcode optimistic provider health and runs, while `/api/dataops/health` probes actual environment wiring.
- Market data has a credible four-step serving chain: DB, exported files, FastAPI, committed snapshots. This is the best live-readiness pattern in the codebase.
- Economics APIs follow an “always 200” pattern and fall back to simulated histories if FRED is unavailable or per-series fetches fail.
- Macro ETL ships committed JSON exports and has CME/IMF fallback logic; CME FedWatch can be deterministic when public CME access fails.
- News and social intelligence are explicitly deterministic unless external keys/services are configured.
- Internal books are not connected. Securities lending, prime finance, collateral, cash, reinvestment, liquidity, sources/uses, and most optimization outputs are seeded generated data.

## Repository discovery inventory

### Frontend modules and data origins

| Code | Route | Actual data origin | Endpoint/path | Live coverage | Simulation/staleness risk |
|---|---|---|---|---:|---|
| HOME | `/` | Aggregates local data modules and snapshots | local imports/API hooks | 20% | High: broad KPI surface from fixture domains |
| MKT | `/markets` | Market pipeline API chain | `/api/market/market` | 60% if configured; 0% otherwise | Committed 2026-06-17 snapshot fallback |
| SNAP | `/market-snapshot` | Market pipeline snapshots | `/api/market/market`, cross-asset | 60% if configured | Snapshot fallback can look current |
| QUILT | `/asset-quilt` | Market pipeline Bilello/quilt JSON/API | `/api/market/bilello` | 60% if configured | Snapshot fallback |
| IRET | `/index-returns` | Market pipeline index returns | `/api/market/index-returns` | 60% if configured | Snapshot fallback |
| LENS | `/market-lens` | Optional Market Lens backend else embedded config/snapshot | `/api/market-lens` | 35% | Snapshot fallback flagged, but analysis can appear live |
| MKC | `/market-chart` | Chart API from catalog/econ/market histories | `/api/chart/series` | 45% | Synthetic chart histories when source is synthetic |
| SLAB | `/securities-lending` | Seeded domain generator | local `src/data/securitiesLending.ts` | 0% | Appears like loan/inventory book |
| SQZ | `/securities-lending/squeeze` | Seeded squeeze board | local `src/data/squeeze.ts` | 0% | Page labels SIM, but metrics look operational |
| PB | `/prime-finance` | Seeded hedge-fund/client exposures | local `src/data/primeFinance.ts` | 0% | High false-live risk |
| COLL | `/collateral` | Seeded margin/collateral book | local `src/data/collateral.ts` | 0% | High false-live risk |
| CASH | `/cash-optimizer` | Seeded treasury sources/uses | local `src/data/cash.ts` | 0% | High false-live risk |
| REINV | `/reinvestment` | Seeded reinvestment portfolio | local `src/data/reinvestment.ts` | 0% | High false-live risk |
| LIQ | `/liquidity` | Seeded liquidity ladder + partly macro labels | local `src/data/liquidity.ts` | 5% | Local/funding data are generated |
| SXU | `/sources-uses` | Seeded matching engine | local `src/data/sourcesUses.ts` | 0% | All matching is simulated |
| OPT | `/optimization` | Seeded solver runs/trades | local `src/data/optimization.ts` | 0% | No real solver persistence observed |
| DESK | `/trading-desk` | Local trading scorecards | local data | 10% | Mostly fixture analytics |
| ECON | `/economics` | FRED API overlay on simulated fallback | `/api/econ/indicators`, local histories | 55% with key | History panel explicitly SIM |
| CURV | `/economics/curve` | FRED curve API else simulated curve | `/api/econ/curve`, `/curve-history` | 60% with key | Fallback silent at endpoint level except source field |
| INFL | `/economics/inflation` | Local econ series + market inflation snapshot | local/API | 45% | Mixed static/sim/live |
| GCPI | `/economics/global-cpi` | Committed macro ETL JSON | `src/data/etl/*` | 20% | ETL JSON is cached snapshot |
| GPOL | `/economics/policy-rates` | Committed macro ETL JSON | `policy_rate_timeseries.json` | 20% | Cached/demo risk |
| CRDT | `/economics/credit` | FRED spreads if available + fallback constants | FRED/local | 55% | Fallback values used per series |
| FOMC | `/economics/rates` | Macro ETL Fed probabilities or deterministic fallback | `fed_probabilities.json`, CME ETL | 25% | CME fallback explicitly deterministic |
| CAL | `/economics/calendar` | FRED release/calendar approximation else SIM | `/api/econ/calendar` | 30% | No authoritative calendar provider |
| STAT | `/economics/stats` | FRED/SIM histories, client-side stats | `/api/econ/stats` | 50% | Computation OK; source mixed |
| REGIME | `/economics/regime` | Static regime model factors | local `macroRegime.ts` | 15% | Factors labelled FRED/YAHOO/LOCAL but values are hardcoded |
| EML | `/economics/ml` | Deterministic model outputs | local `econModels.ts` | 10% | ML outputs are not trained/live scored |
| SFE | `/economics/sec-finance` | Macro-to-sec-finance local model | local/API | 20% | Desk impacts simulated |
| FUND | `/economics/funding` | Macro funding indicators + local desk data | local/API | 30% | Actual funding books absent |
| MGC/MOTN | chart/motion routes | Econ/market chart series | `/api/chart/series`, econ batch | 45% | Depends on upstream source per series |
| NEWS | `/news` | Optional providers else deterministic engine | `/api/news` | 20% | Page states SIM by default |
| SENT | `/sentiment` | Deterministic survey/social + possible VIX/FRED | `/api/social`, FRED | 15% | AAII/NAAIM/social are simulated |
| AI | `/copilot` | Optional LLM over local context else keyword fallback | `/api/copilot` | 15% | Responses can summarize fixture data |
| DATAOPS | `/dataops` | Health probe + generated fixture runs/coverage | `/api/dataops/*`, `dataOps.ts` | 30% | Fixture lineage is not source of truth |
| ALRT | `/alerts` | Seeded templates + sentiment-derived alerts | local `alerts.ts` | 0% | Operational alerts are simulated |

### Backend/API inventory

| API/service | Purpose | Upstreams | Refresh/update behavior | Readiness |
|---|---|---|---|---|
| `/api/market/[view]` | Serves market snapshots/views | DB, exported files, FastAPI, committed JSON | Request-time lookup; no scheduler in Next route | Best pattern; production-ready shape, source-dependent |
| `/api/econ/*` | FRED-backed economics series, curve, indicators, stats, calendar | FRED if key, local simulated histories otherwise | Request-time fetch/cache behavior in server FRED library | Useful but fallback transparency must be stricter |
| `/api/dataops/health` | Actual runtime provider probe | env vars, service health URLs | Request-time probes | Good operational truth source |
| `/api/dataops/runs` | Lineage/runs | fixture data + optional manifests | mostly fixture | Not authoritative |
| `/api/news` | News provider chain + NLP | Alpha Vantage/Marketaux/Finnhub/NewsAPI/NLP optional | Request-time | Not production until keys/feed SLAs exist |
| `/api/social` | Social sentiment | none currently; SIM engine | Always 200 SIM in route | Not live |
| `/api/market-lens` | Market Lens backend proxy | `MARKET_LENS_URL` else snapshots | Request-time | Partial |
| `/api/chart/*` | Chart templates and series | local catalog/econ/market | Request-time | Partial |
| `market_data_pipeline` | Ingest FRED/Yahoo, quality, DuckDB, Parquet, API | FRED, Yahoo, Synthetic | scheduler jobs exist for daily/intraday | Solid prototype; live depends on env and running service |
| `macro_data_etl` | Macro ETL/gold exports | World Bank/BIS/IMF/CME/FRED-style catalog | CLI/pipeline, no verified running scheduler | Partial; committed snapshots stale risk |
| `news_nlp` | FinBERT/lexicon NLP service | transformer model, heuristics | service/CLI | Optional; fallback is lexicon/SIM |
| `market_lens_studio` | Analytics API/orchestrator | cached DuckDB/Yahoo/FRED adapters | service-driven | Partial; frontend falls back to snapshots |

### Data layer inventory

| Layer | Files/tables | Source | Freshness status |
|---|---|---|---|
| Committed market JSON | `src/data/market/*.json` | exported market pipeline views | mostly `2026-06-17`/`2026-06-18`; snapshot fallback |
| Committed macro ETL JSON | `src/data/etl/*.json` | macro ETL gold exports | mixed; inflation/policy time series begin in 2024, Fed probs as of `2026-06-18` |
| Static TS data modules | `src/data/*.ts` | seeded generators/static arrays | deterministic, not live |
| Market pipeline storage | DuckDB/parquet/archive modules | runtime pipeline output | credible but not guaranteed present |
| Macro ETL raw/bronze/silver/gold | `.gitkeep` dirs + loader code | runtime ETL output | directories empty in repo |
| News NLP storage | app settings/storage modules | runtime service | no committed live corpus |

## Provider inventory and DataOps audit

| Provider | Type | Live? | Connected? | Used? | Coverage | Last usage | Refresh | Fallback | Production ready? |
|---|---|---|---|---|---:|---|---|---|---|
| FRED | Official macro API | Conditional | `FRED_API_KEY` | Yes, econ APIs | Medium-high | request-time | API/cache | SIM histories | Partial |
| Yahoo | Unofficial market data | Conditional | market pipeline service/DB/export | Yes, market views | Medium | committed snapshots `2026-06-17` | scheduler exists in Python | synthetic/snapshot | Not institutional |
| CME | Fed Funds futures | Weak/conditional | macro ETL connector | FOMC probabilities | Low | committed `2026-06-18` | ETL | deterministic futures curve | No |
| World Bank/BIS/IMF | Macro/country | Partial | macro ETL connectors | global CPI/policy | Low-medium | committed JSON | ETL | IMF fallback | Partial |
| News providers | Alpha Vantage/Marketaux/Finnhub/NewsAPI | Conditional | env keys only | News route | Low | request-time if configured | request-time | deterministic news | No |
| Social providers | Reddit/StockTwits/X concept | Mostly no | route returns SIM | Sentiment/social | Very low | n/a | n/a | SIM | No |
| NEWS_NLP | NLP service | Conditional | `NEWS_NLP_URL` | News/copilot | Low-medium | request-time if configured | service | lexicon/SIM | Partial |
| Local/Internal books | Custody/loan/margin/treasury | No | none | Financing/optimization modules | 0 | n/a | n/a | seeded fixtures | No |
| Synthetic | deterministic generator | Yes as fallback only | always | everywhere | 100 as fallback | deterministic | n/a | n/a | Useful, but must never count as live |

## Lineage map by domain

```text
FRED_API_KEY -> src/lib/server/fred.ts -> /api/econ/* -> hooks/useEcon + economics pages -> SourceBadge/FRED or SIM
Yahoo/FRED -> market_data_pipeline ingestion -> DuckDB/parquet/exported JSON/FastAPI -> /api/market/[view] -> market pages
World Bank/BIS/IMF/CME -> macro_data_etl pipeline -> src/data/etl/*.json -> global CPI/policy/FOMC pages
NEWS provider keys -> src/lib/server/newsProviders.ts -> /api/news -> news page -> optional NEWS_NLP scoring
NEWS_NLP_URL -> news_nlp service -> /api/news or sentiment scoring -> news/copy layers
Seeded TS generators -> page imports -> UI tables/cards -> no storage, no upstream, no true as-of
DataOps fixtures -> src/data/dataOps.ts -> /api/dataops/runs/page -> apparent lineage, but not authoritative
```

## Freshness audit

- Market JSON snapshots expose `asof` and currently indicate `2026-06-17` or `2026-06-18`. This is acceptable as a cache label, but not proof that a scheduler is running today.
- FRED economics pages can expose `DATA AS OF` from actual observations, but the fallback histories also produce dates and can be mistaken for real observations.
- Macro ETL pages expose `as_of` for Fed probabilities, but global time-series JSON does not carry a top-level processing timestamp.
- Seeded internal-book modules generally do not expose a real data observation date. Alerts use fixed generated timestamps around 2026-06-17 and should not be treated as live ops.
- DataOps fixture run timestamps are hardcoded around 2026-06-18; they are not evidence of actual runs.

## Data quality audit

Critical patterns:

1. **Always-200 fallback** keeps the UI resilient but can hide upstream failure unless every component displays source and fallback status prominently.
2. **Provider health fixtures** overstate live readiness and conflict with the real `/api/dataops/health` probe.
3. **Synthetic marked as LIVE** in DataOps can corrupt governance metrics. Synthetic should be `AVAILABLE` or `FALLBACK`, never `LIVE`.
4. **Per-series fallback** in economics can mix FRED and SIM in the same module; aggregate module-level badges are insufficient.
5. **Internal books absent** means finance modules have no reconciliation, no lineage, no permissions model, no controls, no QA rules, and no authoritative as-of.
6. **Unverified vendor SLAs**: Yahoo is useful for prototypes but not a production market-data source for institutional terminal workflows.

## Module-by-module readiness scoring

| Module | Purpose | Actual sources | Live % | Sim % | Readiness | Confidence | Lineage | Freshness | Transparency | Tech debt | Critical findings | Actions |
|---|---|---|---:|---:|---:|---:|---|---|---|---|---|---|
| HOME | Cross-terminal KPIs | mixed local + snapshots | 20 | 80 | 25 | 75 | D | D | C | D | Aggregates fixture-heavy modules | Critical: mark domains by source |
| MKT | Multi-asset monitor | market API chain | 60/0 | 40/100 | 55 | 85 | B | B/C | B | B | Good resolver, snapshot fallback | High: require env health in UI |
| SNAP | Cross-asset snapshot | market snapshots | 60/0 | 40/100 | 55 | 85 | B | B/C | B | B | same as MKT | High: source badges per card |
| QUILT | Asset-class returns | market Bilello | 60/0 | 40/100 | 55 | 80 | B | B/C | B | B | static if no pipeline | High |
| IRET | index returns | market JSON/API | 60/0 | 40/100 | 55 | 80 | B | B/C | B | B | static if no pipeline | High |
| LENS | analytics workspace | Lens backend or snapshots | 35 | 65 | 45 | 70 | C | C | B | C | backend optional | High: persist provenance per result |
| MKC | market charting | chart series API | 45 | 55 | 45 | 70 | C | C | C | C | synthetic histories possible | Medium |
| SLAB | lending inventory/book | seeded generator | 0 | 100 | 10 | 95 | F | F | C | F | no loan/custody data | Critical: integrate lending book |
| SQZ | squeeze radar | seeded generator | 0 | 100 | 10 | 95 | F | F | B | F | short interest/borrow fees absent | Critical: vendor feeds |
| PB | prime finance | seeded generator | 0 | 100 | 10 | 95 | F | F | D | F | no client/exposure feed | Critical |
| COLL | collateral | seeded generator | 0 | 100 | 10 | 95 | F | F | D | F | no margin/eligibility schedules | Critical |
| CASH | funding optimization | seeded generator | 0 | 100 | 10 | 95 | F | F | D | F | no treasury/cash ledger | Critical |
| REINV | cash collateral portfolio | seeded generator | 0 | 100 | 10 | 95 | F | F | D | F | no reinvestment book | Critical |
| LIQ | liquidity stress | seeded + labels | 5 | 95 | 15 | 90 | F | F | D | F | local funding generated | Critical |
| SXU | source/use matching | seeded generator | 0 | 100 | 10 | 95 | F | F | D | F | no optimization input feeds | Critical |
| OPT | solver run center | seeded solver runs | 0 | 100 | 10 | 95 | F | F | D | F | no solver/run artifact store | Critical |
| DESK | desk analytics | local generated | 10 | 90 | 20 | 85 | D | D | C | D | lacks execution/order feeds | High |
| ECON | macro dashboard | FRED + SIM overlay | 55 | 45 | 60 | 85 | B | B | B | C | mixed live/sim histories | High: per-metric provenance |
| CURV | yield curve | FRED + SIM | 60 | 40 | 65 | 85 | B | B | B | B | good fallback disclosure | Medium |
| INFL | inflation | FRED/static histories | 45 | 55 | 50 | 75 | C | C | C | C | item-level likely simulated | High |
| GCPI | global CPI | macro ETL JSON | 20 | 80 | 35 | 80 | C | D | C | C | cached snapshots only | High |
| GPOL | policy rates | macro ETL JSON | 20 | 80 | 35 | 80 | C | D | C | C | cached snapshots only | High |
| CRDT | credit spreads | FRED + fallbacks | 55 | 45 | 55 | 80 | B | B/C | C | C | fallback constants | High |
| FOMC | Fed probabilities | CME ETL JSON/fallback | 25 | 75 | 35 | 80 | C | C | C | D | CME fallback deterministic | Critical: real FedWatch/feed |
| CAL | economic calendar | FRED approximation/SIM | 30 | 70 | 35 | 75 | C | C | C | C | no calendar provider | High |
| STAT | statistics | FRED/SIM series | 50 | 50 | 55 | 80 | B | B/C | C | C | source mixing affects stats | High |
| REGIME | macro regime | hardcoded/static | 15 | 85 | 25 | 90 | D | F | D | D | labeled sources not actual fetches | Critical |
| EML | ML apps | deterministic outputs | 10 | 90 | 20 | 85 | D | F | D | D | no model registry/scoring data | Critical |
| SFE | sec-fin macro | macro + generated desk links | 20 | 80 | 25 | 80 | D | D | C | D | desk impacts simulated | High |
| FUND | funding/liquidity macro | mixed macro/local | 30 | 70 | 35 | 75 | C | C | C | D | internal funding absent | High |
| MGC/MOTN | macro chart/motion | econ series | 45 | 55 | 45 | 75 | C | C | C | C | chart provenance per series needed | Medium |
| NEWS | news intelligence | provider chain or SIM | 20 | 80 | 30 | 85 | D | D | B | C | default deterministic | Critical: ingest real feeds |
| SENT | sentiment | deterministic + FRED VIX possible | 15 | 85 | 25 | 85 | D | D | B | D | AAII/NAAIM/social absent | Critical |
| AI | copilot | optional LLM + local context | 15 | 85 | 30 | 80 | D | D | C | C | can reason over fake data | Critical: source-aware RAG guardrails |
| DATAOPS | governance console | probe + fixtures | 30 | 70 | 35 | 90 | D | D | C | D | fixture lineage misleading | Critical: replace fixtures with manifests |
| ALRT | alerts | seeded templates | 0 | 100 | 10 | 95 | F | F | D | F | not connected to event bus | Critical |

## Live vs simulation master matrix

| Module class | Live | Partial | Simulated | Unknown | Estimated live |
|---|---:|---:|---:|---:|---:|
| Market pipeline modules | 0 | 5 | 0 | 0 | 60% when configured, else 0% |
| Economics/FRED modules | 0 | 11 | 0 | 0 | 45-60% when key configured |
| Macro ETL modules | 0 | 3 | 0 | 0 | 20-30% from cached exports |
| Financing/internal-book modules | 0 | 0 | 8 | 0 | 0-5% |
| Intelligence modules | 0 | 4 | 1 | 0 | 0-30% depending on env |
| DataOps | 0 | 1 | 0 | 0 | 30% |

## Readiness heatmap

| Module group | Data availability | Data quality | Freshness | Lineage | Observability | Production readiness |
|---|---:|---:|---:|---:|---:|---:|
| Market views | 70 | 65 | 60 | 75 | 60 | 55 |
| FRED economics | 70 | 70 | 70 | 70 | 55 | 60 |
| Macro ETL global/FOMC | 45 | 55 | 35 | 55 | 40 | 35 |
| Market Lens | 45 | 50 | 45 | 50 | 45 | 45 |
| News/NLP/social | 30 | 35 | 30 | 35 | 35 | 30 |
| Securities lending/PB/collateral/cash/liquidity | 10 | 20 | 5 | 10 | 15 | 10 |
| Optimization/alerts/copilot | 15 | 25 | 10 | 20 | 20 | 20 |
| DataOps governance | 35 | 30 | 25 | 25 | 45 | 35 |

## Provider coverage gap analysis

| Missing provider/feed | Blocks modules | Business impact | Complexity | Data quality lift |
|---|---|---|---|---|
| Internal stock loan book + inventory/custody | SLAB, SQZ, SXU, OPT | Very high | High | Very high |
| Borrow fee/utilization/vendor lending data (DataLend/IHS/EquiLend/Markit) | SLAB, SQZ | Very high | High | Very high |
| Short interest/exchange/FINRA | SQZ, SENT | High | Medium | High |
| Prime brokerage client/exposure/margin systems | PB, LIQ, CASH | Very high | High | Very high |
| Collateral eligibility, margin, triparty/custody feeds | COLL, LIQ, OPT | Very high | High | Very high |
| Treasury cash ledger/payment/settlement systems | CASH, LIQ, SXU | Very high | High | Very high |
| OCC/DTCC/NSCC/FICC settlement and margin data | COLL, CASH, LIQ | High | High | High |
| Repo market feed (BGC/ICAP/Bloomberg/Refinitiv/internal) | CASH, REINV, FUND | High | Medium-high | High |
| Fed/Treasury official liquidity series | FUND, LIQ, ECON | Medium | Low | Medium |
| CME official/licensed FedWatch/futures settlement | FOMC | Medium | Medium | High |
| Institutional market data (Bloomberg/Refinitiv/FactSet/Polygon/Tiingo) | MKT/SNAP/CHART | High | Medium | High |
| Economic calendar provider | CAL | Medium | Low-medium | High |
| AAII/NAAIM official survey feeds | SENT | Medium | Low-medium | High |
| Reddit/StockTwits/X licensed APIs | NEWS/SENT/SQZ | Medium | Medium | Medium-high |
| SEC EDGAR filing feed | NEWS/AI/REGIME | Medium | Medium | Medium |
| Model registry/training feature store | EML/AI | High | High | High |
| Solver artifact/run database | OPT | High | Medium | High |
| Alert/event bus | ALRT | High | Medium | High |
| Provider manifest registry | DATAOPS/all | Very high | Medium | Very high |
| Entitlements/audit logs | all production modules | Very high | High | Very high |

## False-live detection report

| Severity | Surface | Why it appears live | Reality | Fix |
|---:|---|---|---|---|
| 10 | Sidebar/status chrome | Displays `LIVE`/feed-live language | Status can be unrelated to module data lineage | Gate global live claim on provider manifests |
| 10 | DataOps provider fixtures | `getProviderHealth()` hardcodes FRED/MACRO_ETL as LIVE and synthetic as LIVE | `/api/dataops/health` may say SIM/CACHED | Remove fixture truth from production page |
| 10 | Internal-book modules | Tables show borrowers, margin, cash, alerts, optimization runs | Seeded `Rng` generators | Add `SIMULATED BOOK` watermark and block production use |
| 9 | Macro regime | Factors labelled FRED/YAHOO/LOCAL | Values are static arrays | Pull factors from source APIs or relabel simulated |
| 9 | EML | Model outputs labelled LIVE in data constants | No model scoring pipeline | Add model registry and input lineage |
| 8 | Market modules | Pipeline source badge can show SNAPSHOT/FILE/DB but users may interpret as live | Committed snapshots are stale caches | Add cache age and refresh manifest |
| 8 | FOMC | Rate probabilities show as-of | CME fallback can be deterministic | Show CME vs fallback per meeting |
| 8 | Copilot | Natural language responses sound authoritative | Context may be generated | Require source disclosures in every answer |
| 7 | Sentiment | Survey/social charts have recent dates | Deterministic weekly anchor | Label each component SIM unless real feed |
| 7 | Alerts | Streaming risk/ops alerts with timestamps | Seeded templates | Disable “streaming” language without event bus |

## Unused/wired-but-unused infrastructure

- `market_data_pipeline` includes storage, scheduler, quality, and FastAPI services; the Next app only consumes it when env vars/service are configured and otherwise uses committed JSON.
- `macro_data_etl` includes connectors and medallion directories, but repo data directories are placeholders and frontend mainly consumes committed JSON exports.
- `market_lens_studio` includes rich analytics APIs/orchestrator; frontend falls back to embedded snapshots when `MARKET_LENS_URL` is absent.
- `news_nlp` can run FinBERT/lexicon services; default terminal behavior is heuristic/SIM without `NEWS_NLP_URL` or feed keys.
- Optional DB drivers are partial: `pg` is optional dependency; DuckDB is dynamically required but not declared in `package.json`, so DuckDB runtime path may silently fall through.
- DataOps lineage/run tables exist as fixture generators; they should become consumers of real pipeline manifests.

Potential value is high for market pipeline, macro ETL, Market Lens, and news NLP because they already define service contracts. Value is low for DataOps fixtures until replaced by real manifests.

## Prioritization ranking

Priority score = Business Value × Data Availability × Implementation Ease. Scores are relative 0-100.

| Rank | Module/provider work | Score | Reason |
|---:|---|---:|---|
| 1 | Replace DataOps fixtures with real manifests and health truth | 92 | Foundational governance, medium effort |
| 2 | Harden FRED economics provenance per metric | 86 | High availability, low-medium effort |
| 3 | Operationalize market pipeline deployment/export freshness | 84 | Existing architecture, high product value |
| 4 | Add market cache age/as-of manifest to all market views | 80 | Low effort, high trust gain |
| 5 | Connect official economic calendar | 74 | High UX value, tractable |
| 6 | Wire AAII/NAAIM feeds | 70 | Improves sentiment with modest effort |
| 7 | Run NEWS_NLP service + one real news provider | 68 | Converts NEWS from demo to partial live |
| 8 | Add CME/Fed funds futures robust feed | 65 | Fixes FOMC credibility |
| 9 | Build internal book ingestion contract/schema | 64 | Huge value, higher complexity |
| 10 | Solver artifact store for OPT | 60 | Needed before optimization features |
| 11 | Collateral/margin feed integration | 58 | High complexity, high value |
| 12 | Securities lending inventory/loan feed | 57 | High complexity, high value |
| 13 | Treasury cash ledger integration | 55 | High complexity, high value |
| 14 | Alert event bus and rules provenance | 52 | Medium complexity |
| 15 | Copilot source-aware guardrails | 50 | Prevents misinformation |

## Modules that should not receive new features yet

SLAB, SQZ, PB, COLL, CASH, REINV, LIQ, SXU, OPT, REGIME, EML, NEWS, SENT, AI, DATAOPS, and ALRT should not receive new functional features until source lineage, freshness, and simulation labeling are fixed.

## Modules ready for cautious expansion

MKT, SNAP, QUILT, IRET, ECON, CURV, STAT, and chart studios are ready for limited expansion only if every enhancement preserves source fields, observation dates, cache age, and fallback disclosure.

## Recommended 90-day plan

### Phase 1: Governance truth and visible provenance (Days 1-30)

- Replace DataOps fixture health/runs/lineage with real manifests from market pipeline, macro ETL, FRED API cache, news NLP, and provider probes.
- Change synthetic provider status from `LIVE` to `FALLBACK_AVAILABLE` everywhere.
- Add module-level and row-level provenance contract: source, provider, observation date, processing timestamp, cache timestamp, fallback reason, and simulation flag.
- Add UI watermarks for simulated internal-book modules.
- Add tests that fail when a page renders operational terms without a provenance badge.

### Phase 2: Make the existing live paths production-grade (Days 31-60)

- Deploy or document market pipeline as required service; automate `mdp export-views` and publish freshness manifests.
- Harden FRED fetch/cache/error semantics and expose per-series fallback.
- Add official economic calendar provider.
- Replace CME deterministic fallback with licensed/robust futures settlement ingestion or clearly demote FOMC to simulation.
- Run NEWS_NLP and one real news provider in a controlled environment; log feed freshness and model version.

### Phase 3: Start internal-book integration before new features (Days 61-90)

- Define canonical schemas for stock loan inventory, loan book, borrow requests, prime exposures, margin calls, collateral assets, cash sources/uses, and liquidity ladders.
- Implement ingestion stubs that fail closed instead of silently generating data.
- Create reconciliation and quality checks: row counts, totals vs GL/books, stale thresholds, null limits, duplicate keys, and entitlement checks.
- Convert SLAB/PB/COLL/CASH/LIQ/SXU/OPT from seeded generators to adapter interfaces with explicit SIM mode.
- Add alert event bus backed by real quality/provider/business-rule events.

## Final conclusion

The codebase is closest to production readiness in market snapshots and FRED economics because those domains have real source adapters, explicit API boundaries, snapshots, and fallback labels. The codebase is furthest from readiness in securities finance and optimization, where UI sophistication masks the absence of upstream internal books and vendor feeds. Before any new features, the team should make DataOps authoritative, make simulation impossible to confuse with live data, and convert seeded internal-book domains into source-backed ingestion contracts.
