# SFX Terminal — Securities Finance Intelligence Platform

A **Bloomberg-style operating system** for the securities finance business — unifying
**Securities Lending, Prime Finance, Collateral Optimization, Cash Optimization,
Cash Collateral Reinvestment, Liquidity & Funding Stress, Sources & Uses Matching,
Treasury & Funding Analytics, Borrow-Demand / Squeeze Radar, Macro Regime Playbooks,
Market News, Investor Sentiment, DataOps/Lineage, and AI-driven decision support**
into a single dense, keyboard-driven, multi-monitor terminal — **37 modules** in all.

Built to look and feel like the software that runs a multi-trillion-dollar book at
State Street, Goldman Sachs, Morgan Stanley, J.P. Morgan, BNY Mellon, Citi, UBS, or
BlackRock.

> **Design language:** black canvas (`#0A0A0A`), amber command accent (`#FF8C00`),
> green / red P&L semantics, tabular numerics, minimal whitespace, real-time streaming feel.

---

## Modules

| Code | Module | What it does |
|------|--------|--------------|
| `HOME` | **Command Center** | Cross-desk KPIs, revenue, heat map, live alert stream, module launchpad |
| `MKT`  | **Live Markets** | Multi-asset monitor — equities, ETFs, fixed income, futures, FX, commodities, crypto, vol. Quotes grid, candlesticks + VWAP, order flow, treemap heat map, movers |
| `SNAP` | **Market Snapshot** | Cross-asset "state of the market" served by the **`market_data_pipeline`** (FRED · Yahoo · pluggable vendors): returns/drawdown table (1D…5Y CAGR, 52w distance), Treasury curve + 2s10s/3m10y, regime scores (risk-on/off · growth · inflation · liquidity), cross-asset dashboard, best/worst YTD |
| `QUILT` | **Asset Quilt** | Annual cross-asset return "quilt" — every asset class ranked by yearly total return, Bilello-style, with leaders/laggards and dispersion |
| `IRET` | **Index Return Analytics** | Monthly index return matrix, calendar-year totals, and intra-year drawdowns (Yahoo-ready via the `market_data_pipeline`) |
| `LENS` | **Market Lens Studio** | Build/compare market & cross-asset series from the lens engine (committed snapshots + FRED) |
| `MKC`  | **Market Chart Studio** | Charting studio over market series (`/api/chart/series?source=market`) |
| `SLAB` | **Securities Lending** | Inventory (internal / beneficial owner / prime), loan book, borrow demand, HTB & specials, revenue analytics (waterfall, Sankey, by borrower/security/asset class) |
| `SQZ`  | **Squeeze Radar** | Borrow-demand / squeeze radar on the lending spine — composite heat score, fee×utilization quadrant (re-rate vs special), squeeze candidates, specials watch, sector heat, ALRT-ready heat-up alerts |
| `PB`   | **Prime Finance** | Gross/net/long/short exposure, top hedge-fund clients, financing revenue & RoA, VaR / stress testing, financing optimization opportunities |
| `COLL` | **Collateral Management** | IM/VM, excess/deficits, current vs optimized allocation, shadow prices, eligibility/concentration/haircut constraints, interactive what-if |
| `CASH` | **Cash Optimizer** | Treasury funding sources & uses, cheapest funding path, Sankey flow, LCR/NSFR, intraday liquidity stress |
| `REINV` | **Cash Collateral Reinvestment** | Reinvestment ladder, spread carry, WAL/tenor buckets, liquidity buffers, policy-path sensitivity, and collateral cash deployment scenarios |
| `LIQ`  | **Liquidity & Funding Stress** | Funding ladder, stress outflows, liquidity survival horizon, desk exposure heat map, scenario console, and escalation signals |
| `SXU`  | **Sources & Uses** | Matching engine network graph, internalization opportunities, funding savings, allocation heat map |
| `OPT`  | **Optimization Center** | Flagship — solver runs (Gurobi / OR-Tools / Pyomo), objective/runtime/status/duals, before-after comparison, recommended trades |
| `DESK` | **Trading Desk** | Trader scorecards, execution analytics (slippage / VWAP / TWAP / fill rates), risk analytics, position concentration |
| `ECON` | **Macro Dashboard** | FRED-connected economic indicators grouped by category, surprise index, breadth, live series explorer |
| `MGC`  | **Macro Chart Studio** | Charting studio over the **104-series FRED catalog** — build/compare/transform any series (`/api/chart/series`) |
| `MOTN` | **Macro Motion Studio** | Animated macro-series motion / racing-series visualizations over the FRED catalog |
| `FUND` | **Funding & Liquidity** | The funding tape — overnight corridor (IORB/EFFR/OBFR/SOFR/BGCR/TGCR), liquidity balances (RRP/reserves/Fed B-S), T-bills, FX-basis, funding spreads (SOFR−EFFR, SOFR−IORB, GC−OIS, bill−OIS, FRA−OIS), and a 0–100 quarter-end **funding-stress gauge** |
| `CURV` | **Treasury Curve Lab** | Multi-snapshot curve overlay (today vs 1M/3M/6M/1Y/2Y/pre-hiking/GFC), level/slope/curvature, point-in-time scrubber, **user-selectable spread** (10Y-2Y default + 10Y-3M, 30Y-5Y, 10Y-1Y, 5Y-2Y, 2Y-3M, 30Y-10Y), inversion → recession lead-time analysis, and term funding carry |
| `INFL` | **Inflation Explorer** | CPI / Core CPI / PCE / Core PCE to item level — index reading, MoM %, YoY %, and ΔMoM/ΔYoY acceleration; contribution waterfall; CPI/PCE basket toggle; every item drills to 24m |
| `GCPI` | **Global Inflation** | CPI YoY/MoM by country with trend-vs-prior, consecutive-print streaks, vs-target, heat map |
| `GPOL` | **Global Policy Rates** | Central-bank rates, cycles, real rates, streaks and next meetings by country |
| `CRDT` | **Credit Spreads** | IG/HY OAS deep dive — credit curve by rating (drillable), 18y IG-vs-HY history with stress episodes, sector spreads, valuation percentiles, stress table, collateral haircut impact, counterparty stress overlay, credit substitutions, and credit→sec-finance linkage |
| `FOMC` | **Rate Probabilities** | CME-FedWatch meeting hike/cut odds computed by the **`macro_data_etl` FedProbabilityEngine** (Fed Funds futures → day-weighted FOMC probabilities), **Policy Path Evolution** overlay, implied path, FOMC dot plot, and policy-path transmission into REINV/CASH/COLL/OPT |
| `CAL`  | **Economic Calendar** | Release stream (FRED release dates) with importance/category filters, beat/miss vs consensus, downstream desk sensitivity tags, and pre/post release factor-move summaries |
| `STAT` | **Statistical Analysis** | **Live FRED, up to 20y** — adjustable lookback (5/10/20Y/Max), transform (levels/Δ/YoY), Granger lag, rolling window & series selection; correlation matrix, **Granger causality** (F-test), OLS regression, ADF stationarity, rolling correlation, ACF, distributions & moments, plus desk-ready study packs |
| `REGIME` | **Macro Regime Playbook** | Macro regime scoring across growth, inflation, liquidity, credit, and policy factors; playbook actions for collateral, reinvestment, lending, optimization, and funding desks |
| `EML`  | **ML Applications** | Recession probit (AUC 0.89), inflation nowcast, rate-path BVAR+LSTM, regime HMM, feature importances, model registry |
| `SFE`  | **Sec-Finance Economics** | Differentiator — repo complex, rate sensitivities ("greeks for the book") with a Fed-cut scenario stepper, cash-collateral reinvestment ladder, macro factor links, P&L bridge, shared scenario library, and macro→business linkage |
| `NEWS` | **News & Signal Intel** | Market news + social + signal engine — headline tape, narrative monitor, social intelligence, market-impact, attention heatmap, event clusters, and a signal engine. Live via a provider chain (Alpha Vantage → Marketaux → Finnhub → NewsAPI) + Reddit/StockTwits social, with optional FinBERT NLP |
| `SENT` | **Investor Sentiment** | Survey + social fear/greed & positioning — AAII bull/bear, NAAIM exposure, an explainable 0–100 Sentiment Index, contrarian signals + historical analogs, survey-vs-social divergence, and a per-ticker drill cross-linked to `SQZ`. VIX component live via FRED |
| `AI`   | **AI Copilot** | Built-in "Bloomberg GPT" — natural-language Q&A over every dataset, with narratives, tables, charts, and recommended actions |
| `DATAOPS` | **Data Ops** | Provider health, data lineage, SLA/quality scores, freshness monitoring, fallback status, and scaling hooks for FRED, Yahoo, `macro_data_etl`, `news_nlp`, and future licensed feeds |
| `ALRT` | **Alert Center** | Streaming risk & ops alerts with severity/category filters and a rules engine |

