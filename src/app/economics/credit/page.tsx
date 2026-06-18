"use client";

import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { ProgressBar } from "@/components/charts/Radial";
import { useDrill } from "@/components/econ/DrillProvider";
import {
  getCreditCurve, getCreditSummary, getSpreadHistory, getSectorSpreads, getStressEpisodes, getCreditLinkages,
  type CreditRung, type SectorSpread, type CreditStress,
} from "@/data/creditSpreads";
import { fmtNum, fmtSigned, fmtInt, pnlClass } from "@/lib/format";

const REGIME_TONE: Record<string, "up" | "down" | "amber" | "blue"> = { TIGHT: "up", NEUTRAL: "blue", WIDE: "amber", STRESS: "down" };

export default function CreditSpreadsPage() {
  const curve = getCreditCurve();
  const sum = getCreditSummary();
  const hist = getSpreadHistory(18);
  const sectors = getSectorSpreads();
  const stress = getStressEpisodes();
  const links = getCreditLinkages();
  const { open } = useDrill();

  const drill = (r: CreditRung) => open({ id: r.fredId, label: `${r.rating} OAS`, units: "lin", unitLabel: "bps", decimals: 0 });

  const curveCols: Column<CreditRung>[] = [
    { key: "rating", header: "Rating", render: (r) => <span className="font-semibold text-term-text">{r.rating}</span>, sortVal: (r) => r.oas },
    { key: "grade", header: "Grade", render: (r) => <Tag tone={r.grade === "IG" ? "blue" : "amber"}>{r.grade}</Tag> },
    { key: "oas", header: "OAS", align: "right", render: (r) => <span className="font-semibold text-term-amber">{fmtInt(r.oas)}</span>, sortVal: (r) => r.oas },
    { key: "chg1d", header: "Δ 1d", align: "right", render: (r) => <span className={pnlClass(-r.chg1d)}>{fmtSigned(r.chg1d, 0)}</span>, sortVal: (r) => r.chg1d },
    { key: "chg1m", header: "Δ 1m", align: "right", render: (r) => <span className={pnlClass(-r.chg1m)}>{fmtSigned(r.chg1m, 0)}</span>, sortVal: (r) => r.chg1m },
    { key: "yield", header: "Yield", align: "right", render: (r) => <span className="text-term-text">{fmtNum(r.yield, 2)}%</span>, sortVal: (r) => r.yield },
    { key: "pctile", header: "%ile (10y)", align: "right", width: "90px", render: (r) => <ProgressBar value={r.pctile} color={r.pctile > 50 ? "#FF3B3B" : "#2ECC71"} showPct />, sortVal: (r) => r.pctile },
    { key: "z", header: "Z", align: "right", render: (r) => <span className={pnlClass(-r.z)}>{fmtNum(r.z, 2)}</span>, sortVal: (r) => r.z },
    { key: "dur", header: "Sprd Dur", align: "right", render: (r) => <span className="text-term-text-dim">{fmtNum(r.dur, 1)}</span>, sortVal: (r) => r.dur },
  ];

  const sectorCols: Column<SectorSpread>[] = [
    { key: "sector", header: "Sector", render: (s) => <span className="text-term-text">{s.sector}</span>, sortVal: (s) => s.sector },
    { key: "grade", header: "Grade", render: (s) => <Tag tone={s.grade === "IG" ? "blue" : "amber"}>{s.grade}</Tag> },
    { key: "oas", header: "OAS", align: "right", render: (s) => <span className="text-term-amber">{fmtInt(s.oas)}</span>, sortVal: (s) => s.oas },
    { key: "chg1m", header: "Δ 1m", align: "right", render: (s) => <span className={pnlClass(-s.chg1m)}>{fmtSigned(s.chg1m, 0)}</span>, sortVal: (s) => s.chg1m },
  ];

  const stressCols: Column<CreditStress>[] = [
    { key: "name", header: "Episode", render: (s) => <span className="text-term-text">{s.name}</span> },
    { key: "peakIg", header: "Peak IG", align: "right", render: (s) => <span className="text-term-amber">{fmtInt(s.peakIg)}</span>, sortVal: (s) => s.peakIg },
    { key: "peakHy", header: "Peak HY", align: "right", render: (s) => <span className="text-term-down">{fmtInt(s.peakHy)}</span>, sortVal: (s) => s.peakHy },
    { key: "dd", header: "HY Drawdown", align: "right", render: (s) => <span className="text-term-down">{fmtNum(s.drawdownPct, 1)}%</span>, sortVal: (s) => s.drawdownPct },
    { key: "def", header: "Default Pk", align: "right", render: (s) => <span className="text-term-text">{fmtNum(s.defaultPeak, 1)}%</span>, sortVal: (s) => s.defaultPeak },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader code="CRDT" title="Credit Spreads" desc="IG / HY OAS deep dive · curve · stress · sec-finance linkage" right={<Tag tone={REGIME_TONE[sum.regime]}>{sum.regime} REGIME</Tag>} />

      <KpiStrip>
        <Stat label="IG OAS" value={`${fmtInt(sum.igOas)} bps`} sub={<span className={pnlClass(-sum.igChg1d)}>{fmtSigned(sum.igChg1d, 0)} 1d</span>} tone="amber" />
        <Stat label="HY OAS" value={`${fmtInt(sum.hyOas)} bps`} sub={<span className={pnlClass(-sum.hyChg1d)}>{fmtSigned(sum.hyChg1d, 0)} 1d</span>} tone={sum.hyOas > 500 ? "down" : "amber"} />
        <Stat label="HY − IG" value={`${fmtInt(sum.igHySpread)} bps`} sub="credit risk premium" />
        <Stat label="Quality (CCC−BB)" value={`${fmtInt(sum.qualitySpread)} bps`} sub="dispersion / distress" tone={sum.qualitySpread > 450 ? "down" : "neutral"} />
        <Stat label="IG Yield" value={`${fmtNum(sum.igYield, 2)}%`} sub={`HY ${fmtNum(sum.hyYield, 2)}%`} />
        <Stat label="Distress Ratio" value={`${fmtNum(sum.distressRatio, 1)}%`} sub={`${fmtNum(sum.defaultRate, 1)}% TTM default`} tone={sum.distressRatio > 10 ? "down" : "neutral"} />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        <div className="flex flex-col gap-2 xl:col-span-2">
          <Panel title="Credit Curve — OAS by Rating" code="OAS" accent right={<span className="text-3xs text-term-text-mute">click a row → 24m history</span>}>
            <DataGrid columns={curveCols} rows={curve} rowKey={(r) => r.rating} onRowClick={drill} initialSort={{ key: "oas", dir: "asc" }} />
          </Panel>

          <Panel title="Historical OAS — IG vs HY (18y)" code="HIST">
            <div className="p-2">
              <LineChart
                height={210}
                yFmt={(n) => fmtInt(n)}
                labels={hist.map((h) => h.date)}
                series={[
                  { name: "HY OAS", data: hist.map((h) => h.hy), color: "#FF3B3B", area: true },
                  { name: "IG OAS", data: hist.map((h) => h.ig), color: "#FF8C00" },
                ]}
              />
              <div className="mt-1 flex flex-wrap gap-2 px-1 text-3xs text-term-text-mute">
                <span className="flex items-center gap-1"><span className="h-1.5 w-3 bg-term-down" /> HY OAS</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-3 bg-term-amber" /> IG OAS</span>
                <span className="ml-auto">Stress: {[...new Set(hist.map((h) => h.episode).filter(Boolean))].join(" · ")}</span>
              </div>
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            <Panel title="Sector Spreads" code="SEC">
              <DataGrid columns={sectorCols} rows={sectors} rowKey={(s) => s.sector} initialSort={{ key: "oas", dir: "desc" }} maxHeight="260px" />
            </Panel>
            <Panel title="Historical Stress Episodes" code="STRS">
              <DataGrid columns={stressCols} rows={stress} rowKey={(s) => s.name} maxHeight="260px" />
            </Panel>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Panel title="Credit Curve Shape" code="SHAPE">
            <div className="p-2">
              <BarChart data={curve.map((r) => ({ label: r.rating, value: r.oas, color: r.grade === "IG" ? "#FF8C00" : "#FF3B3B" }))} height={160} fmt={(n) => fmtInt(n)} />
              <div className="mt-1 text-3xs text-term-text-mute">OAS rises with credit risk — the slope from BBB→BB is the IG/HY cliff.</div>
            </div>
          </Panel>

          <Panel title="Valuation vs History" code="PCTL">
            <div className="space-y-2 p-3">
              <div>
                <div className="mb-0.5 flex justify-between text-2xs"><span className="text-term-text-dim">IG percentile (10y)</span><span className="tnum text-term-text">{sum.igPctile}%</span></div>
                <ProgressBar value={sum.igPctile} color={sum.igPctile > 50 ? "#FF3B3B" : "#2ECC71"} height={8} />
              </div>
              <div>
                <div className="mb-0.5 flex justify-between text-2xs"><span className="text-term-text-dim">HY percentile (10y)</span><span className="tnum text-term-text">{sum.hyPctile}%</span></div>
                <ProgressBar value={sum.hyPctile} color={sum.hyPctile > 50 ? "#FF3B3B" : "#2ECC71"} height={8} />
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Stat label="BBB − AAA" value={`${fmtInt(sum.bbbAaa)} bps`} className="px-0 py-1" />
                <Stat label="Regime" value={sum.regime} tone={REGIME_TONE[sum.regime] === "down" ? "down" : "amber"} className="px-0 py-1" />
              </div>
              <div className="text-3xs text-term-text-mute">Low percentiles = spreads tight vs history (rich); compression signals complacency / low risk premium.</div>
            </div>
          </Panel>

          <Panel title="Sector OAS Ranking" code="RANK">
            <div className="p-2">
              <BarChart horizontal data={sectors.slice(0, 9).map((s) => ({ label: s.sector, value: s.oas, color: s.grade === "IG" ? "#FF8C00" : "#FF3B3B" }))} fmt={(n) => `${fmtInt(n)}`} />
            </div>
          </Panel>

          <Panel title="Credit → Securities-Finance" code="SFE">
            <div className="divide-y divide-term-border-soft">
              {links.map((l, i) => (
                <div key={i} className="flex items-start gap-2 px-2 py-1.5">
                  <span className={`mt-0.5 text-sm ${l.effect === "up" ? "text-term-up" : "text-term-down"}`}>{l.effect === "up" ? "▲" : "▼"}</span>
                  <div>
                    <div className="text-2xs font-semibold text-term-text">{l.driver}</div>
                    <div className="text-3xs text-term-text-mute">{l.impact}</div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
