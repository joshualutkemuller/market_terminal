"use client";

import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { BarChart } from "@/components/charts/BarChart";
import { ProgressBar } from "@/components/charts/Radial";
import {
  getDataOpsSummary,
  getDataQualityIssues,
  getLineageRuns,
  getModuleCoverage,
  getProviderHealth,
  type DataQualityIssue,
  type LineageRun,
  type ModuleCoverage,
  type ProviderHealth,
  type ProviderStatus,
} from "@/data/dataOps";
import { fmtInt, fmtNum, fmtPct } from "@/lib/format";

const STATUS_TONE: Record<ProviderStatus, "up" | "blue" | "amber" | "down" | "neutral"> = {
  LIVE: "up",
  CACHED: "blue",
  SIM: "amber",
  STALE: "neutral",
  ERROR: "down",
};

const ISSUE_TONE: Record<DataQualityIssue["severity"], "down" | "amber" | "neutral"> = {
  HIGH: "down",
  MED: "amber",
  LOW: "neutral",
};

const RUN_TONE: Record<LineageRun["status"], "up" | "amber" | "down"> = {
  OK: "up",
  PARTIAL: "amber",
  FAILED: "down",
};

export default function DataOpsPage() {
  const providers = getProviderHealth();
  const modules = getModuleCoverage();
  const issues = getDataQualityIssues();
  const lineage = getLineageRuns();
  const summary = getDataOpsSummary();

  const providerCols: Column<ProviderHealth>[] = [
    { key: "provider", header: "Provider", render: (r) => <span className="font-semibold text-term-text">{r.provider}</span>, sortVal: (r) => r.provider },
    { key: "status", header: "Status", align: "center", render: (r) => <Tag tone={STATUS_TONE[r.status]}>{r.status}</Tag>, sortVal: (r) => r.status },
    { key: "coverage", header: "Coverage", width: "130px", render: (r) => <ProgressBar value={r.coveragePct} color={r.coveragePct < 65 ? "#FF3B3B" : r.coveragePct < 80 ? "#FF8C00" : "#2ECC71"} showPct />, sortVal: (r) => r.coveragePct },
    { key: "fresh", header: "Fresh", align: "right", render: (r) => <span className="text-term-text-dim">{r.freshnessMin === 0 ? "now" : `${fmtInt(r.freshnessMin)}m`}</span>, sortVal: (r) => r.freshnessMin },
    { key: "series", header: "Series", align: "right", render: (r) => <span className="text-term-text">{fmtInt(r.seriesCount)}</span>, sortVal: (r) => r.seriesCount },
    { key: "failed", header: "Failed", align: "right", render: (r) => <span className={r.failedSeries ? "text-term-down" : "text-term-up"}>{fmtInt(r.failedSeries)}</span>, sortVal: (r) => r.failedSeries },
    { key: "last", header: "Last Run", render: (r) => <span className="text-term-text-mute">{r.lastRun}</span>, sortVal: (r) => r.lastRun },
    { key: "upgrade", header: "Upgrade Path", render: (r) => <span className="text-term-text-dim">{r.upgradePath}</span>, sortVal: (r) => r.upgradePath },
  ];

  const moduleCols: Column<ModuleCoverage>[] = [
    { key: "module", header: "Module", align: "center", render: (r) => <Tag tone="blue">{r.module}</Tag>, sortVal: (r) => r.module },
    { key: "live", header: "Live", align: "right", render: (r) => <span className="text-term-up">{fmtPct(r.livePct, 0)}</span>, sortVal: (r) => r.livePct },
    { key: "cached", header: "Cached", align: "right", render: (r) => <span className="text-term-blue">{fmtPct(r.cachedPct, 0)}</span>, sortVal: (r) => r.cachedPct },
    { key: "sim", header: "Sim", align: "right", render: (r) => <span className="text-term-amber">{fmtPct(r.simPct, 0)}</span>, sortVal: (r) => r.simPct },
    { key: "stale", header: "Stale", align: "right", render: (r) => <span className={r.stalePct ? "text-term-down" : "text-term-text-mute"}>{fmtPct(r.stalePct, 0)}</span>, sortVal: (r) => r.stalePct },
    { key: "readiness", header: "Readiness", width: "130px", render: (r) => <ProgressBar value={r.readiness} color={r.readiness < 55 ? "#FF3B3B" : r.readiness < 75 ? "#FF8C00" : "#2ECC71"} showPct />, sortVal: (r) => r.readiness },
    { key: "blocker", header: "Blocker", render: (r) => <span className="text-term-text-dim">{r.blocker}</span>, sortVal: (r) => r.blocker },
  ];

  const issueCols: Column<DataQualityIssue>[] = [
    { key: "id", header: "ID", render: (r) => <span className="font-mono text-term-text-mute">{r.id}</span>, sortVal: (r) => r.id },
    { key: "severity", header: "Severity", align: "center", render: (r) => <Tag tone={ISSUE_TONE[r.severity]}>{r.severity}</Tag>, sortVal: (r) => r.severity },
    { key: "provider", header: "Provider", align: "center", render: (r) => <Tag tone={r.provider === "FRED" ? "up" : r.provider === "YAHOO" ? "blue" : "amber"}>{r.provider}</Tag>, sortVal: (r) => r.provider },
    { key: "dataset", header: "Dataset", render: (r) => <span className="text-term-text">{r.dataset}</span>, sortVal: (r) => r.dataset },
    { key: "check", header: "Check", render: (r) => <span className="text-term-amber">{r.check}</span>, sortVal: (r) => r.check },
    { key: "detail", header: "Detail", render: (r) => <span className="text-term-text-dim">{r.detail}</span>, sortVal: (r) => r.detail },
    { key: "rows", header: "Rows", align: "right", render: (r) => <span className="text-term-text">{fmtInt(r.rowsImpacted)}</span>, sortVal: (r) => r.rowsImpacted },
  ];

  const lineageCols: Column<LineageRun>[] = [
    { key: "run", header: "Run", render: (r) => <span className="font-mono text-term-text">{r.runId}</span>, sortVal: (r) => r.runId },
    { key: "source", header: "Source", align: "center", render: (r) => <Tag tone={r.source === "FRED" ? "up" : r.source === "YAHOO" ? "blue" : "amber"}>{r.source}</Tag>, sortVal: (r) => r.source },
    { key: "dataset", header: "Dataset", render: (r) => <span className="text-term-text-dim">{r.dataset}</span>, sortVal: (r) => r.dataset },
    { key: "rows", header: "Rows", align: "right", render: (r) => <span className="text-term-text">{fmtInt(r.rows)}</span>, sortVal: (r) => r.rows },
    { key: "started", header: "Started", render: (r) => <span className="text-term-text-mute">{r.started}</span>, sortVal: (r) => r.started },
    { key: "duration", header: "Duration", align: "right", render: (r) => <span className="text-term-text-dim">{fmtInt(r.durationMs)}ms</span>, sortVal: (r) => r.durationMs },
    { key: "status", header: "Status", align: "center", render: (r) => <Tag tone={RUN_TONE[r.status]}>{r.status}</Tag>, sortVal: (r) => r.status },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader code="DATAOPS" title="Data Health & Lineage" desc="Provider status, quality checks and production readiness" right={<Tag tone="blue">ADAPTER READY</Tag>} />

      <KpiStrip>
        <Stat label="Live Providers" value={`${summary.providersLive}/${summary.totalProviders}`} sub="active feeds" tone="up" />
        <Stat label="Avg Coverage" value={fmtPct(summary.averageCoverage, 0)} sub="provider coverage" tone="amber" />
        <Stat label="Failed Series" value={fmtInt(summary.staleSeries)} sub="stale or failed" tone={summary.staleSeries ? "down" : "up"} />
        <Stat label="Quality Issues" value={fmtInt(summary.qualityIssues)} sub="high or medium" tone={summary.qualityIssues ? "down" : "up"} />
        <Stat label="Ready Modules" value={fmtInt(summary.productionReadyModules)} sub="readiness >= 75" />
        <Stat label="Fallback" value="Explicit" sub="synthetic provider visible" tone="amber" />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        <Panel title="Provider Health" code="PROV" className="xl:col-span-3">
          <DataGrid columns={providerCols} rows={providers} rowKey={(r) => r.provider} maxHeight="270px" initialSort={{ key: "coverage", dir: "desc" }} zebra />
        </Panel>

        <Panel title="Module Data Mix" code="MIX" className="xl:col-span-2">
          <DataGrid columns={moduleCols} rows={modules} rowKey={(r) => r.module} maxHeight="320px" initialSort={{ key: "readiness", dir: "desc" }} zebra />
        </Panel>

        <Panel title="Readiness Score" code="READY">
          <div className="p-2">
            <BarChart horizontal data={modules.map((m) => ({ label: m.module, value: m.readiness, color: m.readiness >= 75 ? "#2ECC71" : m.readiness >= 55 ? "#FF8C00" : "#FF3B3B" }))} fmt={(n) => fmtNum(n, 0)} />
          </div>
        </Panel>

        <Panel title="Data Quality Exceptions" code="DQ" className="xl:col-span-3" accent right={<Tag tone="down">{issues.filter((i) => i.severity === "HIGH").length} high</Tag>}>
          <DataGrid columns={issueCols} rows={issues} rowKey={(r) => r.id} maxHeight="260px" initialSort={{ key: "severity", dir: "desc" }} zebra />
        </Panel>

        <Panel title="Latest Lineage Runs" code="RUNS" className="xl:col-span-3">
          <DataGrid columns={lineageCols} rows={lineage} rowKey={(r) => r.runId} maxHeight="260px" initialSort={{ key: "started", dir: "desc" }} zebra />
        </Panel>
      </div>
    </div>
  );
}
