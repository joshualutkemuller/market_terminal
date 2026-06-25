# Feature Addition — Desk Pulse: Funding & Liquidity (`FUND`) + Borrow-Demand / Squeeze Radar (`SQZ`)

Date: 2026-06-21
Status: Completed — funding and squeeze workflows are integrated
Module codes: **`FUND`** — Funding & Liquidity Pulse · **`SQZ`** — Borrow-Demand / Squeeze Radar
Related: `docs/MARKET_TERMINAL_ROADMAP.md`, `docs/features/completed/Feature Addition - Charting Studios (Macro & Market).md`, `economics/sec-finance` (`SFE`), `securities-lending` (`SLAB`)

---

## 1. Executive Summary

Two desk-facing "market pulse" modules aimed squarely at the people who finance and lend the market: **swap traders, agency securities-lending traders, prime-brokerage traders, account managers, and securities-lending professionals.**

They are *indirectly related* to any single book but decisive for it:

- **`FUND` — Funding & Liquidity Pulse.** The plumbing every financing desk watches: SOFR / EFFR / OBFR / IORB, tri-party GC, the key funding spreads (SOFR–EFFR, SOFR–IORB, GC–OIS, bill–OIS), RRP take-up, bank reserves, the Fed balance sheet, T-bills, cross-currency basis, and a **quarter/month-end funding-stress gauge**. This turns `SFE` (which *explains* how rates flow into repo/funding) into the live *monitor* of those conditions.
- **`SQZ` — Borrow-Demand / Squeeze Radar.** Microstructure signals that predict the lending book *before* it prints: short interest, days-to-cover, utilization, **fee momentum**, the fee-vs-utilization quadrant, options skew, ETF create/redeem pressure, and a composite **heat score** with "heating up before it's a special" alerts.

**Why these two, why now.** The terminal already nails the *book* (`SLAB`, `PB`, `COLL`, `CASH`, `REINV`) and the *macro* (`ECON`, `CURV`, `CRDT`, `FOMC`, `SFE`). The gap is the **live funding tape** and the **forward-looking borrow-demand radar** — exactly the cross-desk "pulse" that impresses this audience because most generic terminals ignore the plumbing and treat short interest as a static stat.

### Persona value map

| Persona | `FUND` gives them | `SQZ` gives them |
|---|---|---|
| Swap traders (TRS / financing / rates) | SOFR/repo legs, xccy basis, FRA-OIS stress, q-end pricing | dividend/borrow-driven swap richness, crowding |
| Agency SBL traders | GC floor, reinvestment yield context, funding-stress regime | re-rate early, source supply ahead of demand |
| Prime traders | balance-sheet/financing cost, q-end window dressing | short demand, hard-to-borrow pipeline |
| Account managers | one screen to explain funding-cost moves to clients | client-facing "what's hot to borrow" color |
| SBL professionals | collateral scarcity / GC stress signals | specials watch, squeeze candidates, fails risk |

---

## 2. Reuse cheat-sheet (existing pipelines & structure leveraged)

Both modules sit on the infrastructure already built — **no new ingestion path**, same provenance-honest, render-local-then-upgrade pattern.

| Need | Reuse |
|---|---|
| Live funding series (SOFR, EFFR, WALCL, DGS3MO, VIXCLS, DTWEXBGS, T10Y2Y…) | `src/lib/server/fred.ts` (`fredSeries`/`fredLatest`), `/api/econ/series`, `/api/econ/batch`, `/api/chart/series` |
| Macro catalog + unit handling | `src/data/econSeries.ts` (`FRED_CATALOG`, `resolveFred`, `getSeriesHistory`) — extend with a small funding-series set |
| Client data hooks + provenance badges | `useEcon` / `useLiveSeriesSet`, `lib/fetchCache.ts`, `components/ui/ProvenanceBadge.tsx` (`FRED`/`SIM`/`ECON`) |
| Internal funding cost tie-in (`FUND`) | `src/data/cash.ts` (`getCashSummary`, `getFundingSources`), `src/data/reinvestment.ts` |
| Borrow-book spine (`SQZ`) | `src/data/securitiesLending.ts` (`getInventory`, `getBorrowDemand`, `getSLSummary`), `src/data/universe.ts` |
| Charts | `LineChart`, `Sparkline`, `BarChart`, `Matrix/HeatGrid`, `ScatterPlot` (quadrant), the charting engine |
| Determinism / fallback | `Rng` + the `LIVE/FRED/SIM` badge convention |
| Alerts | `ALRT` Alert Center (`src/data/alerts.ts`) — `SQZ` heat-up + `FUND` stress alerts stream in |
| Drill-ins | `ChartLink` → `MGC` for any funding series |

---

## 3. Module `FUND` — Funding & Liquidity Pulse

Route `/economics/funding` (ECONOMICS group). Sits next to `SFE`.

### Views
1. **Overnight Rates Stack** — SOFR, EFFR, OBFR, IORB, BGCR/TGCR on one panel with the policy corridor; latest + Δ + sparkline.
2. **Funding Spreads** — SOFR–EFFR, SOFR–IORB, GC–OIS, bill–OIS, FRA-OIS, with history and percentile bands (stress = wide).
3. **Liquidity Balances** — RRP take-up, bank reserves (`WRESBAL`), Fed balance sheet (`WALCL`), net liquidity proxy, with trend.
4. **Cross-Currency Basis** — EURUSD / USDJPY / GBPUSD 3M basis (funding pressure into USD).
5. **Bills & Money Markets** — 1M/3M/6M bill yields, T-bill–OIS, CP context.
6. **Funding-Stress Gauge** — composite 0–100 (spread widenings + RRP drain + xccy basis + calendar proximity to quarter/month-end), with a regime label (Calm / Watch / Stressed) and the desk read-through ("GC firming into q-end — expect specials to cheapen / financing to widen").
7. **Desk tie-in** — pull `getCashSummary()` blended vs optimized funding and frame it against the live external funding regime.

