"use client";

import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { ChartLink } from "@/components/charting/ChartLink";
import { BarChart } from "@/components/charts/BarChart";
import { HeatGrid } from "@/components/charts/Matrix";
import {
  getDeskPlaybooks,
  getRegimeExposures,
  getRegimeFactors,
  getRegimeSummary,
  getRegimeTransitions,
  type DeskPlaybook,
  type RegimeExposure,
  type RegimeFactor,
  type RegimeTransition,
} from "@/data/macroRegime";
import { fmtBps, fmtNum, fmtPct, fmtUsdAbbr, pnlClass } from "@/lib/format";

const SIGNAL_TONE: Record<RegimeFactor["signal"], "up" | "amber" | "neutral"> = {
  SUPPORTS: "up",
  CONFLICTS: "amber",
  NEUTRAL: "neutral",
};

const URGENCY_TONE: Record<DeskPlaybook["urgency"], "down" | "amber" | "neutral"> = {
  HIGH: "down",
  MED: "amber",
  LOW: "neutral",
};

const BIAS_TONE: Record<RegimeExposure["recommendedBias"], "up" | "amber" | "down"> = {
  ADD_RISK: "up",
  HOLD: "amber",
  DEFEND: "down",
};

function factorValue(f: RegimeFactor): string {
  if (f.factor.includes("OAS") || f.factor.includes("spread") || f.factor.includes("slope")) return fmtBps(f.value, 0);
  if (f.factor.includes("return") || f.factor.includes("drawdown")) return fmtPct(f.value, 1);
  return fmtNum(f.value, 1);
}

