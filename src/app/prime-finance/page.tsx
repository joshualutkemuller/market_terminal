
import clsx from "clsx";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { Donut, Gauge, ProgressBar } from "@/components/charts/Radial";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import {
  getPrimeClients,
  getPrimeSummary,
  getFinancingOpportunities,
  computeMarginPressure,
  computeFinancingOverlay,
  computeDetailedShocks,
  computeBsConditions,
  type PrimeClient,
  type FinancingRiskOverlay,
  type DetailedShock,
  type BsConditionRow,
  type FinancingOpp,
} from "@/data/primeFinance";
import { getMarketConditions } from "@/data/marketConditions";
import { fmtAbbr, fmtUsdAbbr, fmtNum, fmtBps, fmtPct, fmtSigned, fmtSignedPct, pnlClass } from "@/lib/format";

const OPP_TONE: Record<FinancingOpp["type"], "blue" | "amber" | "violet"> = {
  INTERNALIZE: "blue",
  CHEAPEN_FINANCE: "amber",
  BS_OPTIMIZE: "violet",
};

const PRESSURE_TONE = { Low: "up", Elevated: "amber", High: "down", Critical: "down" } as const;
const SENS_TONE = { Low: "up", Med: "amber", High: "down" } as const;

function ratingTone(r: string): "up" | "amber" | "down" {
  if (r.startsWith("A")) return "up";
  if (r.startsWith("B")) return "amber";
  return "down";
}

