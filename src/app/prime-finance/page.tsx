"use client";

import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { Donut, Gauge, ProgressBar } from "@/components/charts/Radial";
import {
  getPrimeClients,
  getPrimeSummary,
  getStressScenarios,
  getFinancingOpportunities,
  type PrimeClient,
  type StressScenario,
  type FinancingOpp,
} from "@/data/primeFinance";
import { fmtAbbr, fmtUsdAbbr, fmtNum, fmtBps, fmtPct, pnlClass } from "@/lib/format";

const OPP_TONE: Record<FinancingOpp["type"], "blue" | "amber" | "violet"> = {
  INTERNALIZE: "blue",
  CHEAPEN_FINANCE: "amber",
  BS_OPTIMIZE: "violet",
};

function ratingTone(r: string): "up" | "amber" | "down" {
  if (r.startsWith("A")) return "up";
  if (r.startsWith("B")) return "amber";
  return "down";
}

export default function PrimeFinancePage() {
  const summary = getPrimeSummary();
  const clients = getPrimeClients();
  const scenarios = getStressScenarios();
  const opps = getFinancingOpportunities();

  const totalSavings = opps.reduce((a, o) => a + o.savings, 0);
  const topRev = clients.slice(0, 8);
  const topBs = [...clients].sort((a, b) => b.balanceSheet - a.balanceSheet).slice(0, 8);

  const clientCols: Column<PrimeClient>[] = [
    { key: "name", header: "Client", render: (c) => <span className="font-semibold text-term-text">{c.name}</span>, sortVal: (c) => c.name },
    { key: "rating", header: "Rating", align: "center", render: (c) => <Tag tone={ratingTone(c.rating)}>{c.rating}</Tag>, sortVal: (c) => c.rating },
    { key: "region", header: "Region", render: (c) => <span className="text-term-text-dim">{c.region}</span>, sortVal: (c) => c.region },
    { key: "gross", header: "Gross", align: "right", render: (c) => <span className="text-term-text">{fmtUsdAbbr(c.gross)}</span>, sortVal: (c) => c.gross },
    { key: "net", header: "Net", align: "right", render: (c) => <span className="text-term-text-dim">{fmtUsdAbbr(c.net)}</span>, sortVal: (c) => c.net },
    { key: "longExp", header: "Long", align: "right", render: (c) => <span className="text-term-up">{fmtUsdAbbr(c.longExp)}</span>, sortVal: (c) => c.longExp },
    { key: "shortExp", header: "Short", align: "right", render: (c) => <span className="text-term-down">{fmtUsdAbbr(c.shortExp)}</span>, sortVal: (c) => c.shortExp },
    { key: "financingRevenue", header: "Fin.Rev", align: "right", render: (c) => <span className="text-term-amber">{fmtUsdAbbr(c.financingRevenue)}</span>, sortVal: (c) => c.financingRevenue },
    { key: "roa", header: "RoA", align: "right", render: (c) => <span className="text-term-text">{fmtBps(c.roa)}</span>, sortVal: (c) => c.roa },
    { key: "spreadBps", header: "Spread", align: "right", render: (c) => <span className="text-term-text-dim">{fmtBps(c.spreadBps)}</span>, sortVal: (c) => c.spreadBps },
    { key: "balanceSheet", header: "BS Use", align: "right", render: (c) => <span className="text-term-text-dim">{fmtUsdAbbr(c.balanceSheet)}</span>, sortVal: (c) => c.balanceSheet },
    {
      key: "utilization",
      header: "Util",
      align: "right",
      width: "110px",
      render: (c) => (
        <ProgressBar value={c.utilization} color={c.utilization > 85 ? "#FF3B3B" : c.utilization > 70 ? "#FF8C00" : "#2ECC71"} showPct />
      ),
      sortVal: (c) => c.utilization,
    },
  ];

  const stressCols: Column<StressScenario>[] = [
    { key: "name", header: "Scenario", render: (s) => <span className="text-term-text">{s.name}</span>, sortVal: (s) => s.name },
    { key: "pnl", header: "P&L Impact", align: "right", render: (s) => <span className="text-term-down">{fmtUsdAbbr(s.pnl)}</span>, sortVal: (s) => s.pnl },
    { key: "varImpact", header: "VaR Impact", align: "right", render: (s) => <span className="text-term-amber">{fmtNum(s.varImpact, 2)}x</span>, sortVal: (s) => s.varImpact },
    { key: "liquidityDays", header: "Liq Days", align: "right", render: (s) => <span className="text-term-text-dim">{fmtNum(s.liquidityDays, 1)}d</span>, sortVal: (s) => s.liquidityDays },
  ];

  const oppCols: Column<FinancingOpp>[] = [
    { key: "client", header: "Client", render: (o) => <span className="font-semibold text-term-text">{o.client}</span>, sortVal: (o) => o.client },
    { key: "ticker", header: "Ticker", render: (o) => <span className="font-mono text-term-text-dim">{o.ticker}</span>, sortVal: (o) => o.ticker },
    { key: "type", header: "Type", align: "center", render: (o) => <Tag tone={OPP_TONE[o.type]}>{o.type.replace("_", " ")}</Tag>, sortVal: (o) => o.type },
    { key: "currentBps", header: "Current", align: "right", render: (o) => <span className="text-term-text-dim">{fmtBps(o.currentBps, 1)}</span>, sortVal: (o) => o.currentBps },
    { key: "optimizedBps", header: "Optimized", align: "right", render: (o) => <span className="text-term-text">{fmtBps(o.optimizedBps, 1)}</span>, sortVal: (o) => o.optimizedBps },
    { key: "savings", header: "Savings", align: "right", render: (o) => <span className="text-term-up">{fmtUsdAbbr(o.savings)}</span>, sortVal: (o) => o.savings },
    { key: "notional", header: "Notional", align: "right", render: (o) => <span className="text-term-text-dim">{fmtUsdAbbr(o.notional)}</span>, sortVal: (o) => o.notional },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader code="PB" title="Prime Finance" desc="Hedge Fund Financing · Risk · Optimization" />

      <KpiStrip>
        <Stat label="Gross Exposure" value={fmtUsdAbbr(summary.grossExposure)} sub={`${summary.clientCount} clients`} />
        <Stat label="Net Exposure" value={fmtUsdAbbr(summary.netExposure)} sub={`Long ${fmtUsdAbbr(summary.longExposure)}`} />
        <Stat label="Financing Revenue" value={fmtUsdAbbr(summary.financingRevenue)} sub="annualized" tone="amber" />
        <Stat label="Avg RoA" value={fmtBps(summary.avgRoa)} sub={`BS ${fmtUsdAbbr(summary.balanceSheet)}`} />
        <Stat label="1d VaR 95%" value={fmtUsdAbbr(summary.var95)} sub={`99% ${fmtUsdAbbr(summary.var99)}`} />
        <Stat label="Stress Loss" value={fmtUsdAbbr(summary.stressLoss)} sub="worst-case" tone="down" />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        {/* Financing Exposure */}
        <Panel title="Financing Exposure" code="EXP" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-3">
            <div className="flex flex-col justify-center gap-2">
              <div>
                <div className="mb-0.5 flex justify-between text-2xs">
                  <span className="text-term-up">Long</span>
                  <span className="tnum text-term-text">{fmtUsdAbbr(summary.longExposure)}</span>
                </div>
                <ProgressBar value={summary.longExposure} max={summary.longExposure + summary.shortExposure} color="#2ECC71" height={9} />
              </div>
              <div>
                <div className="mb-0.5 flex justify-between text-2xs">
                  <span className="text-term-down">Short</span>
                  <span className="tnum text-term-text">{fmtUsdAbbr(summary.shortExposure)}</span>
                </div>
                <ProgressBar value={summary.shortExposure} max={summary.longExposure + summary.shortExposure} color="#FF3B3B" height={9} />
              </div>
              <div className="mt-1 flex items-center justify-between border-t border-term-border-soft pt-1.5 text-2xs">
                <span className="text-term-text-dim">Net Exposure</span>
                <span className="tnum text-term-amber">{fmtUsdAbbr(summary.netExposure)}</span>
              </div>
              <div className="flex items-center justify-between text-2xs">
                <span className="text-term-text-dim">Gross Exposure</span>
                <span className="tnum text-term-text">{fmtUsdAbbr(summary.grossExposure)}</span>
              </div>
            </div>
            <div className="flex items-center justify-center">
              <Donut
                segments={[
                  { value: summary.longExposure, color: "#2ECC71", label: "Long" },
                  { value: summary.shortExposure, color: "#FF3B3B", label: "Short" },
                ]}
                size={130}
                center={fmtUsdAbbr(summary.grossExposure)}
                centerSub="GROSS"
              />
            </div>
            <div className="flex flex-col justify-center">
              <div className="term-label mb-1 px-1">Gross Exposure — 60d</div>
              <LineChart height={120} yFmt={(n) => fmtAbbr(n)} series={[{ name: "Gross", data: summary.exposureTrend, color: "#FF8C00", area: true }]} />
            </div>
          </div>
        </Panel>

        {/* Risk Metrics */}
        <Panel title="Risk Metrics" code="VAR" accent>
          <div className="grid grid-cols-2 divide-x divide-y divide-term-border">
            <Stat label="VaR 95%" value={fmtUsdAbbr(summary.var95)} tone="amber" />
            <Stat label="VaR 99%" value={fmtUsdAbbr(summary.var99)} tone="down" />
            <Stat label="Stress Loss" value={fmtUsdAbbr(summary.stressLoss)} tone="down" />
            <Stat label="Funding Risk" value={fmtPct(summary.fundingRisk * 100, 0)} tone={summary.fundingRisk > 0.75 ? "down" : "amber"} />
          </div>
          <div className="flex flex-col items-center border-t border-term-border py-2">
            <Gauge value={summary.liquidityCoverage} max={200} warn={120} danger={100} label="LIQ COVERAGE" size={140} />
            <div className="tnum text-2xs text-term-text-dim">{fmtPct(summary.liquidityCoverage, 0)} coverage ratio</div>
          </div>
        </Panel>

        {/* Top Clients */}
        <Panel title="Top Clients" code="CLNT" className="xl:col-span-2" right={<Tag tone="neutral">{clients.length} funds</Tag>}>
          <DataGrid columns={clientCols} rows={clients} rowKey={(c) => c.id} maxHeight="340px" initialSort={{ key: "financingRevenue", dir: "desc" }} zebra />
        </Panel>

        {/* Hedge Fund Analytics */}
        <Panel title="Hedge Fund Analytics" code="ANLY">
          <div className="p-2">
            <div className="term-label mb-1">Financing Revenue by Client</div>
            <BarChart horizontal fmt={(n) => fmtUsdAbbr(n)} data={topRev.map((c) => ({ label: c.name, value: c.financingRevenue, color: "#FF8C00" }))} />
            <div className="term-label mb-1 mt-3">Balance-Sheet Consumption</div>
            <BarChart horizontal fmt={(n) => fmtUsdAbbr(n)} data={topBs.map((c) => ({ label: c.name, value: c.balanceSheet, color: "#3B9DFF" }))} />
          </div>
        </Panel>

        {/* Stress Testing */}
        <Panel title="Stress Testing" code="STRESS" className="xl:col-span-2">
          <DataGrid columns={stressCols} rows={scenarios} rowKey={(s) => s.name} maxHeight="260px" initialSort={{ key: "pnl", dir: "asc" }} zebra />
        </Panel>

        {/* Financing Optimization */}
        <Panel title="Financing Optimization" code="OPT" accent right={<Tag tone="up">{opps.length} ops</Tag>}>
          <div className="border-b border-term-border">
            <Stat label="Total Identified Savings" value={fmtUsdAbbr(totalSavings)} sub="annualized, across all opportunities" tone="up" />
          </div>
          <DataGrid columns={oppCols} rows={opps} rowKey={(o, i) => `${o.client}-${o.ticker}-${i}`} maxHeight="300px" initialSort={{ key: "savings", dir: "desc" }} zebra />
        </Panel>
      </div>
    </div>
  );
}