export default function RegimePage() {
  const summary = getRegimeSummary();
  const factors = getRegimeFactors();
  const playbooks = getDeskPlaybooks();
  const transitions = getRegimeTransitions();
  const exposures = getRegimeExposures();

  const factorCols: Column<RegimeFactor>[] = [
    { key: "factor", header: "Factor", render: (r) => <span className="font-semibold text-term-text">{r.factor}</span>, sortVal: (r) => r.factor },
    { key: "source", header: "Source", align: "center", render: (r) => <Tag tone={r.source === "FRED" ? "up" : r.source === "YAHOO" ? "blue" : "neutral"}>{r.source}</Tag>, sortVal: (r) => r.source },
    { key: "value", header: "Value", align: "right", render: (r) => <span className="text-term-text">{factorValue(r)}</span>, sortVal: (r) => r.value },
    { key: "z", header: "Z", align: "right", render: (r) => <span className={pnlClass(r.zScore)}>{fmtNum(r.zScore, 1)}</span>, sortVal: (r) => r.zScore },
    { key: "signal", header: "Signal", align: "center", render: (r) => <Tag tone={SIGNAL_TONE[r.signal]}>{r.signal}</Tag>, sortVal: (r) => r.signal },
    { key: "weight", header: "Weight", align: "right", render: (r) => <span className="text-term-amber">{fmtPct(r.weight, 0)}</span>, sortVal: (r) => r.weight },
    { key: "state", header: "State Link", align: "center", render: (r) => <Tag tone="violet">{r.stateLink.replace("_", " ")}</Tag>, sortVal: (r) => r.stateLink },
  ];

  const playbookCols: Column<DeskPlaybook>[] = [
    { key: "desk", header: "Desk", align: "center", render: (r) => <Tag tone="blue">{r.desk}</Tag>, sortVal: (r) => r.desk },
    { key: "action", header: "Action", render: (r) => <span className="font-semibold text-term-text">{r.action}</span>, sortVal: (r) => r.action },
    { key: "rationale", header: "Rationale", render: (r) => <span className="text-term-text-dim">{r.rationale}</span>, sortVal: (r) => r.rationale },
    { key: "factor", header: "Factor", render: (r) => <span className="text-term-amber">{r.linkedFactor}</span>, sortVal: (r) => r.linkedFactor },
    { key: "impact", header: "Impact", align: "right", render: (r) => <span className="text-term-up">{fmtUsdAbbr(r.expectedImpact)}</span>, sortVal: (r) => r.expectedImpact },
    { key: "urgency", header: "Urg", align: "center", render: (r) => <Tag tone={URGENCY_TONE[r.urgency]}>{r.urgency}</Tag>, sortVal: (r) => r.urgency },
  ];

  const transitionCols: Column<RegimeTransition>[] = [
    { key: "to", header: "Next State", render: (r) => <Tag tone={r.to === "RISK_OFF" || r.to === "RECESSION_WATCH" ? "down" : r.to === "RISK_ON" ? "up" : "amber"}>{r.to.replace("_", " ")}</Tag>, sortVal: (r) => r.to },
    { key: "prob", header: "Prob", align: "right", render: (r) => <span className="text-term-amber">{fmtPct(r.probability, 0)}</span>, sortVal: (r) => r.probability },
    { key: "trigger", header: "Trigger", render: (r) => <span className="text-term-text-dim">{r.trigger}</span>, sortVal: (r) => r.trigger },
  ];

  const exposureCols: Column<RegimeExposure>[] = [
    { key: "desk", header: "Desk", align: "center", render: (r) => <Tag tone="blue">{r.desk}</Tag>, sortVal: (r) => r.desk },
    { key: "carry", header: "Carry", align: "right", render: (r) => <span className={pnlClass(r.carryImpact)}>{fmtUsdAbbr(r.carryImpact)}</span>, sortVal: (r) => r.carryImpact },
    { key: "margin", header: "Margin", align: "right", render: (r) => <span className={pnlClass(r.marginImpact)}>{fmtUsdAbbr(r.marginImpact)}</span>, sortVal: (r) => r.marginImpact },
    { key: "liquidity", header: "Liquidity", align: "right", render: (r) => <span className={pnlClass(r.liquidityImpact)}>{fmtUsdAbbr(r.liquidityImpact)}</span>, sortVal: (r) => r.liquidityImpact },
    { key: "bias", header: "Bias", align: "center", render: (r) => <Tag tone={BIAS_TONE[r.recommendedBias]}>{r.recommendedBias.replace("_", " ")}</Tag>, sortVal: (r) => r.recommendedBias },
  ];

  const matrixLabels = exposures.map((e) => e.desk);
  const matrixValues = exposures.map((e) => [e.carryImpact / 1e6, e.marginImpact / 1e6, e.liquidityImpact / 1e6]);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader code="REGIME" title="Macro Regime Playbook" desc="Macro state to desk-level actions" right={<span className="flex items-center gap-2"><ChartLink refs={[{ source: "econ", id: "UNRATE" }, { source: "econ", id: "T10Y2Y" }, { source: "econ", id: "VIXCLS" }]} range="5Y" /><Tag tone="up">FRED/YAHOO/LOCAL</Tag></span>} />

      <KpiStrip>
        <Stat label="Current State" value={summary.state.replace("_", " ")} sub={`${fmtPct(summary.probability, 0)} confidence`} tone="amber" />
        <Stat label="Risk Score" value={fmtNum(summary.riskScore, 0)} sub="risk appetite" />
        <Stat label="Growth Score" value={fmtNum(summary.growthScore, 0)} sub="growth momentum" tone={summary.growthScore < 50 ? "down" : "up"} />
        <Stat label="Inflation Score" value={fmtNum(summary.inflationScore, 0)} sub="inflation pressure" tone={summary.inflationScore > 60 ? "down" : "neutral"} />
        <Stat label="Liquidity Score" value={fmtNum(summary.liquidityScore, 0)} sub="funding backdrop" tone="up" />
        <Stat label="Policy Bias" value={summary.policyBias} sub={`${summary.activePlaybooks} playbooks`} tone={summary.policyBias === "DOVISH" ? "up" : summary.policyBias === "HAWKISH" ? "down" : "neutral"} />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        <Panel title="Regime Factor Stack" code="FACT" className="xl:col-span-2">
          <DataGrid columns={factorCols} rows={factors} rowKey={(r) => r.factor} maxHeight="300px" initialSort={{ key: "weight", dir: "desc" }} zebra />
        </Panel>

        <Panel title="Factor Weights" code="WGHT">
          <div className="p-2">
            <BarChart horizontal data={factors.map((f) => ({ label: f.factor, value: f.weight, color: f.signal === "SUPPORTS" ? "#2ECC71" : f.signal === "CONFLICTS" ? "#FF8C00" : "#3B9DFF" }))} fmt={(n) => fmtPct(n, 0)} />
          </div>
        </Panel>

        <Panel title="Desk Playbooks" code="PLAY" className="xl:col-span-3" accent right={<Tag tone="down">{playbooks.filter((p) => p.urgency === "HIGH").length} high</Tag>}>
          <DataGrid columns={playbookCols} rows={playbooks} rowKey={(r) => `${r.desk}-${r.action}`} maxHeight="340px" initialSort={{ key: "impact", dir: "desc" }} zebra />
        </Panel>

        <Panel title="Transition Risk" code="TRAN">
          <DataGrid columns={transitionCols} rows={transitions} rowKey={(r) => r.to} maxHeight="260px" initialSort={{ key: "prob", dir: "desc" }} zebra />
        </Panel>

        <Panel title="Desk Exposure Matrix" code="EXPO" className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-[1fr_260px]">
            <DataGrid columns={exposureCols} rows={exposures} rowKey={(r) => r.desk} maxHeight="240px" zebra />
            <HeatGrid rows={matrixLabels} cols={["Carry", "Margin", "Liquidity"]} values={matrixValues} fmt={(n) => fmtUsdAbbr(n * 1e6)} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