---

## Live economic data (FRED)

The **Economics & Macro** modules are wired to **FRED** (Federal Reserve Economic Data).
The connection is real but **optional and resilient**:

- **With a key** — set `FRED_API_KEY` in the environment. Server-side route handlers
  (`/api/econ/series`, `/api/econ/batch`, `/api/econ/indicators`, `/api/econ/curve`,
  `/api/econ/calendar`) fetch live observations from a **104-series FRED catalog** — all
  dashboard indicators (units-corrected), yield-curve tenors (`DGS1MO…DGS30`), the **funding
  complex** (`IORB/EFFR/OBFR/SOFR/BGCR/TGCR/RRPONTSYD/WRESBAL/WALCL/DTB3…`), and release dates
  from `api.stlouisfed.org` (cached 10 min). Panels show a green **LIVE · FRED** badge.
- **Without a key** — every module renders a **deterministic, seeded simulation** anchored
  to a plausible mid-2026 macro regime. Panels show an amber **SIM** badge. No setup, no
  hydration drift, fully functional offline.

Client hooks render the simulation instantly, then transparently upgrade to live FRED data
when the API reports it — so the UI never blocks or breaks.

**Data as-of dates.** Rates/macro modules show a **`DATA AS OF <date>`** pill in the header
so freshness is never ambiguous. The **Treasury Curve Lab** assembles **real point-in-time
curves** — it pulls each tenor's full daily history (`DGS1MO…DGS30`) from FRED via
`/api/econ/curve-history`, then builds the curve as-of Today and 1M/3M/6M/1Y/2Y ago from the
actual observations (the point-in-time scrubber shows each curve's real `AS OF` date). The
deep reference curves (Pre-Hiking 2021, GFC 2009), inversion history and term carry remain
curated. That history fetch is cached for 6h (FRED serves decades of daily data directly, so
no slow accumulation is needed — it's fetched once and reused). The **Macro Dashboard** shows
the most recent observation date across its live indicators, and **Rate Probabilities** shows
the Fed-funds-futures pricing date the FedWatch odds were derived from. Without a key, the
pills reflect the simulation's anchor dates alongside the amber `SIM` badge.

```bash
# Get a free key: https://fred.stlouisfed.org/docs/api/api_key.html
FRED_API_KEY=your_key_here npm run dev
# On Vercel/Netlify: add FRED_API_KEY as a project environment variable.
```

### AI Copilot (optional Claude integration)

The **AI Copilot** (`AI`) answers natural-language questions over the securities-finance
desks, and is **optional and resilient** the same way:

- **With a key** — set `ANTHROPIC_API_KEY`. The `/api/copilot` route hands Claude
  (`claude-opus-4-8`) a factual snapshot of the live desk data (securities-lending revenue,
  borrower/security rankings, collateral savings, funding costs, internalization, hard-to-borrow)
  and Claude answers **from those figures only**. Answers carry a green **Claude** badge; the
  charts and tables are still computed deterministically from the real desk data.
- **Without a key** — the Copilot falls back to its **deterministic keyword engine** over the
  same datasets (amber **Local engine** badge). Fully functional offline.

```bash
ANTHROPIC_API_KEY=your_key_here npm run dev
# On Vercel/Netlify: add ANTHROPIC_API_KEY as a project environment variable.
```

**Daily refresh (Vercel Cron).** FRED data is fetched on-access and cached (curve history 6h,
indicators 10 min), so a busy site is always fresh — but to guarantee the curve/rates refresh
**once a day even with no traffic**, `vercel.json` registers a cron that hits
`/api/cron/refresh` daily at 12:00 UTC. That endpoint re-pulls and re-warms the FRED-backed
econ routes (`curve-history`, `curve`, `indicators`, `calendar`) plus the market-data bridge
routes (`/api/market/*`). If `MARKET_PIPELINE_URL` is configured, cron first POSTs to the
pipeline's `/ingestion/run` endpoint with a recent start date so Yahoo-backed market data
refreshes once per day without repeatedly backfilling full history. Tune that window with
`MARKET_CRON_LOOKBACK_DAYS` (default 14), pin it with `MARKET_CRON_START_DATE`, or disable
the ingestion POST with `MARKET_CRON_INGESTION=0`. Historical Treasury yields are immutable,
so each refresh only advances the recent tail. Set a **`CRON_SECRET`** project env var to
lock the endpoint down — Vercel sends it as a Bearer token and the route rejects any request
without it (returns the warm summary on success).

### Data provenance — what's live vs. simulated

Live wiring is **deliberately partial** — some modules have no free upstream API, and the
analytics/model modules are computed layers. Honest per-module status:

| Module | Card values | Drill-down (24m) | Notes |
|--------|-------------|------------------|-------|
| Macro Dashboard | 🟢 Live (FRED, units-corrected) | 🟢 Live | `/api/econ/indicators` |
| Treasury Curve Lab | 🟢 Live (today + point-in-time) | 🟢 Live tenors | real curves as-of Today/1M/3M/6M/1Y/2Y from FRED daily history (`/api/econ/curve-history`); **inversions live-detected** for every spread from real daily history + USREC (`/api/econ/inversions`); deep reference curves (2021/2009) & term carry curated |
| Economic Calendar | 🟢 Live (FRED release dates) | — | `/api/econ/calendar`; release sensitivities and factor moves are computed |
| Inflation Explorer | 🟢 Live (index → derived MoM/YoY/accel) | 🟢 Live | CPI/PCE component FRED ids; per-item fallback to sim |
| Global Inflation | 🟢 Live (most countries) | 🟢 Live | OECD-on-FRED CPI; per-country fallback to sim |
| Credit Spreads | 🟢 Live (rating curve + IG/HY) | 🟢 Live | ICE BofA OAS FRED ids are real; haircut, counterparty, and substitution analytics are computed |
| Statistical Analysis | 🟢 Live | — | up to 20y FRED history; customizable, incrementally cached, and packaged into desk studies |
| Macro Regime Playbook | 🟡 Partial live/sim | — | FRED/Yahoo/local factor playbook; deterministic factors until pipeline-backed |
| Sec-Finance Economics | 🟡 Partial live | 🟢 Live | SOFR/EFFR/IORB/RRP + Fed-funds backdrop live; GC/specials/sensitivities, P&L bridge, and scenario library curated |
| Funding & Liquidity | 🟢 Live (12/16 FRED) | 🟢 Live | corridor/balances/bills live via `/api/econ/batch` (incl. WRESBAL $B→$T scaling); FX-basis & FRA-OIS are SIM pending a BIS feed; stress gauge derived |
| Squeeze Radar | 🔴 Sim (lending spine) | — | utilization/fee from the lending book + synthesized SI/DTC/fee-momentum/skew; needs a securities-finance / short-interest vendor feed |
| News & Signal Intel | 🟡 Provider chain | — | tape, narratives, attention (4 dims) and signals recompute from the live headlines (Alpha Vantage→Marketaux→Finnhub→NewsAPI); **event clusters use FinBERT transformer clusters** via `news_nlp` when wired (keyword clustering otherwise). Market Impact stays a labelled historical model |
| Investor Sentiment | 🟡 Partial live | — | VIX live (FRED `VIXCLS`); social chain wired; AAII/NAAIM survey ingest needed |
| Cash Collateral Reinvestment | 🟡 Partial live/sim | — | FRED/Yahoo-ready local model for SOFR/EFFR/Fed-path-driven reinvestment scenarios |
| Liquidity & Funding Stress | 🔴 Sim / local model | — | stress ladder and signal console designed for FRED/Yahoo/local-book inputs |
| Global Policy Rates | 🟡 Partial live | 🟡 Live (most) | FRED OECD/ECB central-bank-rate series where available |
| Rate Probabilities | 🔵 ETL (FedWatch) | — | `macro_data_etl` gold `fed_probabilities`; live CME with network, else deterministic fallback curve |
| Data Ops | 🟡 Ops metadata | — | local provider health/lineage snapshot designed for `market_data_pipeline` manifests and quality tables |
| ML Applications | 🔴 Sim / model | — | model outputs, not a feed |

🟢 fully live with a key · 🔵 fed by the `macro_data_etl` pipeline · 🔴 simulation/model. The live modules batch-fetch raw index/OAS
series via `/api/econ/batch` and derive the displayed metrics (MoM/YoY/acceleration, streaks,
1d/1m changes) client-side, falling back to the simulation per-series when a FRED id is missing
or no key is set. Every drillable card also calls `/api/econ/series` for its 24-month history —
both flagged by the LIVE/SIM badge.
The **FRED units correction** (`resolveFred`) maps each series to the right transform
(CPI → YoY `pc1`, retail → MoM `pch`, payrolls → `chg`, OAS/spreads → bps ×100, Fed B/S → $T).

> FRED does not send CORS headers, so it is only ever called server-side from the route
> handlers — the key is never exposed to the browser.

### Roadmap implementation update

The `roadmap_feature_implementation` branch expanded the terminal from 22 to 26
modules and added the first collateral-adjacent macro workflow layer:

- **#5 — Cash Collateral Reinvestment (`REINV`)**: reinvestment ladder, spread carry,
  WAL/tenor buckets, policy-path sensitivity, and liquidity buffer analytics.
- **#6 — Liquidity & Funding Stress (`LIQ`)**: stress ladder, desk funding heat map,
  survival horizon, liquidity signals, and scenario console.
- **#9 — Macro Regime Playbook (`REGIME`)**: growth/inflation/liquidity/credit/policy
  regime scoring with desk actions for collateral, reinvestment, lending, and funding.
- **#10 — Data Ops (`DATAOPS`)**: provider health, freshness, quality, lineage, SLA,
  and fallback status for FRED/Yahoo/local sources.
- **Economic & Macro enhancements**: `src/data/econEnhancements.ts` now feeds the
  enhanced SFE, STAT, CRDT, CURV/FOMC, and CAL experiences with shared scenario,
  sensitivity, study-pack, and desk-impact data.

These additions are intentionally adapter-ready: they run locally with deterministic
fixtures today, can use free **FRED** and **Yahoo Finance/yfinance** style inputs, and
can later scale to licensed feeds, internal books, optimizer outputs, and the
`market_data_pipeline` quality/lineage tables without changing the terminal UX.

**Since then** the terminal has grown to **37 modules**, adding the charting studios
(`MGC`/`MOTN`/`LENS`/`MKC`), **Funding & Liquidity (`FUND`)** and **Squeeze Radar
(`SQZ`)**, and the **News (`NEWS`)** + **Investor Sentiment (`SENT`)** intelligence
layer — backed by an expanded **104-series FRED catalog**, a news provider chain
(Alpha Vantage / Marketaux / Finnhub / NewsAPI), Reddit/StockTwits social, and the
**`news_nlp`** FinBERT NLP stage. See `docs/PLATFORM_DATA_CONNECTIVITY.md` for the
full live-vs-simulated map.

---

## Global macro pipeline (`macro_data_etl`)

The **Rate Probabilities** module is fed by a companion **Python ETL** (in the
`rl_hub` repo under `/macro_data_etl`) that ingests global macro data from free
public sources and lands it through a raw → bronze → silver → gold medallion
architecture:

- **World Bank** — Global Inflation (CPI YoY by country)
- **BIS** — `WS_CBPOL` central-bank policy rates
- **IMF** — DataMapper fallback for gaps
- **CME** — 30-Day Fed Funds futures → **FOMC hike/cut probabilities** via a
  `FedProbabilityEngine` that replicates the CME FedWatch day-weighting
  methodology (with the standard next-month switchover for late-month meetings)

The ETL exports its gold tables to JSON (`macro-etl export`); a snapshot lives in
`src/data/etl/` and is imported at build time, so the terminal renders it with
**zero configuration and no hydration drift**. Panels show a blue **ETL · MACRO**
badge. CME blocks non-browser clients, so when the engine can't reach live
settlements it uses a deterministic fallback futures curve (flagged in the
tooltip) — run `macro-etl run --source all && macro-etl fedwatch` with network
access to refresh with live values. The shapes are identical, so no terminal
code changes when the data goes live.

```bash
# in the rl_hub repo
cd macro_data_etl && pip install -e .
macro-etl run --source all          # World Bank + BIS → gold
macro-etl fedwatch                  # CME futures → FOMC probabilities
macro-etl export fed_probabilities  # JSON for the terminal
```

---

## Market data pipeline (`market_data_pipeline`)

The **Market Snapshot** / **Live Markets** / **Asset Quilt** / **Index Returns**
market surfaces are served by a second Python service (in
this repo under `/market_data_pipeline`): a production market + macro pipeline
that ingests **FRED** (official macro) and **Yahoo/yfinance** (prototype-grade
market, replaceable vendor interface), lands a raw → bronze → silver → gold
medallion warehouse (DuckDB + Parquet, Polars transforms), validates it, and
serves terminal "cards" over **FastAPI**.

The pipeline's gold views are exported to JSON and committed under
`src/data/market/`, imported at build time so the module renders with **zero
config**. At runtime, `/api/market/[view]` resolves the data from the first
configured source — so the terminal can read a **local cached database or file**
instead of (or before) calling the FastAPI service:

| Priority | Env var | Source | Badge |
|----------|---------|--------|-------|
| 1 | `MARKET_DB_URL` | local **DuckDB file** (`/path/market.duckdb`) or **Postgres** (`postgres://…`) — reads the `analytics_api_views` table | `LIVE · DB` |
| 2 | `MARKET_DATA_DIR` | directory of **exported view JSON** (`mdp export-views`) read fresh per request | `LIVE · FILE` |
| 3 | `MARKET_PIPELINE_URL` | the running **FastAPI service** | `LIVE · PIPELINE` |
| 4 | *(none)* | committed build-time **snapshot** | `PIPELINE · SNAPSHOT` |

Each source degrades gracefully to the next (a missing file, an unreachable
service, or an absent DB driver just falls through), so the module always
renders — on Vercel included. The DB drivers are loaded lazily at runtime, so:
- **Postgres** (`pg`) ships as an `optionalDependency` — pure JS, no build cost,
  the realistic cloud/Vercel `MARKET_DB_URL` target.
- **DuckDB** (`duckdb`) is a *native* build, deliberately **kept out of the
  default install** so cloud builds stay fast. For the local DuckDB-file path,
  install it yourself once: `npm i duckdb`.

```bash
# in this repo
python -m pip install polars duckdb pyarrow httpx tenacity pydantic pydantic-settings pyyaml fastapi "uvicorn[standard]" apscheduler structlog
PYTHONPATH=$PWD python -m market_data_pipeline.cli run --offline   # synthetic, no keys/network
FRED_API_KEY=… PYTHONPATH=$PWD python -m market_data_pipeline.cli run   # live FRED + Yahoo

# (a) read a local DuckDB cache file — no service needed:
MARKET_DB_URL=$PWD/data/market.duckdb npm run dev      # (npm i duckdb once)

# (b) read a local exported-file cache — no driver needed:
python -m market_data_pipeline.cli export-views --out ./data/export
MARKET_DATA_DIR=$PWD/market_data_pipeline/data/export npm run dev

# (c) stream live from the FastAPI service:
python -m market_data_pipeline.cli serve --port 8000
MARKET_PIPELINE_URL=http://localhost:8000 npm run dev
```

**Vercel/Postgres live-ish setup.** The cloud path is `MARKET_DB_URL=postgres://...`.
The Next app reads Postgres directly, while the Python pipeline publishes the six
compact terminal views into the `analytics_api_views` table after each refresh.

1. Create a managed Postgres database (Vercel Postgres, Neon, Supabase, etc.).
2. Add `MARKET_DB_URL=postgres://...` to Vercel project env vars.
3. Add GitHub repo secrets `MARKET_DB_URL` and optional `FRED_API_KEY`.
4. Use the included `.github/workflows/market-data-refresh.yml` workflow to run
   daily after the US close. It refreshes DuckDB from Yahoo/FRED, then runs
   `publish-views` to upsert Postgres.

Manual publish flow:

```bash
python -m pip install "psycopg[binary]" yfinance
START_DATE=$(python -c "from datetime import date,timedelta; print(date.today()-timedelta(days=14))")
PYTHONPATH=$PWD python -m market_data_pipeline.cli run --start "$START_DATE"
MARKET_DB_URL=postgres://... PYTHONPATH=$PWD python -m market_data_pipeline.cli publish-views
```

The publisher creates `analytics_api_views` if it does not exist. Once populated,
`/api/market/market` should return `"source":"DB"` from Vercel. Return-bearing
views default to **total return** (`adj_close`) and also publish **price return**
variants (`?basis=price`) from raw close. The app exposes that switch on Market
Snapshot, Live Markets, Asset Quilt, and Index Returns.

**Does running locally refresh the cache from Yahoo?** Yes. `mdp run` (without
`--offline`, `MDP_ALLOW_YAHOO=1` by default) pulls **~10y of daily history per
symbol from Yahoo** — using the `yfinance` library if installed
(`pip install -e ".[yahoo]"`), otherwise the public Yahoo chart endpoint — and
**upserts it into the DuckDB**, rebuilds the analytics, and re-materializes the
`analytics_api_views` table the terminal reads. FRED macro refreshes the same
way when `FRED_API_KEY` is set. For a continuous refresh on a cadence run
`mdp schedule` (market-close · macro-daily · controlled intraday). Yahoo is
unofficial/best-effort and may rate-limit; the scheduled market jobs request only a recent
tail (`MDP_MARKET_REFRESH_LOOKBACK_DAYS`, default 14) and use the configured throttle
(`yahoo_rate_limit`, default 1 request/sec). If a pull returns nothing the
pipeline falls back to the deterministic synthetic source for that run (recorded
in `ingestion_manifest.response_status`) so the cache never ends up empty.

See `market_data_pipeline/README.md` for the full architecture, the 13-table
schema (incl. the `analytics_api_views` serving table), the endpoint list, and
`docs/example_payloads.json`.

---

## News, social & NLP (`NEWS` · `SENT`)

The **News & Signal Intelligence** and **Investor Sentiment** modules render from a
deterministic engine and upgrade to live feeds — same provenance-first contract as
the rest of the terminal.

**Headlines** — `/api/news` tries a **provider chain** and returns the first that
yields data, else SIM. Set any one key:

```bash
ALPHAVANTAGE_API_KEY=…   # Alpha Vantage NEWS_SENTIMENT (sentiment + tickers) — primary
MARKETAUX_API_KEY=…      # Marketaux /news/all (entity sentiment)
FINNHUB_API_KEY=…        # Finnhub /news
NEWSAPI_API_KEY=…        # NewsAPI.org /top-headlines
```

With a key the **headline tape, narrative monitor, attention heatmap, and header
KPIs recompute from the live tape**; the badge shows the provider name.

**Social** — `/api/social` aggregates Reddit + StockTwits into the social view
(NEWS-3) and feeds SENT:

```bash
REDDIT_USER_AGENT="your-app/1.0"   # enables Reddit (Reddit mandates a UA)
STOCKTWITS_ENABLED=1               # or STOCKTWITS_ACCESS_TOKEN=…
```

**NLP layering (sentiment).** Resolved best → fallback, each flipping the badge:
**provider-native** (Alpha Vantage / Marketaux) → **FinBERT** (the `news_nlp`
service via `NEWS_NLP_URL`) → **in-house heuristic** (a negation-aware finance
lexicon, `src/lib/server/sentimentNlp.ts`) → **SIM**.

```bash
# scaffolded Python stage — FinBERT sentiment + spaCy NER + event clustering
cd news_nlp && pip install -e ".[nlp]" && python -m spacy download en_core_web_sm
news-nlp serve --port 8088          # POST /score · GET /headlines · /health
NEWS_NLP_URL=http://localhost:8088 npm run dev   # → /api/news re-scores with FinBERT
```

The `news_nlp` package installs/imports on a lexicon fallback without the model
stack and surfaces in **DATAOPS** under the `NEWS_NLP` provider. See
`news_nlp/README.md` and `docs/PLATFORM_DATA_CONNECTIVITY.md` for the full
data-connectivity map across all 37 modules.

---

## Keyboard workflow

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` or `/` | Open the command line — type a mnemonic (`SLAB`, `PB`, `OPT`…) or a ticker (`NVDA`, `GME`) |
| `Alt + 1…0` | Jump straight to a module |
| `↑ ↓` then `↵` | Navigate / open command-line results |
| Column headers | Click to sort any grid |

---

## Tech stack

**This build** is fully client-rendered Next.js over **deterministic, seeded data
generators**, so all 37 modules run with **zero configuration** — no database, no required
keys — and stay reproducible across server/client renders. Optional live integrations include
FRED for economics (104-series catalog), the committed/exported `macro_data_etl` FedWatch
snapshot, the pluggable FRED/Yahoo-backed `market_data_pipeline`, a news provider chain
(Alpha Vantage / Marketaux / Finnhub / NewsAPI) + Reddit/StockTwits social, and the `news_nlp`
FinBERT stage — each degrading gracefully to local snapshots or simulation when no
key/service is present.

- **Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind CSS**
- **Zero-dependency SVG chart library** (sparklines, line/area, bars, candlesticks + VWAP,
  treemaps, Sankey, network graphs, revenue waterfalls, correlation matrices, donuts, gauges,
  heat grids, yield curves, scatter/regression plots)
- **AG-Grid-style sortable data grids** built from scratch for density and speed
- **Optional live data:** FRED via server-side route handlers (`FRED_API_KEY`) and
  `market_data_pipeline` via `MARKET_PIPELINE_URL` for FRED/Yahoo-backed market cards

**Production architecture** (what the demo simulates) — see `ARCHITECTURE.md`:
- Backend: **Python · FastAPI**, analytics in **Pandas / Polars / NumPy**
- Optimization: **OR-Tools · Gurobi · Pyomo**
- Streaming: **WebSockets · Kafka**; storage: **PostgreSQL · TimescaleDB**
- Auth: **SSO · Active Directory · RBAC**

---

## Run locally

The terminal is a standard Next.js app — **zero config, no database, no keys**.
All 37 modules (including Rate Probabilities, which renders the committed ETL
FedWatch snapshot, and the news/sentiment modules backed by deterministic local
fixtures) work fully offline.

```bash
npm install                 # first time only
npm run dev                 # → http://localhost:3000
```

Requirements: **Node 18+**.

Production build:

```bash
npm run build && npm start  # → http://localhost:3000
```

**Optional — live FRED data.** Set `FRED_API_KEY` and the economics modules
switch from amber `SIM` to green `LIVE · FRED`; without it they use the
deterministic simulation:

```bash
FRED_API_KEY=your_key_here npm run dev
# free key: https://fred.stlouisfed.org/docs/api/api_key.html
```

### Optional — refresh the macro pipeline

You **do not** need this to run the terminal; the gold JSON is already committed
under `src/data/etl/`. Run the Python ETL only to regenerate the global-macro /
FedWatch data. It is fully decoupled (Node terminal ↔ Python batch job; the only
link is the JSON in `src/data/etl/`).

```bash
cd macro_data_etl
pip install -e .                                          # polars, duckdb, httpx, typer…
macro-etl run --source all                                # World Bank + BIS → gold
macro-etl fedwatch                                        # CME futures → FOMC probabilities
macro-etl export fed_probabilities --out ../src/data/etl  # write JSON the terminal reads
pytest                                                    # 22 tests, no network needed
```

Requirements: **Python 3.11+**. On a networked machine World Bank and BIS return
live data; CME blocks non-browser clients, so FedWatch falls back to a
deterministic futures curve (flagged in the page tooltip). Refresh the browser
after exporting.

## Deploy

This is a **Vite + React SPA** with Web-standard `/api/*` route handlers (not a Next.js app).
The handlers must be served by a runtime — a static-only host serves the SPA but no API, so
every module falls back to committed snapshots/simulation. Two supported paths:

- **Vercel:** the committed `vercel.json` sets `framework: vite`, builds with
  `npm run build:vercel`, and routes `/api/*` to the `api/[...path].ts` serverless function
  (which mounts the same route registry). Import the repo → Deploy. Set `FRED_API_KEY` for live
  economics and `MARKET_PIPELINE_URL` (preferred over a direct `MARKET_DB_URL` on serverless)
  for live markets; set `CRON_SECRET` to lock the daily refresh cron. **Make sure the project's
  Framework Preset is _Vite_ (or "Other"), not Next.js.**
- **Node process host (Render / Railway / Fly.io / VM):** `npm run build` then `npm start` runs
  the standalone server in `src/server/index.ts`, serving `dist/` and `/api/*` from one process.
  Drive the daily refresh with an external scheduler hitting `/api/cron/refresh`.

Without `FRED_API_KEY` the econ modules use simulation; without a market source the market
modules serve the committed snapshot. Internal-book modules (lending, prime, collateral, cash,
…) are seeded fixtures in every environment.

---

## Project layout

```
src/
├── app/                     # one route per module
│   ├── (HOME, markets, securities-lending [+ /squeeze], prime-finance, collateral,
│   │    cash-optimizer, reinvestment, liquidity, sources-uses, optimization, trading-desk,
│   │    market-snapshot, market-lens, market-chart, macro-chart, news, sentiment,
│   │    dataops, copilot, alerts)
│   ├── economics/           # ECON + curve, inflation, global-cpi, policy-rates, credit,
│   │                         #   rates, calendar, stats, regime, ml, sec-finance, funding, motion
│   └── api/                 # FRED econ handlers, market pipeline proxy, news + social feeds
│       ├── econ/            # series, batch, indicators, curve, calendar, stats, inversions
│       ├── market/[view]/   # committed snapshot or live FastAPI market-data view
│       ├── chart/series/    # unified econ/market chart resolver
│       ├── news/            # provider-chain headlines (+ optional FinBERT enrichment)
│       └── social/          # Reddit + StockTwits aggregate
├── components/
│   ├── shell/               # command bar, sidebar, status bar, ticker, command palette
│   ├── ui/                  # Panel, Stat, Tag, DataGrid, PageHeader, KpiStrip, ProvenanceBadge
│   ├── econ/               # SourceBadge (LIVE/SIM provenance)
│   └── charts/              # SVG chart library (Sparkline, LineChart, CandleChart, Treemap,
│                            #   Sankey, NetworkGraph, Waterfall, Matrix, Radial, YieldCurve, ScatterPlot)
├── data/                    # deterministic domain generators (universe, markets, securitiesLending,
│                            #   squeeze, primeFinance, collateral, cash, sourcesUses, optimization,
│                            #   trading, alerts, econSeries [104-series FRED catalog], econCurve,
│                            #   econRates, econModels, inflation, globalMacro, creditSpreads,
│                            #   reinvestment, liquidity, macroRegime, funding, news, sentiment,
│                            #   dataOps, econEnhancements)
└── lib/                     # rng (seeded), format, hooks, nav, useEcon, useNews, useSocial,
                             #   server/fred.ts, server/newsProviders.ts, server/socialProviders.ts,
                             #   server/sentimentNlp.ts (heuristic + FinBERT enrichment)

news_nlp/                    # Python FinBERT NLP stage (sentiment · NER · event clustering)
```

---

*Unified Securities Finance Intelligence — Securities Lending · Prime Finance · Collateral &
Cash Optimization · Sources & Uses Matching · Treasury Analytics · AI decision support, in a
single Bloomberg-style operating system.*