export default function PrimeFinancePage() {
  const summary = getPrimeSummary();
  const clients = getPrimeClients();
  const cond = getMarketConditions();
  const margin = computeMarginPressure(cond);
  const overlay = computeFinancingOverlay(clients, cond);
  const shocks = computeDetailedShocks(summary);
  const bsRows = computeBsConditions(summary);
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

  const overlayCols: Column<FinancingRiskOverlay>[] = [
    { key: "client", header: "Client", render: (r) => <span className="font-semibold text-term-text">{r.client}</span>, sortVal: (r) => r.client },
    { key: "rating", header: "Rating", align: "center", render: (r) => <Tag tone={ratingTone(r.rating)}>{r.rating}</Tag>, sortVal: (r) => r.rating },
    { key: "gross", header: "Gross", align: "right", render: (r) => <span className="text-term-text-dim">{fmtUsdAbbr(r.gross)}</span>, sortVal: (r) => r.gross },
    { key: "sensitivity", header: "Sensitivity", align: "center", render: (r) => <Tag tone={SENS_TONE[r.sensitivity]}>{r.sensitivity}</Tag>, sortVal: (r) => r.sensitivity },
    { key: "fundingCostDelta", header: "Fund Cost Δ", align: "right", render: (r) => <span className={pnlClass(-r.fundingCostDelta)}>{fmtBps(r.fundingCostDelta, 1)}</span>, sortVal: (r) => r.fundingCostDelta },
    { key: "marginCallRisk", header: "Margin Risk", align: "right", render: (r) => <span className={r.marginCallRisk >= 60 ? "text-term-down" : "text-term-text"}>{r.marginCallRisk}/100</span>, sortVal: (r) => r.marginCallRisk },
    { key: "bsUtilShift", header: "BS Util Δ", align: "right", render: (r) => <span className={pnlClass(-r.bsUtilShift)}>{fmtSignedPct(r.bsUtilShift, 1)}</span>, sortVal: (r) => r.bsUtilShift },
    { key: "action", header: "Action", render: (r) => <span className="text-term-text-dim">{r.action}</span>, sortVal: (r) => r.action },
  ];

  const shockCols: Column<DetailedShock>[] = [
    { key: "name", header: "Scenario", render: (s) => <span className="font-semibold text-term-text">{s.name}</span>, sortVal: (s) => s.name },
    { key: "equityShock", header: "Equity", align: "right", render: (s) => <span className={pnlClass(s.equityShock)}>{fmtSignedPct(s.equityShock, 0)}</span>, sortVal: (s) => s.equityShock },
    { key: "creditShock", header: "Credit", align: "right", render: (s) => <span className={pnlClass(-s.creditShock)}>{fmtSigned(s.creditShock, 0)}bps</span>, sortVal: (s) => s.creditShock },
    { key: "volShock", header: "Vol", align: "right", render: (s) => <span className={pnlClass(-s.volShock)}>{fmtSigned(s.volShock, 0)}pts</span>, sortVal: (s) => s.volShock },
    { key: "rateShock", header: "Rates", align: "right", render: (s) => <span className="text-term-text-dim">{fmtSigned(s.rateShock, 0)}bps</span>, sortVal: (s) => s.rateShock },
    { key: "pnlImpact", header: "P&L", align: "right", render: (s) => <span className="text-term-down">{fmtUsdAbbr(s.pnlImpact)}</span>, sortVal: (s) => s.pnlImpact },
    { key: "marginCall", header: "Margin Call", align: "right", render: (s) => <span className="text-term-amber">{fmtUsdAbbr(s.marginCall)}</span>, sortVal: (s) => s.marginCall },
    { key: "liquidityDays", header: "Liq Days", align: "right", render: (s) => <span className="text-term-text-dim">{fmtNum(s.liquidityDays, 1)}d</span>, sortVal: (s) => s.liquidityDays },
    { key: "roaShift", header: "RoA Δ", align: "right", render: (s) => <span className={pnlClass(s.roaShift)}>{fmtBps(s.roaShift, 0)}</span>, sortVal: (s) => s.roaShift },
  ];

  const bsCols: Column<BsConditionRow>[] = [
    { key: "condition", header: "Financing Condition", render: (r) => <Tag tone={r.tone}>{r.condition}</Tag>, sortVal: (r) => r.condition },
    { key: "conditionedRoa", header: "Cond. RoA", align: "right", render: (r) => <span className="text-term-amber">{fmtBps(r.conditionedRoa, 0)}</span>, sortVal: (r) => r.conditionedRoa },
    { key: "roaDelta", header: "RoA Δ", align: "right", render: (r) => <span className={pnlClass(r.conditionedRoa - r.currentRoa)}>{fmtBps(r.conditionedRoa - r.currentRoa, 0)}</span>, sortVal: (r) => r.conditionedRoa - r.currentRoa },
    { key: "conditionedUtil", header: "Cond. Util", align: "right", render: (r) => <span className="text-term-text">{fmtPct(r.conditionedUtil, 0)}</span>, sortVal: (r) => r.conditionedUtil },
    { key: "revenueImpact", header: "Rev Impact", align: "right", render: (r) => <span className={pnlClass(r.revenueImpact)}>{fmtUsdAbbr(r.revenueImpact)}</span>, sortVal: (r) => r.revenueImpact },
    { key: "bsCapacity", header: "BS Capacity", align: "right", render: (r) => <span className="text-term-text-dim">{fmtUsdAbbr(r.bsCapacity)}</span>, sortVal: (r) => r.bsCapacity },
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
      <PageHeader
        code="PB"
        title="Prime Finance"
        desc="Hedge Fund Financing · Risk · Market-Conditioned Analytics"
        right={<ProvenanceBadge source="SIM" />}
      />

      <KpiStrip>
        <Stat label="Gross Exposure" value={fmtUsdAbbr(summary.grossExposure)} sub={`${summary.clientCount} clients`} />
        <Stat label="Net Exposure" value={fmtUsdAbbr(summary.netExposure)} sub={`Long ${fmtUsdAbbr(summary.longExposure)}`} />
        <Stat label="Financing Revenue" value={fmtUsdAbbr(summary.financingRevenue)} sub="annualized" tone="amber" />
        <Stat label="Margin Pressure" value={`${margin.score}`} sub={`0–100 · ${margin.regime}`} tone={PRESSURE_TONE[margin.regime]} />
        <Stat label="1d VaR 95%" value={fmtUsdAbbr(summary.var95)} sub={`99% ${fmtUsdAbbr(summary.var99)}`} />
        <Stat label="Vol Regime" value={cond.equityVolRegime} sub={`VIX ${cond.vix.toFixed(1)}`} tone={cond.vix >= 22 ? "down" : cond.vix >= 16 ? "amber" : "up"} />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        {/* Margin Pressure Gauge */}
        <div className="xl:col-span-1">
          <Panel title="Margin Pressure Score" code="MRGN" accent right={<Tag tone={PRESSURE_TONE[margin.regime]}>{margin.regime}</Tag>}>
            <div className="p-3">
              <div className="flex items-end justify-between">
                <span className="tnum text-3xl font-bold text-term-text">{margin.score}</span>
                <span className="text-2xs text-term-text-mute">/ 100</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-sm bg-term-panel-3">
                <div
                  className={clsx("h-full rounded-sm", margin.score >= 75 ? "bg-term-down" : margin.score >= 50 ? "bg-term-down/70" : margin.score >= 30 ? "bg-term-amber" : "bg-term-up")}
                  style={{ width: `${margin.score}%` }}
                />
              </div>
              <p className="mt-3 text-2xs leading-relaxed text-term-text-dim">{margin.readThrough}</p>
              <div className="mt-3 flex flex-col gap-1.5">
                {margin.components.map((c) => (
                  <div key={c.label} className="grid grid-cols-[110px_1fr_56px] items-center gap-2 text-3xs">
                    <span className="text-term-text-mute">{c.label}</span>
                    <div className="h-1.5 overflow-hidden rounded-sm bg-term-panel-3">
                      <div className={clsx("h-full rounded-sm", c.contribution >= 65 ? "bg-term-down" : c.contribution >= 35 ? "bg-term-amber" : "bg-term-up")} style={{ width: `${c.contribution}%` }} />
                    </div>
                    <span className="tnum text-right text-term-text-dim">{c.detail}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 border-t border-term-border-soft pt-2 text-3xs text-term-text-mute">
                Blends equity drawdown (25%), credit widening (25%), vol (20%), funding stress (18%), bank funding (12%).
                Source: deterministic market conditions model.
              </div>
            </div>
          </Panel>
        </div>

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

        {/* Client Financing Risk Overlay */}
        <Panel
          title="Client Financing Risk Overlay"
          code="FROV"
          className="xl:col-span-3"
          accent
          right={<span className="text-3xs text-term-text-mute">sensitivity to current funding regime ({cond.liquidityRegime.toLowerCase()}) · VIX {cond.vix.toFixed(0)} · HY {cond.hyOas.toFixed(0)}bps</span>}
        >
          <DataGrid columns={overlayCols} rows={overlay} rowKey={(r) => r.client} maxHeight="340px" initialSort={{ key: "marginCallRisk", dir: "desc" }} zebra />
        </Panel>

        {/* Scenario Shocks */}
        <Panel
          title="Scenario Shock Matrix"
          code="SHOCK"
          className="xl:col-span-2"
          right={<Tag tone="down">{shocks.filter((s) => s.pnlImpact < -summary.grossExposure * 0.05).length} severe</Tag>}
        >
          <DataGrid columns={shockCols} rows={shocks} rowKey={(s) => s.name} maxHeight="340px" initialSort={{ key: "pnlImpact", dir: "asc" }} zebra />
        </Panel>

        {/* BS Utilization by Financing Condition */}
        <Panel title="BS Utilization by Condition" code="BSCN" accent right={<span className="text-3xs text-term-text-mute">RoA & capacity across funding regimes</span>}>
          <DataGrid columns={bsCols} rows={bsRows} rowKey={(r) => r.condition} maxHeight="340px" zebra />
          <div className="border-t border-term-border p-2">
            <div className="term-label mb-1">Conditioned RoA</div>
            <BarChart
              horizontal
              data={bsRows.map((r) => ({ label: r.condition, value: r.conditionedRoa, color: r.tone === "up" ? "#2ECC71" : r.tone === "down" ? "#FF3B3B" : "#FF8C00" }))}
              fmt={(n) => fmtBps(n, 0)}
            />
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

        {/* Financing Optimization */}
        <Panel title="Financing Optimization" code="OPT" accent className="xl:col-span-3" right={<Tag tone="up">{opps.length} ops · {fmtUsdAbbr(totalSavings)} savings</Tag>}>
          <DataGrid columns={oppCols} rows={opps} rowKey={(o, i) => `${o.client}-${o.ticker}-${i}`} maxHeight="300px" initialSort={{ key: "savings", dir: "desc" }} zebra />
        </Panel>
      </div>
    </div>
  );
}
