# SFX Terminal — Securities Finance Intelligence Platform

A **Bloomberg-style operating system** for the securities finance business — unifying
**Securities Lending, Prime Finance, Collateral Optimization, Cash Optimization,
Sources & Uses Matching, Treasury Analytics, and AI-driven decision support** into a
single dense, keyboard-driven, multi-monitor terminal.

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
| `SLAB` | **Securities Lending** | Inventory (internal / beneficial owner / prime), loan book, borrow demand, HTB & specials, revenue analytics (waterfall, Sankey, by borrower/security/asset class) |
| `PB`   | **Prime Finance** | Gross/net/long/short exposure, top hedge-fund clients, financing revenue & RoA, VaR / stress testing, financing optimization opportunities |
| `COLL` | **Collateral Management** | IM/VM, excess/deficits, current vs optimized allocation, shadow prices, eligibility/concentration/haircut constraints, interactive what-if |
| `CASH` | **Cash Optimizer** | Treasury funding sources & uses, cheapest funding path, Sankey flow, LCR/NSFR, intraday liquidity stress |
| `SXU`  | **Sources & Uses** | Matching engine network graph, internalization opportunities, funding savings, allocation heat map |
| `OPT`  | **Optimization Center** | Flagship — solver runs (Gurobi / OR-Tools / Pyomo), objective/runtime/status/duals, before-after comparison, recommended trades |
| `DESK` | **Trading Desk** | Trader scorecards, execution analytics (slippage / VWAP / TWAP / fill rates), risk analytics, position concentration |
| `ECON` | **Macro Dashboard** | FRED-connected economic indicators grouped by category, surprise index, breadth, live series explorer |
| `CURV` | **Treasury Curve Lab** | Multi-snapshot curve overlay (today vs 1M/3M/6M/1Y/2Y/pre-hiking/GFC), level/slope/curvature, point-in-time scrubber, **user-selectable spread** (10Y-2Y default + 10Y-3M, 30Y-5Y, 10Y-1Y, 5Y-2Y, 2Y-3M, 30Y-10Y) driving the inversion timeline and full historical inversion → recession lead-time analysis |
| `INFL` | **Inflation Explorer** | CPI / Core CPI / PCE / Core PCE to item level — index reading, MoM %, YoY %, and ΔMoM/ΔYoY acceleration; contribution waterfall; CPI/PCE basket toggle; every item drills to 24m |
| `GCPI` | **Global Inflation** | CPI YoY/MoM by country with trend-vs-prior, consecutive-print streaks, vs-target, heat map |
| `GPOL` | **Global Policy Rates** | Central-bank rates, cycles, real rates, streaks and next meetings by country |
| `CRDT` | **Credit Spreads** | IG/HY OAS deep dive — credit curve by rating (drillable), 18y IG-vs-HY history with stress episodes, sector spreads, valuation percentiles, stress table, credit→sec-finance linkage |
| `FOMC` | **Rate Probabilities** | CME-FedWatch meeting hike/cut odds computed by the **`macro_data_etl` FedProbabilityEngine** (Fed Funds futures → day-weighted FOMC probabilities), **Policy Path Evolution** overlay (prior as-of dates showing how cuts have been re-priced), implied path, FOMC dot plot |
| `CAL`  | **Economic Calendar** | Release stream (FRED release dates) with importance/category filters and beat/miss vs consensus |
| `STAT` | **Statistical Analysis** | **Live FRED, up to 20y** — adjustable lookback (5/10/20Y/Max), transform (levels/Δ/YoY), Granger lag, rolling window & series selection; correlation matrix, **Granger causality** (F-test), OLS regression, ADF stationarity, rolling correlation, ACF, distributions & moments. Incrementally cached — changing settings recomputes locally, only older windows fetch a delta |
| `EML`  | **ML Applications** | Recession probit (AUC 0.89), inflation nowcast, rate-path BVAR+LSTM, regime HMM, feature importances, model registry |
| `SFE`  | **Sec-Finance Economics** | Differentiator — repo complex, rate sensitivities ("greeks for the book") with a Fed-cut scenario stepper, cash-collateral reinvestment ladder, macro→business linkage |
| `AI`   | **AI Copilot** | Built-in "Bloomberg GPT" — natural-language Q&A over every dataset, with narratives, tables, charts, and recommended actions |
| `ALRT` | **Alert Center** | Streaming risk & ops alerts with severity/category filters and a rules engine |

---

## Live economic data (FRED)

The **Economics & Macro** modules are wired to **FRED** (Federal Reserve Economic Data).
The connection is real but **optional and resilient**:

- **With a key** — set `FRED_API_KEY` in the environment. Server-side route handlers
  (`/api/econ/series`, `/api/econ/indicators`, `/api/econ/curve`, `/api/econ/calendar`) fetch
  live observations, all dashboard indicators (units-corrected), yield-curve tenors
  (`DGS1MO…DGS30`), and release dates from `api.stlouisfed.org` (cached 10 min). Panels show a
  green **LIVE · FRED** badge.
- **Without a key** — every module renders a **deterministic, seeded simulation** anchored
  to a plausible mid-2026 macro regime. Panels show an amber **SIM** badge. No setup, no
  hydration drift, fully functional offline.

Client hooks render the simulation instantly, then transparently upgrade to live FRED data
when the API reports it — so the UI never blocks or breaks.

