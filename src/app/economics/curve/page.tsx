"use client";

import { useState } from "react";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { YieldCurve, type CurveLine } from "@/components/charts/YieldCurve";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { SourceBadge } from "@/components/econ/SourceBadge";
import { useCurveSnapshots } from "@/lib/useEcon";
import {
  getCurveMetrics,
  getInversionStats,
  getSpreadSeriesFor,
  getInversionsForSpread,
  currentSpreadBps,
  spreadDef,
  SPREAD_DEFS,
  type CurveSnapshot,
  type CurvePoint,
  type Inversion,
} from "@/data/econCurve";
import { getTermFundingCarry, type TermFundingCarry } from "@/data/econEnhancements";
import { fmtNum, fmtSigned, fmtBps, fmtUsdAbbr, pnlClass } from "@/lib/format";

const PALETTE = ["#3B9DFF", "#2ECC71", "#A78BFA", "#22D3EE", "#EC4899", "#FFB400"];

/** Distinct, stable color per snapshot id — "now" is always amber. */
function colorFor(id: string, idx: number): string {
  if (id === "now") return "#FF8C00";
  return PALETTE[(idx + PALETTE.length - 1) % PALETTE.length];
}

function shapeTone(shape: string): "up" | "down" | "amber" | "neutral" | "blue" | "violet" {
  if (shape === "Inverted") return "down";
  if (shape === "Steep") return "up";
  if (shape === "Humped") return "violet";
  if (shape === "Flat") return "amber";
  return "neutral";
}

