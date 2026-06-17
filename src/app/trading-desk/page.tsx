"use client";

import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { BarChart } from "@/components/charts/BarChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { ProgressBar } from "@/components/charts/Radial";
import {
  getTraderScores,
  getExecutions,
  getDeskRisk,
  getPositionConcentration,
  type TraderScore,
  type ExecutionRow,
  type PositionConc,
} from "@/data/trading";
import { fmtAbbr, fmtUsdAbbr, fmtPct, fmtBps, fmtInt, fmtNum, fmtSigned, pnlClass } from "@/lib/format";

export default function TradingDesk() {
  const traders = getTraderScores().slice().sort((a, b) => b.revenueMtd - a.revenueMtd);
  const execs = getExecutions();
  const risk = getDeskRisk();
  const conc = getPositionConcentration();

  // KPIs
  const deskRevDay = traders.reduce((a, t) => a + t.revenueDay, 0);
  const deskPnlDay = traders.reduce((a, t) => a + t.pnlDay, 0);
  const revMtd = traders.reduce((a, t) => a + t.revenueMtd, 0);
  const avgUtil = traders.reduce((a, t) => a + t.utilization, 0) / traders.length;
  const avgSharpe = traders.reduce((a, t) => a + t.sharpe, 0) / traders.length;
  const bestTrader = traders[0];

  const avgSlippage = execs.reduce((a, e) => a + e.slippageBps, 0) / execs.length;
  const avgFill = execs.reduce((a, e) => a + e.fillRate, 0) / execs.length;

  const traderCols: Column<TraderScore>[] = [
    {
      key: "rank",
      header: "#",
      align: "right",
      width: "32px",
      render: (t) => (
        <span className={t.rank <= 3 ? "font-bold text-term-amber" : "text-term-text-mute"}>{t.rank}</span>
      ),
      sortVal: (t) => t.rank,
    },
    { key: "name", header: "Trader", render: (t) => <span className="font-semibold text-term-text">{t.name}</span>, sortVal: (t) => t.name },
    { key: "desk", header: "Desk", render: (t) => <span className="text-term-text-dim">{t.desk}</span>, sortVal: (t) => t.desk },
    { key: "revenueDay", header: "Rev Day", align: "right", render: (t) => <span className="text-term-text">{fmtUsdAbbr(t.revenueDay)}</span>, sortVal: (t) => t.revenueDay },
    { key: "revenueMtd", header: "Rev MTD", align: "right", render: (t) => <span className="text-term-amber">{fmtUsdAbbr(t.revenueMtd)}</span>, sortVal: (t) => t.revenueMtd },
    { key: "pnlDay", header: "P&L Day", align: "right", render: (t) => <span className={pnlClass(t.pnlDay)}>{fmtUsdAbbr(t.pnlDay)}</span>, sortVal: (t) => t.pnlDay },
    { key: "pnlMtd", header: "P&L MTD", align: "right", render: (t) => <span className={pnlClass(t.pnlMtd)}>{fmtUsdAbbr(t.pnlMtd)}</span>, sortVal: (t) => t.pnlMtd },
    {
      key: "utilization",
      header: "Util",
      align: "right",
      width: "110px",
      render: (t) => <ProgressBar value={t.utilization} color={t.utilization > 90 ? "#FF3B3B" : "#FF8C00"} height={5} showPct />,
      sortVal: (t) => t.utilization,
    },
    { key: "financingSpreadBps", header: "Fin Spd", align: "right", render: (t) => <span className="text-term-text-dim">{fmtBps(t.financingSpreadBps)}</span>, sortVal: (t) => t.financingSpreadBps },
    { key: "sharpe", header: "Sharpe", align: "right", render: (t) => <span className={t.sharpe >= 2 ? "text-term-up" : "text-term-text"}>{fmtNum(t.sharpe, 2)}</span>, sortVal: (t) => t.sharpe },
    { key: "hitRate", header: "Hit %", align: "right", render: (t) => <span className="text-term-text-dim">{fmtPct(t.hitRate, 0)}</span>, sortVal: (t) => t.hitRate },
    { key: "pnlTrend", header: "Trend", align: "right", width: "70px", render: (t) => <Sparkline data={t.pnlTrend} width={60} height={20} /> },
  ];

  const execCols: Column<ExecutionRow>[] = [
    { key: "ticker", header: "Ticker", render: (e) => <span className="font-semibold text-term-text">{e.ticker}</span>, sortVal: (e) => e.ticker },
    { key: "side", header: "Side", render: (e) => <Tag tone={e.side === "BUY" ? "up" : "down"}>{e.side}</Tag>, sortVal: (e) => e.side },
    { key: "qty", header: "Qty", align: "right", render: (e) => <span className="text-term-text-dim">{fmtInt(e.qty)}</span>, sortVal: (e) => e.qty },
    { key: "avgPx", header: "Avg Px", align: "right", render: (e) => <span className="text-term-text">{fmtNum(e.avgPx, 2)}</span>, sortVal: (e) => e.avgPx },
    { key: "vwap", header: "VWAP", align: "right", render: (e) => <span className="text-term-text-dim">{fmtNum(e.vwap, 2)}</span>, sortVal: (e) => e.vwap },
    { key: "twap", header: "TWAP", align: "right", render: (e) => <span className="text-term-text-dim">{fmtNum(e.twap, 2)}</span>, sortVal: (e) => e.twap },
    {
      key: "slippageBps",
      header: "Slip",
      align: "right",
      render: (e) => <span className={pnlClass(-e.slippageBps)}>{fmtBps(e.slippageBps, 1)}</span>,
      sortVal: (e) => e.slippageBps,
    },
    {
      key: "fillRate",
      header: "Fill",
      align: "right",
      width: "110px",
      render: (e) => <ProgressBar value={e.fillRate} color={e.fillRate >= 95 ? "#2ECC71" : "#FF8C00"} height={5} showPct />,
      sortVal: (e) => e.fillRate,
    },
    { key: "venue", header: "Venue", render: (e) => <span className="text-term-text-dim">{e.venue}</span>, sortVal: (e) => e.venue },
    { key: "algo", header: "Algo", render: (e) => <Tag tone="violet">{e.algo}</Tag>, sortVal: (e) => e.algo },
  ];

  const concCols: Column<PositionConc>[] = [
    { key: "ticker", header: "Ticker", render: (p) => <span className="font-semibold text-term-text">{p.ticker}</span>, sortVal: (p) => p.ticker },
    {
      key: "netExposure",
      header: "Net Exposure",
      align: "right",
      render: (p) => <span className={pnlClass(p.netExposure)}>{p.netExposure >= 0 ? "+" : "-"}{fmtUsdAbbr(Math.abs(p.netExposure))}</span>,
      sortVal: (p) => p.netExposure,
    },
    {
      key: "pctBook",
      header: "% Book",
      align: "right",
      width: "120px",
      render: (p) => <ProgressBar value={p.pctBook} max={15} color={p.pctBook > 10 ? "#FF3B3B" : "#FF8C00"} height={5} showPct />,
      sortVal: (p) => p.pctBook,
    },
    {
      key: "liquidity",
      header: "Liquidity",
      align: "right",
      render: (p) => <Tag tone={p.liquidity === "DEEP" ? "up" : p.liquidity === "THIN" ? "down" : "neutral"}>{p.liquidity}</Tag>,
      sortVal: (p) => p.liquidity,
    },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader code="DESK" title="Trading Desk" desc="Scorecards · Execution · Risk" />

      <KpiStrip>
        <Stat label="Desk Revenue (Day)" value={fmtUsdAbbr(deskRevDay)} sub={`${traders.length} traders`} tone="amber" />
        <Stat label="Desk P&L (Day)" value={fmtUsdAbbr(deskPnlDay)} sub="realized + unrealized" tone={deskPnlDay >= 0 ? "up" : "down"} />
        <Stat label="MTD Revenue" value={fmtUsdAbbr(revMtd)} sub="month to date" />
        <Stat label="Avg Utilization" value={fmtPct(avgUtil, 0)} sub="capital deployed" />
        <Stat label="Avg Sharpe" value={fmtNum(avgSharpe, 2)} sub="risk-adjusted" tone={avgSharpe >= 2 ? "up" : "neutral"} />
        <Stat label="Best Trader" value={bestTrader.name} sub={`${fmtUsdAbbr(bestTrader.revenueMtd)} MTD`} tone="amber" />
      </KpiStrip>

      <div className="flex flex-1 flex-col gap-2 p-2">
        {/* Trader scorecards */}
        <Panel title="Trader Scorecards" code="SCORE" right={<span className="text-3xs text-term-text-mute">ranked by MTD revenue · top 3 highlighted</span>}>
          <DataGrid columns={traderCols} rows={traders} rowKey={(t) => t.id} maxHeight="360px" initialSort={{ key: "revenueMtd", dir: "desc" }} zebra />
        </Panel>

        {/* Execution analytics */}
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <Panel title="Execution Analytics" code="EXEC" className="xl:col-span-2">
            <DataGrid columns={execCols} rows={execs} rowKey={(e) => e.ticker} maxHeight="300px" initialSort={{ key: "slippageBps", dir: "asc" }} zebra />
          </Panel>

          <Panel title="Slippage by Ticker" code="SLIP" right={<Tag tone={avgSlippage <= 0 ? "up" : "down"}>{fmtBps(avgSlippage, 1)} avg</Tag>}>
            <div className="grid grid-cols-2 divide-x divide-term-border border-b border-term-border">
              <Stat label="Avg Slippage" value={fmtBps(avgSlippage, 2)} tone={avgSlippage <= 0 ? "up" : "down"} />
              <Stat label="Avg Fill Rate" value={fmtPct(avgFill, 1)} tone="up" />
            </div>
            <div className="p-2">
              <BarChart
                horizontal
                data={execs
                  .slice()
                  .sort((a, b) => a.slippageBps - b.slippageBps)
                  .map((e) => ({ label: e.ticker, value: e.slippageBps, color: e.slippageBps <= 0 ? "#2ECC71" : "#FF3B3B" }))}
                fmt={(n) => fmtBps(n, 1)}
              />
            </div>
          </Panel>
        </div>

        {/* Risk + concentration */}
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          <Panel title="Risk Analytics" code="RISK" right={<Tag tone="amber">{risk.length} limits</Tag>}>
            <div className="divide-y divide-term-border-soft">
              {risk.map((r) => {
                const isScore = r.unit === "score";
                // For score, value should stay ABOVE limit (floor); else below limit (cap).
                const util = isScore ? r.limit / Math.max(r.value, 1e-9) : Math.abs(r.value) / r.limit;
                const danger = util > 0.85;
                const warn = util > 0.65;
                const color = danger ? "#FF3B3B" : warn ? "#FF8C00" : "#2ECC71";
                const valStr =
                  r.unit === "$" ? (r.value < 0 ? "-" : "") + fmtUsdAbbr(Math.abs(r.value)) : r.unit === "%" ? fmtPct(r.value, 1) : fmtNum(r.value, 0);
                const limStr = r.unit === "$" ? fmtUsdAbbr(r.limit) : r.unit === "%" ? fmtPct(r.limit, 0) : fmtNum(r.limit, 0);
                return (
                  <div key={r.metric} className="px-2 py-2">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-term-text-dim">{r.metric}</span>
                      <span className="tnum">
                        <span className={danger ? "text-term-down" : "text-term-text"}>{valStr}</span>
                        <span className="text-term-text-mute"> / {limStr} {isScore ? "floor" : "limit"}</span>
                      </span>
                    </div>
                    <ProgressBar value={Math.min(util * 100, 100)} color={color} height={6} />
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Position Concentration" code="CONC">
            <DataGrid columns={concCols} rows={conc} rowKey={(p) => p.ticker} maxHeight="200px" initialSort={{ key: "netExposure", dir: "desc" }} zebra />
            <div className="border-t border-term-border p-2">
              <div className="term-label mb-1.5">Net Exposure — Long / Short</div>
              <BarChart
                horizontal
                data={conc.map((p) => ({ label: p.ticker, value: p.netExposure, color: p.netExposure >= 0 ? "#2ECC71" : "#FF3B3B" }))}
                fmt={(n) => fmtSigned(n / 1e6, 0) + "M"}
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