```bash
# Get a free key: https://fred.stlouisfed.org/docs/api/api_key.html
FRED_API_KEY=your_key_here npm run dev
# On Vercel/Netlify: add FRED_API_KEY as a project environment variable.
```

### Data provenance — what's live vs. simulated

Live wiring is **deliberately partial** — some modules have no free upstream API, and the
analytics/model modules are computed layers. Honest per-module status:

| Module | Card values | Drill-down (24m) | Notes |
|--------|-------------|------------------|-------|
| Macro Dashboard | 🟢 Live (FRED, units-corrected) | 🟢 Live | `/api/econ/indicators` |
| Treasury Curve Lab | 🟢 Live (today's curve) | 🟢 Live tenors | history & inversions are curated/computed |
| Economic Calendar | 🟢 Live (FRED release dates) | — | `/api/econ/calendar` |
| Inflation Explorer | 🟢 Live (index → derived MoM/YoY/accel) | 🟢 Live | CPI/PCE component FRED ids; per-item fallback to sim |
| Global Inflation | 🟢 Live (most countries) | 🟢 Live | OECD-on-FRED CPI; per-country fallback to sim |
| Credit Spreads | 🟢 Live (rating curve + IG/HY) | 🟢 Live | ICE BofA OAS FRED ids are real |
| Statistical Analysis | 🟢 Live | — | up to 20y FRED history; customizable & incrementally cached |
| Sec-Finance Economics | 🟡 Partial live | 🟢 Live | SOFR/EFFR/IORB/RRP + Fed-funds backdrop live; GC/specials/sensitivities curated |
| Global Policy Rates | 🟡 Partial live | 🟡 Live (most) | FRED OECD/ECB central-bank-rate series where available |
| Rate Probabilities | 🔵 ETL (FedWatch) | — | `macro_data_etl` gold `fed_probabilities`; live CME with network, else deterministic fallback curve |
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
generators**, so all 22 modules run with **zero configuration** — no database, no required
keys — and stay reproducible across server/client renders. The only live integration is the
**optional** FRED connection (see above), which runs through serverless route handlers and
degrades gracefully to simulation when no key is present.

- **Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind CSS**
- **Zero-dependency SVG chart library** (sparklines, line/area, bars, candlesticks + VWAP,
  treemaps, Sankey, network graphs, revenue waterfalls, correlation matrices, donuts, gauges,
  heat grids, yield curves, scatter/regression plots)
- **AG-Grid-style sortable data grids** built from scratch for density and speed
- **Optional live data:** FRED via server-side route handlers (`FRED_API_KEY`)

**Production architecture** (what the demo simulates) — see `ARCHITECTURE.md`:
- Backend: **Python · FastAPI**, analytics in **Pandas / Polars / NumPy**
- Optimization: **OR-Tools · Gurobi · Pyomo**
- Streaming: **WebSockets · Kafka**; storage: **PostgreSQL · TimescaleDB**
- Auth: **SSO · Active Directory · RBAC**

---

## Run locally

The terminal is a standard Next.js app — **zero config, no database, no keys**.
All 22 modules (including Rate Probabilities, which renders the committed ETL
FedWatch snapshot) work fully offline.

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

## Deploy free

Module pages are statically prerendered and the FRED API routes are lightweight serverless
functions, so any free Next.js host works with **zero configuration** (the `FRED_API_KEY`
env var is optional — without it the econ modules use simulation):

- **Vercel (recommended):** import the repo → pick this branch → Deploy → get a `*.vercel.app`
  URL. Add `FRED_API_KEY` in project settings to enable live economic data.
- **Netlify / Cloudflare Pages:** same — build command `npm run build`

---

## Project layout

```
src/
├── app/                     # one route per module
│   ├── (HOME, markets, securities-lending, prime-finance, collateral, cash-optimizer,
│   │    sources-uses, optimization, trading-desk, copilot, alerts)
│   ├── economics/           # ECON + curve, inflation, global-cpi, policy-rates, credit,
│   │                         #   rates, calendar, stats, ml, sec-finance (+ shared drill layout)
│   └── api/econ/            # FRED route handlers (series, curve, calendar)
├── components/
│   ├── shell/               # command bar, sidebar, status bar, ticker, command palette
│   ├── ui/                  # Panel, Stat, Tag, DataGrid, PageHeader, KpiStrip
│   ├── econ/               # SourceBadge (LIVE/SIM provenance)
│   └── charts/              # SVG chart library (Sparkline, LineChart, CandleChart, Treemap,
│                            #   Sankey, NetworkGraph, Waterfall, Matrix, Radial, YieldCurve, ScatterPlot)
├── data/                    # deterministic domain generators (universe, markets, securitiesLending,
│                            #   primeFinance, collateral, cash, sourcesUses, optimization, trading,
│                            #   alerts, econSeries, econCurve, econRates, econModels, inflation,
│                            #   globalMacro, creditSpreads)
└── lib/                     # rng (seeded), format, hooks, nav, useEcon, server/fred.ts
```

---

*Unified Securities Finance Intelligence — Securities Lending · Prime Finance · Collateral &
Cash Optimization · Sources & Uses Matching · Treasury Analytics · AI decision support, in a
single Bloomberg-style operating system.*
