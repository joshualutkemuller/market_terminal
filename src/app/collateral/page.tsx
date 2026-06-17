"use client";

import { useState } from "react";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { BarChart } from "@/components/charts/BarChart";
import { ProgressBar } from "@/components/charts/Radial";
import {
  getCollateralAssets,
  getMarginBook,
  getCollateralSummary,
  getConstraints,
  type CollateralAsset,
  type MarginRow,
  type Constraint,
} from "@/data/collateral";
import { fmtAbbr, fmtUsdAbbr, fmtNum, fmtPct, fmtBps, pnlClass } from "@/lib/format";

const AGREEMENT_TONE: Record<MarginRow["agreement"], "blue" | "amber" | "violet" | "neutral"> = {
  "ISDA-CSA": "blue",
  GMRA: "amber",
  MSLA: "violet",
  CCP: "neutral",
};

const CONSTRAINT_TONE: Record<Constraint["type"], "blue" | "amber" | "violet" | "down" | "neutral"> = {
  HAIRCUT: "blue",
  CONCENTRATION: "amber",
  ELIGIBILITY: "violet",
  REGULATORY: "down",
  COUNTERPARTY: "neutral",
};

function assetTone(t: CollateralAsset["type"]): "up" | "blue" | "amber" | "violet" | "down" | "neutral" {
  if (t.startsWith("CASH")) return "up";
  if (t === "UST" || t === "AGENCY") return "blue";
  if (t === "CORP_IG") return "amber";
  if (t === "CORP_HY") return "down";
  if (t === "GOLD") return "violet";
  return "neutral";
}