export default function TreasuryCurveLab() {
  // Real point-in-time snapshots (Today + historical) from each tenor's FRED
  // daily history; falls back to the simulated presets without a key.
  const { data: snapshots, source } = useCurveSnapshots();
  const today = snapshots.find((s) => s.id === "now") ?? snapshots[0];
  const todayY = (t: string) => today.points.find((p) => p.tenor === t)?.yield ?? 0;

  // The live "now" curve drives the KPI strip.
  const liveMetrics = getCurveMetrics(today);

  const [overlay, setOverlay] = useState<Set<string>>(new Set(["now", "1y", "2y"]));
  const [focusedId, setFocusedId] = useState<string>("now");
  const [spreadId, setSpreadId] = useState<string>("10Y2Y");
  const focused = snapshots.find((s) => s.id === focusedId) ?? today;
  const focusedMetrics = getCurveMetrics(focused);

  const toggleOverlay = (id: string) => {
    setOverlay((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) next.add("now");
      return next;
    });
  };

  // Build overlay lines in snapshot order so colors stay stable.
  const lines: CurveLine[] = snapshots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => overlay.has(s.id))
    .map(({ s, i }) => ({
      label: s.label,
      color: colorFor(s.id, i),
      dashed: s.id !== "now",
      points: s.points.map((p) => ({ months: p.months, tenor: p.tenor, yield: p.yield })),
    }));

  // Tenor table for the focused snapshot.
  interface TenorRow extends CurvePoint {
    deltaBps: number;
  }
  const tenorRows: TenorRow[] = focused.points.map((p) => ({
    ...p,
    deltaBps: (p.yield - todayY(p.tenor)) * 100,
  }));

  const tenorCols: Column<TenorRow>[] = [
    { key: "tenor", header: "Tenor", render: (r) => <span className="font-semibold text-term-text">{r.tenor}</span>, sortVal: (r) => r.months },
    { key: "fredId", header: "FRED ID", render: (r) => <span className="text-term-text-mute">{r.fredId}</span> },
    { key: "yield", header: "Yield %", align: "right", render: (r) => <span className="text-term-amber">{fmtNum(r.yield, 2)}</span>, sortVal: (r) => r.yield },
    {
      key: "delta",
      header: "Δ vs Today",
      align: "right",
      render: (r) =>
        focused.id === "now" ? (
          <span className="text-term-text-mute">—</span>
        ) : (
          <span className={pnlClass(r.deltaBps)}>{fmtSigned(r.deltaBps, 0)}</span>
        ),
      sortVal: (r) => r.deltaBps,
    },
  ];

  // User-selectable spread for the inversion analysis (default 10Y-2Y).
  const def = spreadDef(spreadId);
  const spreadHist = getSpreadSeriesFor(spreadId);
  const recessionQuarters = spreadHist.filter((d) => d.recession).map((d) => d.date);
  const currentSpread = currentSpreadBps(spreadId, today);
  const termCarry = getTermFundingCarry();

  // Historical inversions of the selected spread.
  const inversions = getInversionsForSpread(spreadId);
  const stats = getInversionStats(spreadId);

  const invCols: Column<Inversion>[] = [
    { key: "inv", header: "Inverted", render: (r) => <span className="text-term-text">{r.invertedDate}</span> },
    { key: "uninv", header: "Un-inverted", render: (r) => <span className="text-term-text-dim">{r.unInvertedDate}</span> },
    { key: "dur", header: "Dur (mo)", align: "right", render: (r) => <span className="text-term-text">{r.durationMonths}</span>, sortVal: (r) => r.durationMonths },
    { key: "depth", header: "Max Depth", align: "right", render: (r) => <span className="text-term-down">{fmtSigned(r.maxDepthBps, 0)}</span>, sortVal: (r) => r.maxDepthBps },
    {
      key: "rec",
      header: "Recession?",
      align: "center",
      render: (r) => (r.recessionFollowed ? <Tag tone="down">RECESSION</Tag> : <Tag tone="up">NO REC</Tag>),
      sortVal: (r) => (r.recessionFollowed ? 1 : 0),
    },
    { key: "recStart", header: "Rec Start", render: (r) => <span className="text-term-text-dim">{r.recessionStart ?? "—"}</span> },
    {
      key: "lead",
      header: "Lead (mo)",
      align: "right",
      render: (r) => <span className="text-term-amber">{r.leadTimeMonths ?? "—"}</span>,
      sortVal: (r) => r.leadTimeMonths ?? -1,
    },
    { key: "note", header: "Note", render: (r) => <span className="text-2xs text-term-text-mute">{r.note}</span> },
  ];

  const carryCols: Column<TermFundingCarry>[] = [
    { key: "tenor", header: "Tenor", align: "center", render: (r) => <Tag tone={r.tenor === "O/N" ? "up" : r.tenor === "6M" ? "amber" : "blue"}>{r.tenor}</Tag>, sortVal: (r) => r.tenor },
    { key: "funding", header: "Funding", align: "right", render: (r) => <span className="text-term-text-dim">{fmtBps(r.fundingBps, 0)}</span>, sortVal: (r) => r.fundingBps },
    { key: "yield", header: "Reinvest", align: "right", render: (r) => <span className="text-term-amber">{fmtBps(r.reinvestYieldBps, 0)}</span>, sortVal: (r) => r.reinvestYieldBps },
    { key: "carry", header: "Carry", align: "right", render: (r) => <span className={pnlClass(r.carryBps)}>{fmtSigned(r.carryBps, 0)}</span>, sortVal: (r) => r.carryBps },
    { key: "cut", header: "After -25", align: "right", render: (r) => <span className={pnlClass(r.cut25CarryBps)}>{fmtSigned(r.cut25CarryBps, 0)}</span>, sortVal: (r) => r.cut25CarryBps },
    { key: "bs", header: "BS Cost", align: "right", render: (r) => <span className="text-term-down">{fmtBps(r.balanceSheetCostBps, 0)}</span>, sortVal: (r) => r.balanceSheetCostBps },
    { key: "pnl", header: "Monthly P&L", align: "right", render: (r) => <span className={pnlClass(r.monthlyPnl)}>{fmtUsdAbbr(r.monthlyPnl)}</span>, sortVal: (r) => r.monthlyPnl },
  ];

  const leadBars = inversions
    .filter((i) => i.leadTimeMonths !== null)
    .map((i) => ({ label: i.id, value: i.leadTimeMonths as number, color: "#3B9DFF" }));
  const depthBars = inversions.map((i) => ({ label: i.id, value: Math.abs(i.maxDepthBps), color: "#FF3B3B" }));

  const spreadBars = [
    { label: "2s10s", value: liveMetrics.s2s10, color: liveMetrics.s2s10 < 0 ? "#FF3B3B" : "#2ECC71" },
    { label: "3m10y", value: liveMetrics.s3m10, color: liveMetrics.s3m10 < 0 ? "#FF3B3B" : "#2ECC71" },
    { label: "5s30s", value: liveMetrics.s5s30, color: liveMetrics.s5s30 < 0 ? "#FF3B3B" : "#2ECC71" },
  ];

  // 2s10s for each overlaid line, for the legend.
  const legendItems = snapshots
    .filter((s) => overlay.has(s.id))
    .map((s) => {
      const idx = snapshots.findIndex((x) => x.id === s.id);
      return { id: s.id, label: s.label, color: colorFor(s.id, idx), s2s10: getCurveMetrics(s).s2s10 };
    });

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        code="CURV"
        title="Treasury Curve Lab"
        desc="Curve shape, history & inversions"
        asOf={today.date}
        right={<SourceBadge source={source} />}
      />

      <KpiStrip>
        <Stat label="10Y" value={`${fmtNum(todayY("10Y"), 2)}%`} sub="DGS10" tone="amber" />
        <Stat label="2Y" value={`${fmtNum(todayY("2Y"), 2)}%`} sub="DGS2" />
        <Stat
          label="2s10s"
          value={fmtBps(liveMetrics.s2s10, 0)}
          sub={liveMetrics.inverted2s10 ? "inverted" : "positive"}
          tone={liveMetrics.inverted2s10 ? "down" : "up"}
        />
        <Stat label="3m10y" value={fmtBps(liveMetrics.s3m10, 0)} sub={liveMetrics.inverted3m10 ? "inverted" : "positive"} tone={liveMetrics.inverted3m10 ? "down" : "up"} />
        <Stat label="Curve Shape" value={<Tag tone={shapeTone(liveMetrics.shape)}>{liveMetrics.shape}</Tag>} sub={`slope ${fmtBps(liveMetrics.slope, 0)}`} />
        <Stat label="Curvature" value={fmtBps(liveMetrics.curvature, 0)} sub="2·5Y − 2Y − 10Y" tone={liveMetrics.curvature < -25 ? "amber" : "neutral"} />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        {/* MAIN curve overlay */}
        <Panel
          title="Yield Curve — Overlay"
          code="CRV"
          accent
          className="xl:col-span-2"
          right={
            <div className="flex flex-wrap items-center gap-1">
              {snapshots.map((s) => (
                <button
                  key={s.id}
                  onClick={() => toggleOverlay(s.id)}
                  className={`term-btn ${overlay.has(s.id) ? "term-btn-active" : ""}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="p-2">
            <YieldCurve lines={lines} height={300} shadeInversion />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-2xs">
              {legendItems.map((l) => (
                <span key={l.id} className="flex items-center gap-1.5">
                  <span className="h-1.5 w-3" style={{ background: l.color }} />
                  <span className="text-term-text-dim">{l.label}</span>
                  <span className={`tnum ${pnlClass(l.s2s10)}`}>2s10s {fmtSigned(l.s2s10, 0)}</span>
                </span>
              ))}
            </div>
          </div>
        </Panel>

        {/* SHAPE ANALYTICS */}
        <Panel title="Shape Analytics" code="SHP">
          <div className="grid grid-cols-3 divide-x divide-term-border border-b border-term-border">
            <Stat label="Level (avg)" value={`${fmtNum(liveMetrics.level, 2)}%`} />
            <Stat label="Slope 30s−1m" value={fmtBps(liveMetrics.slope, 0)} tone={liveMetrics.slope < 0 ? "down" : "up"} />
            <Stat label="Curvature" value={fmtBps(liveMetrics.curvature, 0)} />
          </div>
          <div className="space-y-1 px-3 py-2 text-2xs text-term-text-dim">
            <p><span className="text-term-amber">Level</span> — average yield across all tenors; tracks the overall rate regime.</p>
            <p><span className="text-term-amber">Slope</span> — 30Y minus 1M; positive = upward-sloping, negative = inverted front-to-back.</p>
            <p><span className="text-term-amber">Curvature</span> — belly richness (2·5Y − 2Y − 10Y); negative = humped belly.</p>
          </div>
          <div className="border-t border-term-border px-2 py-2">
            <div className="term-label mb-1 px-1">Key Spreads (bps)</div>
            <BarChart data={spreadBars} horizontal fmt={(n) => fmtSigned(n, 0)} />
          </div>
        </Panel>

        {/* CURVE AT A POINT IN TIME scrubber */}
        <Panel
          title="Curve At A Point In Time"
          code="SCRB"
          className="xl:col-span-2"
          right={
            <span className="flex items-center gap-2 text-3xs text-term-text-mute">
              <span className="tnum rounded-sm border border-term-border bg-term-panel-2 px-1.5 py-px font-semibold uppercase tracking-wide text-term-text-dim">
                AS OF {focused.date}
              </span>
              <span className="hidden md:inline">{focused.regime}</span>
            </span>
          }
        >
          <div className="flex flex-wrap gap-1 border-b border-term-border px-2 py-2">
            {snapshots.map((s) => (
              <button
                key={s.id}
                onClick={() => setFocusedId(s.id)}
                className={`term-btn ${focusedId === s.id ? "term-btn-active" : ""}`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-px bg-term-border sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Level" value={`${fmtNum(focusedMetrics.level, 2)}%`} className="bg-term-panel" />
            <Stat label="Slope" value={fmtBps(focusedMetrics.slope, 0)} className="bg-term-panel" tone={focusedMetrics.slope < 0 ? "down" : "up"} />
            <Stat label="Curvature" value={fmtBps(focusedMetrics.curvature, 0)} className="bg-term-panel" />
            <Stat label="Shape" value={<Tag tone={shapeTone(focusedMetrics.shape)}>{focusedMetrics.shape}</Tag>} className="bg-term-panel" />
            <Stat label="2s10s" value={fmtBps(focusedMetrics.s2s10, 0)} className="bg-term-panel" tone={focusedMetrics.inverted2s10 ? "down" : "up"} />
            <Stat label="3m10y" value={fmtBps(focusedMetrics.s3m10, 0)} className="bg-term-panel" tone={focusedMetrics.inverted3m10 ? "down" : "up"} />
          </div>
          <DataGrid columns={tenorCols} rows={tenorRows} rowKey={(r) => r.tenor} maxHeight="240px" initialSort={{ key: "tenor", dir: "asc" }} />
        </Panel>

        {/* INVERSION TIMELINE */}
        <Panel
          title={`${def.label} Inversion Timeline`}
          code="HIST"
          right={
            <div className="flex items-center gap-2">
              <span className={`tnum text-2xs ${pnlClass(currentSpread)}`}>{fmtSigned(currentSpread, 0)}bps</span>
              <select
                value={spreadId}
                onChange={(e) => setSpreadId(e.target.value)}
                className="border border-term-border bg-term-panel-3 px-1.5 py-0.5 text-2xs text-term-amber outline-none hover:border-term-amber"
                title="Choose curve spread to analyze"
              >
                {SPREAD_DEFS.map((s) => (
                  <option key={s.id} value={s.id} className="bg-term-panel text-term-text">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <div className="p-2">
            <LineChart
              series={[{ name: def.label, data: spreadHist.map((d) => d.value), color: "#FF8C00", area: true }]}
              labels={spreadHist.map((d) => d.date)}
              height={200}
              yFmt={(n) => `${n.toFixed(0)}`}
            />
            <div className="mt-1 px-1 text-3xs text-term-text-mute">
              <span className="text-term-amber">{def.label}</span> ({def.desc}) in bps; values below the{" "}
              <span className="text-term-down">zero line</span> mark inverted regimes ({def.longT} below {def.shortT}).
            </div>
            <div className="mt-1 px-1 text-3xs text-term-text-dim">
              <span className="text-term-text-mute">Recession quarters:</span>{" "}
              <span className="tnum">{recessionQuarters.join(" · ") || "none in window"}</span>
            </div>
          </div>
        </Panel>

        {/* HISTORICAL INVERSIONS */}
        <Panel title={`Historical Inversions — ${def.label}`} code="INVT" accent className="xl:col-span-2">
          <div className="grid grid-cols-2 divide-x divide-term-border border-b border-term-border sm:grid-cols-4">
            <Stat label="Recession Hit-Rate" value={`${fmtNum(stats.recessionRate, 0)}%`} sub={`${stats.total} inversions`} tone="down" />
            <Stat label="Avg Lead" value={`${fmtNum(stats.avgLeadMonths, 1)} mo`} sub={`${stats.minLeadMonths}–${stats.maxLeadMonths} mo range`} tone="amber" />
            <Stat label="Deepest" value={fmtBps(stats.deepestBps, 0)} sub={`avg ${fmtBps(stats.avgDepthBps, 0)}`} tone="down" />
            <Stat label="Longest" value={`${stats.longestMonths} mo`} sub="duration" />
          </div>
          <DataGrid columns={invCols} rows={inversions} rowKey={(r) => r.id} maxHeight="260px" initialSort={{ key: "inv", dir: "asc" }} />
          <div className="grid grid-cols-1 gap-px border-t border-term-border bg-term-border sm:grid-cols-2">
            <div className="bg-term-panel px-2 py-2">
              <div className="term-label mb-1 px-1">Lead Time To Recession (mo)</div>
              <BarChart data={leadBars} horizontal fmt={(n) => `${n.toFixed(0)}`} />
            </div>
            <div className="bg-term-panel px-2 py-2">
              <div className="term-label mb-1 px-1">Max Inversion Depth (bps)</div>
              <BarChart data={depthBars} horizontal fmt={(n) => `-${n.toFixed(0)}`} />
            </div>
          </div>
        </Panel>

        {/* PLAYBOOK */}
        <Panel title="Curve Inversion Playbook" code="PLAY">
          <ul className="space-y-2 px-3 py-2 text-2xs text-term-text-dim">
            <li className="flex gap-2">
              <span className="text-term-amber">▸</span>
              <span>
                Since the mid-1970s, <span className="text-term-amber">{fmtNum(stats.recessionRate, 0)}%</span> of <span className="text-term-amber">{def.label}</span> inversions
                preceded an NBER recession, with an average lead of <span className="text-term-amber">{fmtNum(stats.avgLeadMonths, 1)} months</span>{" "}
                (range {stats.minLeadMonths}–{stats.maxLeadMonths}mo) — a slow, not immediate, signal.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-term-amber">▸</span>
              <span>
                The selected <span className="text-term-amber">{def.label}</span> spread is <span className={pnlClass(currentSpread)}>{fmtSigned(currentSpread, 0)}bps</span>;
                2s10s is <span className={pnlClass(liveMetrics.s2s10)}>{fmtSigned(liveMetrics.s2s10, 0)}bps</span> and 3m10y is{" "}
                <span className={pnlClass(liveMetrics.s3m10)}>{fmtSigned(liveMetrics.s3m10, 0)}bps</span>; the curve reads{" "}
                <span className="text-term-amber">{liveMetrics.shape}</span>
                {liveMetrics.inverted2s10 ? " — still flashing the classic warning." : " — having re-steepened out of inversion."}
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-term-amber">▸</span>
              <span>
                Depth & duration matter: the deepest inversion ran <span className="text-term-down">{fmtBps(stats.deepestBps, 0)}</span> and the
                longest lasted <span className="text-term-amber">{stats.longestMonths}mo</span> (2022–24, which has so far avoided a recession — the lone soft-landing case).
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-term-amber">▸</span>
              <span>
                Watch the <span className="text-term-amber">re-steepening</span>: recessions historically begin <em>after</em> the curve dis-inverts, not while inverted — the un-inversion is the tighter timing trigger.
              </span>
            </li>
          </ul>
        </Panel>

        <Panel title="Term Funding Carry - O/N vs 1M/3M/6M" code="CARRY" accent className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-2 p-2 lg:grid-cols-[1.2fr_0.8fr]">
            <DataGrid columns={carryCols} rows={termCarry} rowKey={(r) => r.tenor} maxHeight="220px" initialSort={{ key: "pnl", dir: "desc" }} zebra />
            <BarChart horizontal data={termCarry.map((r) => ({ label: r.tenor, value: r.monthlyPnl, color: r.monthlyPnl >= 0 ? "#2ECC71" : "#FF3B3B" }))} fmt={(n) => fmtUsdAbbr(n)} />
          </div>
          <div className="border-t border-term-border px-2 py-1.5 text-2xs text-term-text-mute">
            Carry = reinvestment yield minus funding and balance-sheet charge. This feeds REINV ladder choices and CASH funding path costs.
          </div>
        </Panel>
      </div>
    </div>
  );
}
