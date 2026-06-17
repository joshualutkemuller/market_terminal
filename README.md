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
| `AI`   | **AI Copilot** | Built-in "Bloomberg GPT" — natural-language Q&A over every dataset, with narratives, tables, charts, and recommended actions |
| `ALRT` | **Alert Center** | Streaming risk & ops alerts with severity/category filters and a rules engine |

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

**This demo build** runs entirely in the browser — fully client-rendered Next.js with
**deterministic, seeded mock data generators** (no backend, no database, no API keys).
That makes it deploy anywhere static and reproducible across server/client renders.

- **Next.js 14 (App Router) · React 18 · TypeScript (strict) · Tailwind CSS**
- **Zero-dependency SVG chart library** (sparklines, line/area, bars, candlesticks + VWAP,
  treemaps, Sankey, network graphs, revenue waterfalls, correlation matrices, donuts, gauges, heat grids)
- **AG-Grid-style sortable data grids** built from scratch for density and speed

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

Every page is statically prerendered, so any free static/Next.js host works with **zero
configuration** (no env vars required):

- **Vercel (recommended):** import the repo → pick this branch → Deploy → get a `*.vercel.app` URL
- **Netlify / Cloudflare Pages:** same — build command `npm run build`

---

## Project layout

```
src/
├── app/                     # one route per module (HOME, MKT, SLAB, PB, COLL, CASH, SXU, OPT, DESK, AI, ALRT)
├── components/
│   ├── shell/               # command bar, sidebar, status bar, ticker, command palette
│   ├── ui/                  # Panel, Stat, Tag, DataGrid, PageHeader, KpiStrip
│   └── charts/              # SVG chart library (Sparkline, LineChart, CandleChart, Treemap, Sankey, NetworkGraph, Waterfall, Matrix, Radial)
├── data/                    # deterministic domain generators (universe, markets, securitiesLending, primeFinance, collateral, cash, sourcesUses, optimization, trading, alerts)
└── lib/                     # rng (seeded), format, hooks, nav, theme
```

---

*Unified Securities Finance Intelligence — Securities Lending · Prime Finance · Collateral &
Cash Optimization · Sources & Uses Matching · Treasury Analytics · AI decision support, in a
single Bloomberg-style operating system.*