export default function CollateralPage() {
  const summary = getCollateralSummary();
  const margin = getMarginBook();
  const assets = getCollateralAssets();
  const constraints = getConstraints();

  const savingsGenerated = summary.currentCost - summary.optimizedCost;
  const bindingConstraints = constraints.filter((c) => c.binding);

  // What-If: adjust concentration cap and cash buffer; recompute plausible savings.
  const [concCap, setConcCap] = useState(25);
  const [cashBuffer, setCashBuffer] = useState(8);
  const [whatIf, setWhatIf] = useState<{ savings: number; cost: number } | null>(null);

  function rerun() {
    // Relaxing the concentration cap above 25 and lowering the cash buffer below 8
    // both create slack that the optimizer can monetize. Tightening does the reverse.
    const concSlack = (concCap - 25) / 25; // +ve = more headroom
    const bufferSlack = (8 - cashBuffer) / 8; // +ve = lower buffer requirement
    const uplift = 1 + Math.max(-0.4, Math.min(0.5, concSlack * 0.6 + bufferSlack * 0.5));
    const newSavings = savingsGenerated * uplift;
    const newCost = summary.currentCost - newSavings;
    setWhatIf({ savings: newSavings, cost: newCost });
  }

  const marginCols: Column<MarginRow>[] = [
    { key: "counterparty", header: "Counterparty", render: (m) => <span className="font-semibold text-term-text">{m.counterparty}</span>, sortVal: (m) => m.counterparty },
    { key: "agreement", header: "Agreement", align: "center", render: (m) => <Tag tone={AGREEMENT_TONE[m.agreement]}>{m.agreement}</Tag>, sortVal: (m) => m.agreement },
    { key: "rating", header: "Rating", align: "center", render: (m) => <span className="text-term-text-dim">{m.rating}</span>, sortVal: (m) => m.rating },
    { key: "im", header: "IM", align: "right", render: (m) => <span className="text-term-text">{fmtUsdAbbr(m.im)}</span>, sortVal: (m) => m.im },
    { key: "vm", header: "VM", align: "right", render: (m) => <span className={pnlClass(m.vm)}>{fmtUsdAbbr(m.vm)}</span>, sortVal: (m) => m.vm },
    { key: "posted", header: "Posted", align: "right", render: (m) => <span className="text-term-text-dim">{fmtUsdAbbr(m.posted)}</span>, sortVal: (m) => m.posted },
    {
      key: "excess",
      header: "Excess/Deficit",
      align: "right",
      render: (m) => <span className={m.excess < 0 ? "text-term-down" : "text-term-up"}>{fmtUsdAbbr(m.excess)}</span>,
      sortVal: (m) => m.excess,
    },
  ];

  const assetCols: Column<CollateralAsset>[] = [
    { key: "asset", header: "Asset", render: (a) => <span className="font-semibold text-term-text">{a.asset}</span>, sortVal: (a) => a.asset },
    { key: "type", header: "Type", align: "center", render: (a) => <Tag tone={assetTone(a.type)}>{a.type}</Tag>, sortVal: (a) => a.type },
    { key: "available", header: "Available", align: "right", render: (a) => <span className="text-term-text-dim">{fmtUsdAbbr(a.available)}</span>, sortVal: (a) => a.available },
    { key: "haircut", header: "Haircut", align: "right", render: (a) => <span className="text-term-text-dim">{fmtPct(a.haircut, 1)}</span>, sortVal: (a) => a.haircut },
    { key: "currentAlloc", header: "Current", align: "right", render: (a) => <span className="text-term-text">{fmtUsdAbbr(a.currentAlloc)}</span>, sortVal: (a) => a.currentAlloc },
    { key: "optimizedAlloc", header: "Optimized", align: "right", render: (a) => <span className="text-term-amber">{fmtUsdAbbr(a.optimizedAlloc)}</span>, sortVal: (a) => a.optimizedAlloc },
    {
      key: "delta",
      header: "Δ",
      align: "right",
      render: (a) => {
        const d = a.optimizedAlloc - a.currentAlloc;
        return <span className={pnlClass(d)}>{`${d >= 0 ? "+" : ""}${fmtUsdAbbr(d)}`}</span>;
      },
      sortVal: (a) => a.optimizedAlloc - a.currentAlloc,
    },
    { key: "costBps", header: "Cost", align: "right", render: (a) => <span className="text-term-text-dim">{fmtBps(a.costBps, 1)}</span>, sortVal: (a) => a.costBps },
    { key: "eligiblePct", header: "Eligible", align: "right", render: (a) => <span className="text-term-text-dim">{fmtPct(a.eligiblePct, 0)}</span>, sortVal: (a) => a.eligiblePct },
  ];

  const constraintCols: Column<Constraint>[] = [
    { key: "name", header: "Constraint", render: (c) => <span className="text-term-text">{c.name}</span>, sortVal: (c) => c.name },
    { key: "type", header: "Type", align: "center", render: (c) => <Tag tone={CONSTRAINT_TONE[c.type]}>{c.type}</Tag>, sortVal: (c) => c.type },
    { key: "current", header: "Current", align: "right", render: (c) => <span className="text-term-text">{fmtNum(c.current, 1)}</span>, sortVal: (c) => c.current },
    { key: "limit", header: "Limit", align: "right", render: (c) => <span className="text-term-text-dim">{fmtNum(c.limit, 1)}</span>, sortVal: (c) => c.limit },
    {
      key: "usage",
      header: "Usage",
      align: "right",
      width: "120px",
      render: (c) => <ProgressBar value={c.current} max={c.limit} color={c.binding ? "#FF3B3B" : "#2ECC71"} showPct />,
      sortVal: (c) => c.current / c.limit,
    },
    { key: "status", header: "Status", align: "center", render: (c) => <Tag tone={c.binding ? "down" : "up"}>{c.binding ? "BINDING" : "SLACK"}</Tag>, sortVal: (c) => (c.binding ? 1 : 0) },
    { key: "shadow", header: "Shadow Price", align: "right", render: (c) => (c.binding ? <span className="text-term-amber">{fmtUsdAbbr(c.shadowPrice)}</span> : <span className="text-term-text-mute">—</span>), sortVal: (c) => c.shadowPrice },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader code="COLL" title="Collateral Management" desc="Margin · Optimization · Constraints · What-If" />

      <KpiStrip>
        <Stat label="Total IM" value={fmtUsdAbbr(summary.totalIM)} sub="initial margin" />
        <Stat label="Total VM" value={fmtUsdAbbr(summary.totalVM)} sub="variation margin" />
        <Stat label="Excess Collateral" value={fmtUsdAbbr(summary.excessCollateral)} sub="posted surplus" tone="up" />
        <Stat label="Deficit" value={fmtUsdAbbr(summary.deficit)} sub={`${summary.deficitCount} counterparties`} tone="down" />
        <Stat label="Optimized Savings" value={fmtUsdAbbr(summary.optimizedSavings)} sub="vs current allocation" tone="amber" />
        <Stat label="Utilization" value={fmtPct(summary.utilizationPct, 1)} sub="collateral pool" />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        {/* Margin Overview */}
        <Panel title="Margin Overview" code="MRGN" className="xl:col-span-2" right={<Tag tone={summary.deficitCount > 0 ? "down" : "up"}>{summary.deficitCount} deficits</Tag>}>
          <div className="grid grid-cols-3 divide-x divide-term-border border-b border-term-border">
            <Stat label="Total IM" value={fmtUsdAbbr(summary.totalIM)} />
            <Stat label="Total VM" value={fmtUsdAbbr(summary.totalVM)} />
            <Stat label="Net Excess" value={fmtUsdAbbr(summary.excessCollateral + summary.deficit)} tone={summary.excessCollateral + summary.deficit < 0 ? "down" : "up"} />
          </div>
          <DataGrid columns={marginCols} rows={margin} rowKey={(m) => m.counterparty} maxHeight="320px" initialSort={{ key: "excess", dir: "asc" }} zebra />
        </Panel>

        {/* Optimization summary */}
        <Panel title="Optimization Result" code="OPT" accent>
          <div className="border-b border-term-border">
            <Stat label="Savings Generated" value={fmtUsdAbbr(savingsGenerated)} sub="current cost − optimized cost" tone="up" />
          </div>
          <div className="grid grid-cols-2 divide-x divide-term-border border-b border-term-border">
            <Stat label="Current Cost" value={fmtUsdAbbr(summary.currentCost)} tone="down" />
            <Stat label="Optimized Cost" value={fmtUsdAbbr(summary.optimizedCost)} tone="amber" />
          </div>
          <div className="p-2">
            <div className="term-label mb-1">Cost Reduction</div>
            <ProgressBar value={summary.optimizedCost} max={summary.currentCost} color="#2ECC71" height={9} showPct />
            <div className="mt-1 tnum text-2xs text-term-text-dim">
              Optimized cost is {fmtPct((summary.optimizedCost / summary.currentCost) * 100, 1)} of current.
            </div>
          </div>
        </Panel>

        {/* Allocation grid */}
        <Panel title="Optimization Dashboard" code="ALLOC" className="xl:col-span-2">
          <DataGrid columns={assetCols} rows={assets} rowKey={(a) => a.asset} maxHeight="320px" initialSort={{ key: "optimizedAlloc", dir: "desc" }} zebra />
        </Panel>

        {/* Current vs Optimized compare */}
        <Panel title="Current vs Optimized" code="CMP">
          <div className="grid grid-cols-2 gap-2 p-2">
            <div>
              <div className="term-label mb-1 text-term-text-dim">Current</div>
              <BarChart horizontal fmt={(n) => fmtUsdAbbr(n)} data={assets.map((a) => ({ label: a.asset, value: a.currentAlloc, color: "#3B9DFF" }))} />
            </div>
            <div>
              <div className="term-label mb-1 text-term-amber">Optimized</div>
              <BarChart horizontal fmt={(n) => fmtUsdAbbr(n)} data={assets.map((a) => ({ label: a.asset, value: a.optimizedAlloc, color: "#FF8C00" }))} />
            </div>
          </div>
        </Panel>

        {/* Constraints */}
        <Panel title="Optimization Constraints" code="CSTR" className="xl:col-span-2" right={<Tag tone="down">{bindingConstraints.length} binding</Tag>}>
          <DataGrid columns={constraintCols} rows={constraints} rowKey={(c) => c.name} maxHeight="320px" initialSort={{ key: "usage", dir: "desc" }} zebra />
        </Panel>

        {/* Shadow prices */}
        <Panel title="Shadow Prices / Dual Values" code="DUAL">
          <div className="p-2">
            {bindingConstraints.length > 0 ? (
              <BarChart horizontal fmt={(n) => fmtUsdAbbr(n)} data={bindingConstraints.map((c) => ({ label: c.name, value: c.shadowPrice, color: "#FF8C00" }))} />
            ) : (
              <div className="py-6 text-center text-2xs text-term-text-mute">No binding constraints.</div>
            )}
            <div className="mt-2 border-t border-term-border-soft pt-1.5 text-2xs text-term-text-dim">
              Dual value = marginal savings per unit of constraint relaxation.
            </div>
          </div>
        </Panel>

        {/* What-If */}
        <Panel title="What-If Analysis" code="SCEN" accent className="xl:col-span-3">
          <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-3">
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-1 flex justify-between text-2xs">
                  <span className="text-term-text-dim">Concentration Cap (UST)</span>
                  <span className="tnum text-term-amber">{fmtPct(concCap, 1)}</span>
                </div>
                <input
                  type="range"
                  min={15}
                  max={40}
                  step={0.5}
                  value={concCap}
                  onChange={(e) => setConcCap(Number(e.target.value))}
                  className="w-full accent-term-amber"
                />
                <div className="flex justify-between text-3xs text-term-text-mute">
                  <span>15%</span>
                  <span>base 25%</span>
                  <span>40%</span>
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-2xs">
                  <span className="text-term-text-dim">Min Cash Buffer</span>
                  <span className="tnum text-term-amber">{fmtPct(cashBuffer, 1)}</span>
                </div>
                <input
                  type="range"
                  min={2}
                  max={15}
                  step={0.5}
                  value={cashBuffer}
                  onChange={(e) => setCashBuffer(Number(e.target.value))}
                  className="w-full accent-term-amber"
                />
                <div className="flex justify-between text-3xs text-term-text-mute">
                  <span>2%</span>
                  <span>base 8%</span>
                  <span>15%</span>
                </div>
              </div>
              <button
                onClick={rerun}
                className="mt-1 rounded-sm border border-term-amber/40 bg-term-amber/10 px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-term-amber hover:bg-term-amber/20"
              >
                Re-run Optimization
              </button>
            </div>

            <div className="grid grid-cols-2 gap-px self-start bg-term-border lg:col-span-2">
              <Stat label="Baseline Savings" value={fmtUsdAbbr(savingsGenerated)} sub="current model" tone="up" className="bg-term-panel" />
              <Stat
                label="Scenario Savings"
                value={whatIf ? fmtUsdAbbr(whatIf.savings) : "—"}
                sub={whatIf ? "after re-run" : "run to compute"}
                tone="amber"
                className="bg-term-panel"
              />
              <Stat label="Baseline Cost" value={fmtUsdAbbr(summary.currentCost)} sub="unoptimized" tone="down" className="bg-term-panel" />
              <Stat
                label="Scenario Cost"
                value={whatIf ? fmtUsdAbbr(whatIf.cost) : "—"}
                sub={
                  whatIf ? (
                    <span className={pnlClass(savingsGenerated - whatIf.savings === 0 ? 0 : whatIf.savings - savingsGenerated)}>
                      {`${whatIf.savings - savingsGenerated >= 0 ? "+" : ""}${fmtUsdAbbr(whatIf.savings - savingsGenerated)} vs base`}
                    </span>
                  ) : (
                    "run to compute"
                  )
                }
                className="bg-term-panel"
              />
              <div className="col-span-2 bg-term-panel p-2">
                <div className="term-label mb-1">Savings: Baseline vs Scenario</div>
                <BarChart
                  horizontal
                  fmt={(n) => fmtUsdAbbr(n)}
                  data={[
                    { label: "Baseline", value: savingsGenerated, color: "#3B9DFF" },
                    { label: "Scenario", value: whatIf ? whatIf.savings : savingsGenerated, color: "#FF8C00" },
                  ]}
                />
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
