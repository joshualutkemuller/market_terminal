# Agency, Prime & Electronic Trading Analytics Handoff

Date: 2026-06-24
Status: Active roadmap
Primary data sources: FRED, Yahoo Finance, committed snapshots, deterministic fallback models
Audience: Agency lending, prime finance, repo/funding, swap financing, electronic trading, account coverage

## Objective

Build a desk-useful analytics layer that turns the existing FRED and Yahoo Finance data foundation into actionable macro, funding, financing, liquidity, and execution-context modules.

The goal is not just more charts. The goal is to answer:

- Are funding conditions tightening enough to affect repo, securities lending, cash reinvestment, or client financing?
- Are prime clients likely to face margin or balance-sheet pressure?
- Is market liquidity good enough for electronic execution, or should routing/aggression assumptions change?
- Which macro regime is driving the tape: rates, credit, inflation, liquidity, growth, or risk appetite?
- What is live, what is snapshot-backed, and what is model/simulation fallback?

## Current Foundation

Already available:

- FRED macro/econ catalog with snapshot fallback and raw observations for proper MoM/YoY calculations.
- Yahoo Finance market pipeline for ETFs, indices, cross-asset prices, returns, drawdowns, and market snapshots.
- Funding page at `/economics/funding` with SOFR/EFFR/OBFR/IORB/BGCR/TGCR/RRP/reserves/bills and synthetic x-currency/FRA-OIS placeholders.
- Prime finance, liquidity, collateral, securities lending, sec-finance, macro regime, curve, rates, inflation, and credit modules.
- Shared widgetized/resizable analytics UI with internal scrollbars for wide content.

## Priority Build Sequence

### 1. Funding & Collateral Stress Cockpit

Status: Started
Primary route: `/economics/funding`
Related routes: `/liquidity`, `/economics/sec-finance`, `/reinvestment`, `/collateral`

Series:

- FRED: `SOFR`, `EFFR`, `FEDFUNDS`, `OBFR`, `IORB`, `BGCR`, `TGCR`, `RRPONTSYD`, `WRESBAL`, `WALCL`, `DTB4WK`, `DTB3`, `DTB6`, `DGS1MO`, `DGS3MO`, `DGS6MO`
- Derived: SOFR-EFFR, SOFR-IORB, TGCR-EFFR, DTB3-EFFR, reserve drain, RRP drain, bill scarcity, quarter-end pressure
- Model/sim until better feed: FRA-OIS, EUR/JPY/GBP x-currency basis

Analytics to add:

- Desk action signals for repo, agency lending, prime, cash reinvestment, collateral, and treasury.
- Collateral pressure score: GC/repo spreads plus bill scarcity.
- Liquidity buffer score: RRP and reserves trend.
- Quarter-end sensitivity flag.
- Explicit action text: term out, widen financing, protect reinvestment duration, monitor recalls, reduce e-trading aggression.

Acceptance checks:

- Every actionable signal explains the derivation in visible module text or tooltip text.
- Signals render with FRED when available and deterministic fallback otherwise.
- No silent simulated values; source badges remain visible.

### 2. Prime Risk & Financing Conditions Board

Primary route: `/prime-finance`
Related routes: `/liquidity`, `/collateral`, `/economics/funding`

Series:

- Yahoo: `SPY`, `QQQ`, `IWM`, `RSP`, `HYG`, `JNK`, `LQD`, `BKLN`, `TLT`, `IEF`, `SHY`, `KRE`, `XLF`, `VIX`/FRED `VIXCLS`
- FRED: HY OAS, IG OAS, BBB OAS, CCC OAS, SOFR, EFFR, Treasury curve

Analytics:

- Prime margin pressure score from equity drawdowns, credit widening, vol, and funding spread.
- Client financing risk overlay against current funding regime.
- Scenario shocks: rates up/down, HY widening, equity gap, liquidity squeeze.
- Balance-sheet utilization pressure and RoA by financing condition.

### 3. Electronic Trading Market Conditions Monitor

Primary route: candidate `/trading-desk` or `/markets`
Related route: `/market-lens`

Series:

- Yahoo OHLCV across index, sector, factor, credit, rates, commodity, FX ETF proxies.

Analytics:

- Realized volatility and range expansion.
- Volume z-score and liquidity participation proxy.
- Gap risk and trend/mean-reversion regime.
- Execution risk level by symbol: normal, cautious, wide, stress.
- Suggested desk stance: passive, balanced, aggressive, or reduce size.

### 4. Cross-Asset Macro Regime Engine

Primary route: `/economics/regime`
Related routes: `/markets`, `/market-lens`, `/economics/curve`, `/economics/credit`

Series:

- FRED: growth, inflation, labor, curve, real yields, breakevens, credit spreads, stress indexes.
- Yahoo: equities, sectors, rates ETFs, credit ETFs, commodities, USD proxies.

Analytics:

- Growth impulse, inflation impulse, policy impulse, liquidity impulse, credit impulse, risk appetite impulse.
- Regimes: Goldilocks, reflation, stagflation, growth scare, liquidity squeeze, policy easing.
- Desk playbook: financing, repo, agency lending, prime margin, and e-trading implications.

### 5. Rates Relative Value Board

Primary route: `/economics/curve`

Analytics:

- 2s5s10s, 3m2y10y, 5s10s30s butterflies.
- Spread z-scores and percentiles.
- Carry/roll proxy from Treasury curve.
- Real yield vs breakeven decomposition.
- Bull/bear steepener/flattener classifier.

### 6. Credit Stress & ETF Divergence Board

Primary route: `/economics/credit`
Related route: `/markets`

Series:

- FRED: IG, BBB, HY, BB, B, CCC OAS and yields.
- Yahoo: `HYG`, `JNK`, `LQD`, `BKLN`, `EMB`.

Analytics:

- HY-IG, CCC-BB, BBB-IG spread decomposition.
- ETF price vs OAS divergence.
- Credit beta to SPY/IWM.
- Financing haircut pressure proxy.

## Recommended Yahoo Additions

Add these to the market catalog as available:

- Credit/liquidity: `JNK`, `BKLN`, `EMB`, `MBB`, `MUB`
- Banks/funding: `KRE`, `KBE`
- FX: `UUP`, `FXE`, `FXY`
- Global risk: `EEM`, `EWJ`, `EWG`, `FXI`
- High beta/crowding: `SMH`, `XBI`, `ARKK`
- Crypto proxy: `IBIT`

## Provenance Rules

- `FRED`: live API data or committed FRED snapshot.
- `YAHOO`: live/pipeline Yahoo data or committed market snapshot.
- `SNAPSHOT`: committed local fallback from a prior successful pull.
- `MODEL`: transparent model-derived fallback, such as FRED model Fed probabilities.
- `SIM`: deterministic placeholder where no free/live source exists.

Any model or simulated value must say how it is derived in the module, not only in code comments.

## Implementation Notes

- Prefer shared data engines under `src/data/*` and route modules that already exist.
- Keep dashboard modules widget-based with internal scroll for dense tables.
- Add analytics as pure functions over series maps where possible, so live and fallback data use the same math.
- Keep cross-module dependencies one-way: funding conditions can feed prime/liquidity playbooks, but book modules should not become the canonical macro data source.
- Avoid adding paid/vendor assumptions unless the module explicitly labels them as future live-feed slots.

## First Active Work Item

Enhance `/economics/funding` with a desk action panel:

- repo/GC pressure
- agency lending read-through
- prime financing read-through
- cash reinvestment read-through
- collateral pressure read-through
- electronic trading liquidity stance

Each row should show driver, score, source, derivation note, and action.
