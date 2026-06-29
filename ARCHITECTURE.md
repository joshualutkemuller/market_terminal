# Production Architecture

The shipped demo runs 100% in the browser on deterministic mock generators so it can be
hosted statically and reviewed with zero setup. This document describes the **target
production architecture** the UI is designed against — i.e. what each mock would be wired
to in a real institutional deployment.

```
                         ┌────────────────────────────────────────────┐
                         │            QIT Terminal (Next.js)            │
                         │  Bloomberg-style UI · keyboard-driven · RBAC │
                         └───────────────┬───────────────┬─────────────┘
                          WebSocket /    │               │  REST (FastAPI)
                          SSE streams    │               │
                  ┌──────────────────────┴───┐   ┌───────┴───────────────────┐
                  │      Streaming Gateway     │   │       API Gateway         │
                  │   (WebSockets, Kafka bus)  │   │   FastAPI · Pydantic      │
                  └───────────┬────────────────┘   └───────┬───────────────────┘
                              │                            │
        ┌─────────────────────┼──────────────┬────────────┼───────────────────┐
        │                     │              │            │                   │
 ┌──────┴──────┐      ┌───────┴──────┐ ┌─────┴──────┐ ┌───┴─────────┐ ┌───────┴───────┐
 │ Market Data │      │  Analytics   │ │ Optimization│ │  Risk /     │ │  AI Copilot   │
 │ feed adapters│     │ Pandas/Polars│ │ OR-Tools /  │ │  Stress     │ │  LLM + RAG    │
 │ (exchanges, │      │   / NumPy    │ │ Gurobi /    │ │  engine     │ │  over datasets│
 │  prime, repo)│     │              │ │ Pyomo       │ │             │ │               │
 └─────────────┘      └──────────────┘ └─────────────┘ └─────────────┘ └───────────────┘
        │                     │              │            │                   │
        └─────────────────────┴──────────────┴────────────┴───────────────────┘
                                          │
                         ┌────────────────┴─────────────────┐
                         │  PostgreSQL (reference/book)      │
                         │  TimescaleDB (tick / time-series) │
                         └──────────────────────────────────┘
```

## Layers

| Concern | Technology | Maps to (in demo) |
|---------|-----------|-------------------|
| UI | Next.js, React, TypeScript, Tailwind | `src/app`, `src/components` |
| Real-time | WebSockets, Kafka | `useTick` / streaming-styled components & `data/*` generators |
| API | Python, FastAPI, Pydantic | `data/*` typed accessors |
| Analytics | Pandas, Polars, NumPy | `data/*` aggregations (revenue by X, summaries) |
| Optimization | OR-Tools, Gurobi, Pyomo | `data/optimization.ts`, `data/collateral.ts`, `data/cash.ts` |
| Time-series | TimescaleDB | intraday/candle/trend series |
| Reference & book | PostgreSQL | `data/universe.ts`, loan/margin/client books |
| Identity | SSO, Active Directory, RBAC | role badge in the command bar |

## Optimization model sketch

The Collateral / Cash / Sources & Uses optimizers are linear/mixed-integer programs of the
canonical form solved by Gurobi or OR-Tools:

```
minimize    Σ cost_ij · x_ij                      # funding / opportunity cost of allocation
subject to  Σ_j x_ij ≤ available_i                 # source capacity
            Σ_i x_ij ≥ requirement_j               # cover each use / margin call
            Σ x_ij ≤ concentration_limit           # issuer / counterparty concentration
            haircut & eligibility schedules        # collateral quality constraints
            regulatory ratios (LCR / NSFR / BS cap) # balance-sheet & liquidity constraints
            x_ij ≥ 0
```

Shadow prices (dual values) on the binding constraints — surfaced verbatim in the
**Optimization Center** and **Collateral** modules — quantify the marginal value of relaxing
each limit, which drives the recommended trades and what-if analysis.
