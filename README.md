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
| `CURV` | **Treasury Curve Lab** | Multi-snapshot curve overlay (today vs 1M/3M/6M/1Y/2Y/pre-hiking/GFC), level/slope/curvature, point-in-time scrubber, 2s10s inversion timeline, full historical inversion → recession lead-time analysis |
| `FOMC` | **Rate Probabilities** | CME-FedWatch-style meeting hike/cut odds, implied policy path, FOMC dot plot |
| `CAL`  | **Economic Calendar** | Release stream (FRED release dates) with importance/category filters and beat/miss vs consensus |
| `STAT` | **Statistical Analysis** | Correlation matrix, interactive OLS regression, change distributions / z-scores, regime map |
| `EML`  | **ML Applications** | Recession probit (AUC 0.89), inflation nowcast, rate-path BVAR+LSTM, regime HMM, feature importances, model registry |
| `SFE`  | **Sec-Finance Economics** | Differentiator — repo complex, rate sensitivities ("greeks for the book") with a Fed-cut scenario stepper, cash-collateral reinvestment ladder, macro→business linkage |
| `AI`   | **AI Copilot** | Built-in "Bloomberg GPT" — natural-language Q&A over every dataset, with narratives, tables, charts, and recommended actions |
| `ALRT` | **Alert Center** | Streaming risk & ops alerts with severity/category filters and a rules engine |

---

## Live economic data (FRED)

The **Economics & Macro** modules are wired to **FRED** (Federal Reserve Economic Data).
The connection is real but **optional and resilient**:

- **With a key** — set `FRED_API_KEY` in the environment. Server-side route handlers
  (`/api/econ/series`, `/api/econ/curve`, `/api/econ/calendar`) fetch live observations,
  yield-curve tenors (`DGS1MO…DGS30`), and release dates from `api.stlouisfed.org`
  (cached 10 min). Panels show a green **LIVE · FRED** badge.
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

> FRED does not send CORS headers, so it is only ever called server-side from the route
> handlers — the key is never exposed to the browser.

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
generators**, so all 18 modules run with **zero configuration** — no database, no required
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

```bash
npm install
npm run dev      # http://localhost:3000
```

Production build:

```bash
npm run build && npm start
```

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
│   ├── economics/           # ECON + curve, rates, calendar, stats, ml, sec-finance
│   └── api/econ/            # FRED route handlers (series, curve, calendar)
├── components/
│   ├── shell/               # command bar, sidebar, status bar, ticker, command palette
│   ├── ui/                  # Panel, Stat, Tag, DataGrid, PageHeader, KpiStrip
│   ├── econ/               # SourceBadge (LIVE/SIM provenance)
│   └── charts/              # SVG chart library (Sparkline, LineChart, CandleChart, Treemap,
│                            #   Sankey, NetworkGraph, Waterfall, Matrix, Radial, YieldCurve, ScatterPlot)
├── data/                    # deterministic domain generators (universe, markets, securitiesLending,
│                            #   primeFinance, collateral, cash, sourcesUses, optimization, trading,
│                            #   alerts, econSeries, econCurve, econRates, econModels)
└── lib/                     # rng (seeded), format, hooks, nav, useEcon, server/fred.ts
```

---

*Unified Securities Finance Intelligence — Securities Lending · Prime Finance · Collateral &
Cash Optimization · Sources & Uses Matching · Treasury Analytics · AI decision support, in a
single Bloomberg-style operating system.*
