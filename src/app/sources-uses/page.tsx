
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { NetworkGraph } from "@/components/charts/NetworkGraph";
import { Sankey } from "@/components/charts/Sankey";
import { HeatGrid } from "@/components/charts/Matrix";
import { Gauge, ProgressBar } from "@/components/charts/Radial";
import {
  getSources,
  getUses,
  getMatches,
  getSxuSummary,
  type SourceNode,
  type UseNode,
  type MatchRow,
} from "@/data/sourcesUses";
import { fmtUsdAbbr, fmtAbbr, fmtNum } from "@/lib/format";

const SRC_CAT_TONE: Record<SourceNode["category"], "amber" | "blue" | "up" | "violet"> = {
  INTERNAL_INV: "amber",
  CLIENT_INV: "blue",
  LENDING_INV: "violet",
  TREASURY_CASH: "up",
};

const USE_CAT_TONE: Record<UseNode["category"], "down" | "blue" | "amber" | "violet"> = {
  SHORT_DEMAND: "down",
  MARGIN_REQ: "amber",
  FINANCING_DEMAND: "blue",
  SETTLEMENT: "violet",
};

export default function SourcesUses() {
  const sources = getSources();
  const uses = getUses();
  const matches = getMatches();
  const sum = getSxuSummary();

  const srcCols: Column<SourceNode>[] = [
    { key: "label", header: "Source", render: (r) => <span className="text-term-text">{r.label}</span> },
    { key: "cat", header: "Category", render: (r) => <Tag tone={SRC_CAT_TONE[r.category]}>{r.category.replace("_", " ")}</Tag> },
    { key: "amount", header: "Amount", align: "right", sortVal: (r) => r.amount, render: (r) => <span className="text-term-text">{fmtUsdAbbr(r.amount)}</span> },
    { key: "cost", header: "Cost", align: "right", sortVal: (r) => r.costBps, render: (r) => <span className="text-term-amber">{fmtNum(r.costBps, 1)} bps</span> },
  ];

  const useCols: Column<UseNode>[] = [
    { key: "label", header: "Use", render: (r) => <span className="text-term-text">{r.label}</span> },
    { key: "cat", header: "Category", render: (r) => <Tag tone={USE_CAT_TONE[r.category]}>{r.category.replace("_", " ")}</Tag> },
    { key: "amount", header: "Amount", align: "right", sortVal: (r) => r.amount, render: (r) => <span className="text-term-text">{fmtUsdAbbr(r.amount)}</span> },
    { key: "bid", header: "Bid", align: "right", sortVal: (r) => r.bidBps, render: (r) => <span className="text-term-up">{fmtNum(r.bidBps, 1)} bps</span> },
  ];

  const matchCols: Column<MatchRow>[] = [
    { key: "source", header: "Source", className: (r) => (r.internalized ? "border-l-2 border-l-term-up/60" : "border-l-2 border-l-transparent"), render: (r) => <span className="text-term-text">{r.source}</span> },
    { key: "arrow", header: "", width: "16px", render: () => <span className="text-term-text-mute">→</span> },
    { key: "use", header: "Use", render: (r) => <span className="text-term-text">{r.use}</span> },
    { key: "asset", header: "Asset", render: (r) => <span className="text-term-text-dim">{r.asset}</span> },
    { key: "amount", header: "Amount", align: "right", sortVal: (r) => r.amount, render: (r) => <span className="text-term-text">{fmtUsdAbbr(r.amount)}</span> },
    {
      key: "internalized",
      header: "Internalized",
      align: "center",
      sortVal: (r) => (r.internalized ? 1 : 0),
      render: (r) => <Tag tone={r.internalized ? "up" : "neutral"}>{r.internalized ? "INTERNAL" : "EXTERNAL"}</Tag>,
    },
    { key: "saving", header: "Funding Saving", align: "right", sortVal: (r) => r.fundingSavingBps, render: (r) => <span className="text-term-up">{fmtNum(r.fundingSavingBps, 1)} bps</span> },
    { key: "rev", header: "Revenue Impact", align: "right", sortVal: (r) => r.revenueImpact, render: (r) => <span className="text-term-amber">{fmtUsdAbbr(r.revenueImpact)}</span> },
  ];

  // Network graph: sources -> ENGINE -> uses
  const graphNodes = [
    ...sources.map((s) => ({ id: s.id, label: s.label.length > 20 ? s.label.slice(0, 18) + "…" : s.label, group: "SOURCE" as const })),
    { id: "ENGINE", label: "MATCHING ENGINE", group: "ENGINE" as const, size: 30 },
    ...uses.map((u) => ({ id: u.id, label: u.label.length > 20 ? u.label.slice(0, 18) + "…" : u.label, group: "USE" as const })),
  ];
  const graphEdges = [
    ...sources.map((s) => ({ source: s.id, target: "ENGINE", value: s.amount })),
    ...uses.map((u) => ({ source: "ENGINE", target: u.id, value: u.amount })),
  ];

  // Sankey: sources -> uses from matches (aggregate by source+use label)
  const flowMap = new Map<string, number>();
  matches.forEach((m) => {
    const k = `${m.source}|||${m.use}`;
    flowMap.set(k, (flowMap.get(k) ?? 0) + m.amount);
  });
  const trim = (s: string) => (s.length > 20 ? s.slice(0, 18) + "…" : s);
  const sankeyNodes = [
    ...sources.map((s) => ({ id: `S:${s.label}`, label: trim(s.label), col: 0 })),
    ...uses.map((u) => ({ id: `U:${u.label}`, label: trim(u.label), col: 1 })),
  ];
  const sankeyLinks = Array.from(flowMap.entries()).map(([k, value]) => {
    const [src, use] = k.split("|||");
    return { source: `S:${src}`, target: `U:${use}`, value };
  });

  // Heat map: source label rows x use label cols, aggregated matched amounts
  const heatRows = sources.map((s) => s.label);
  const heatCols = uses.map((u) => u.label);
  const heatValues = sources.map((s) =>
    uses.map((u) => matches.filter((m) => m.source === s.label && m.use === u.label).reduce((a, m) => a + m.amount, 0))
  );

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader code="SXU" title="Sources & Uses" desc="Matching · Internalization · Funding Savings" right={<ProvenanceBadge source="SIM" />} />

      <KpiStrip>
        <Stat label="Total Sources" value={fmtUsdAbbr(sum.totalSources)} sub={`${sources.length} pools`} />
        <Stat label="Total Uses" value={fmtUsdAbbr(sum.totalUses)} sub={`${uses.length} demands`} />
        <Stat label="Matched" value={fmtUsdAbbr(sum.matched)} sub={`${matches.length} matches`} tone="up" />
        <Stat label="Internalization" value={`${fmtNum(sum.internalizationRate, 1)}%`} sub="of matched flow" />
        <Stat label="Funding Savings" value={fmtUsdAbbr(sum.fundingSavings)} sub="cross-desk" tone="amber" />
        <Stat label="Unmatched Demand" value={fmtUsdAbbr(sum.unmatchedDemand)} sub="open" tone="down" />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        {/* Network centerpiece */}
        <Panel title="Matching Engine — Sources → Engine → Uses" code="NET" accent className="xl:col-span-3">
          <div className="p-2">
            <NetworkGraph nodes={graphNodes} edges={graphEdges} height={340} />
            <div className="mt-1 flex gap-4 px-1 text-2xs">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-term-blue" /> Sources</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-term-amber" /> Matching Engine</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-term-up" /> Uses</span>
            </div>
          </div>
        </Panel>

        {/* Sources & Uses side panels */}
        <Panel title="Sources" code="SRC" right={<Tag tone="blue">{sources.length}</Tag>}>
          <DataGrid columns={srcCols} rows={sources} rowKey={(r) => r.id} maxHeight="240px" initialSort={{ key: "amount", dir: "desc" }} zebra />
        </Panel>

        <Panel title="Uses" code="USE" right={<Tag tone="amber">{uses.length}</Tag>}>
          <DataGrid columns={useCols} rows={uses} rowKey={(r) => r.id} maxHeight="240px" initialSort={{ key: "amount", dir: "desc" }} zebra />
        </Panel>

        {/* Summary tiles */}
        <Panel title="Engine Summary" code="SUM">
          <div className="flex flex-col gap-2 p-2">
            <div className="flex items-center gap-3">
              <Gauge value={sum.internalizationRate} max={100} size={104} label="Internalization" warn={40} danger={20} />
              <div className="flex-1">
                <div className="term-label">Internalization Rate</div>
                <ProgressBar value={sum.internalizationRate} max={100} showPct height={8} />
              </div>
            </div>
            <div className="grid grid-cols-2 divide-x divide-term-border border-t border-term-border">
              <Stat label="Revenue Impact" value={fmtUsdAbbr(sum.revenueImpact)} tone="amber" />
              <Stat label="Unmatched Demand" value={fmtUsdAbbr(sum.unmatchedDemand)} tone="down" />
            </div>
          </div>
        </Panel>

        {/* Match recommendations */}
        <Panel title="Match Recommendations" code="MATCH" accent className="xl:col-span-3" right={<Tag tone="up">{matches.filter((m) => m.internalized).length} INTERNAL</Tag>}>
          <DataGrid
            columns={matchCols}
            rows={matches}
            rowKey={(r, i) => `${r.source}-${r.use}-${i}`}
            maxHeight="300px"
            initialSort={{ key: "rev", dir: "desc" }}
            zebra
          />
        </Panel>

        {/* Sankey alternate flow */}
        <Panel title="Allocation Flow — Sources → Uses" code="FLOW" className="xl:col-span-2">
          <div className="p-2">
            <Sankey nodes={sankeyNodes} links={sankeyLinks} height={320} />
          </div>
        </Panel>

        {/* Heat map */}
        <Panel title="Allocation Heat Map" code="HEAT">
          <div className="p-1">
            <HeatGrid rows={heatRows} cols={heatCols} values={heatValues} fmt={(n) => (n ? fmtAbbr(n) : "—")} height={320} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