### Data
- **Live:** FRED ids — `SOFR`, `EFFR`, `OBFR`, `IORB`, `BGCR`, `TGCR`, `RRPONTSYD`, `WRESBAL`, `WALCL`, `DTB3`, `DTB4WK`, `DTB6`, `DGS3MO`, plus SOFR averages. Fetched via the existing FRED route layer; ids not in the 72-series catalog are fetched directly through `fredSeries` (a `FUNDING_SERIES` map is added).
- **Derived:** the spreads, percentile bands, net-liquidity proxy, and the composite stress gauge are computed client-side from aligned series (reusing the charting resolver's LOCF alignment).
- **Cross-currency basis / FRA-OIS:** not on FRED → deterministic `Rng` series (clearly `SIM`), swappable for a BIS/pipeline feed later (`macro_data_etl` already pulls BIS).
- **Fallback:** every series renders a deterministic seeded path with the amber `SIM` badge when no `FRED_API_KEY`.

---

## 4. Module `SQZ` — Borrow-Demand / Squeeze Radar

Route `/securities-lending/squeeze` or `/squeeze` (FINANCE group, near `SLAB`). Builds on the borrow book spine.

### Views
1. **Heat Board** — every name ranked by a composite **Heat Score** (0–100): utilization, fee level, **fee momentum (5d/20d)**, short interest, days-to-cover, social/attention (from `NEWS`). Columns: ticker, class, util, fee, fee Δ, SI%, DTC, heat.
2. **Fee × Utilization Quadrant** — scatter (reuse `ScatterPlot`): high-util/high-fee = specials; high-util/low-fee = **re-rate candidates** (the money view for agency lenders).
3. **Squeeze Candidates** — high SI% + high DTC + accelerating fee + price up → ranked squeeze risk, with the supporting signals.
4. **Specials Watch** — names crossing GC→warm→special, with the fee path and recall-risk flag.
5. **Sector Heat** — aggregate heat by sector (reuse `Matrix/HeatGrid`).
6. **Heating-Up Alerts** — threshold breaches (fee-momentum spike, util > 90 & rising, SI jump) streamed into `ALRT`.

### Data
- **Spine (deterministic, already real-shaped):** `getInventory()` (`utilization`, `feeBps`, `classification`, `hardToBorrow`), `getBorrowDemand()`, `getSLSummary()`, `universe.ts` (`px`, `vol`, `marketCap`, `sector`, `borrowFee`).
- **Synthesized signals (seeded `Rng`, `SIM`):** short interest %, days-to-cover, fee 5d/20d momentum, utilization trend, options put/call & skew, ETF create/redeem proxy, crowding — derived deterministically from the inventory spine so they're internally consistent (a hard-to-borrow special also reads high SI / high DTC).
- **Cross-link:** Heat Score optionally blends `NEWS` attention/social for a name; `ChartLink`/`MKC` drill-in per ticker.
- **Live path:** the same shapes can be fed by a borrow/short-interest provider (e.g. exchange SI, vendor borrow rates) via the pipeline later — UI unchanged.

### Heat Score (composite, 0–100)
`0.30·utilization + 0.20·fee_percentile + 0.20·fee_momentum + 0.15·short_interest + 0.10·days_to_cover + 0.05·attention`, clamped, with a direction (heating / cooling) from the momentum terms.

---

## 5. Provenance & UX

- Every series/metric carries a `source` badge via the canonical `ProvenanceBadge` (`FRED` live, `SIM`/`ECON` fallback) — no silent fake-live data.
- Render the deterministic layer instantly (SSR-safe), upgrade to FRED through the shared `fetchCache` (dedupe + stale-while-revalidate).
- Terminal-dense styling, `KpiStrip` headline gauges, sparkline-per-row, drill-ins to `MGC`/`MKC`.

## 6. Phased delivery

- **Phase 1 — `FUND` core.** Funding-series map + route reuse, the rates stack, spreads, balances, and the stress gauge. Deterministic fallback + FRED live.
- **Phase 2 — `SQZ` core.** Borrow-spine signal engine, Heat Board, fee×util quadrant, squeeze/specials views.
- **Phase 3 — wiring.** `ALRT` integration (heat-up + funding-stress alerts), `NEWS` attention blend, `MGC`/`MKC` drill-ins, nav entries.
- **Phase 4 (optional, pipeline).** Live cross-currency/FRA-OIS via `macro_data_etl` (BIS); live short-interest/borrow vendor feed behind the same shapes.

## 7. Risks & notes

- **Series availability:** xccy basis and FRA-OIS aren't on FRED — clearly `SIM` until a BIS/vendor feed is wired; everything else is live FRED.
- **SQZ is research-grade:** synthesized short-interest/options signals are deterministic and labelled `SIM`; they demonstrate the analytics and swap cleanly for a vendor feed.
- **No scope creep into the book:** `FUND`/`SQZ` are *pulse* modules; they link to `SLAB`/`CASH`/`SFE` rather than duplicating them.

*Bottom line:* two thin, high-signal modules on top of the existing FRED + securities-lending pipelines that give financing and lending desks the funding tape and borrow-demand radar they actually watch — the "market pulse" that's indirectly related to the book but moves it.
