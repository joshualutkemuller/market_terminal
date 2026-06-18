"use client";

import { useState } from "react";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { CorrelationMatrix, HeatGrid } from "@/components/charts/Matrix";
import { ScatterPlot } from "@/components/charts/ScatterPlot";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { SourceBadge } from "@/components/econ/SourceBadge";
import { useEconStats } from "@/lib/useEcon";
import { ols, histogram, moments, rollingCorr, acf, diff } from "@/lib/stats";
import { fmtNum, pnlClass } from "@/lib/format";

function Sel({ value, onChange, labels }: { value: number; onChange: (n: number) => void; labels: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="border border-term-border bg-term-panel-3 px-1.5 py-0.5 text-2xs text-term-amber outline-none hover:border-term-amber"
    >
      {labels.map((l, i) => (
        <option key={l} value={i} className="bg-term-panel text-term-text">{l}</option>
      ))}
    </select>
  );
}

export default function StatisticalAnalysis() {
  const { data: p, source } = useEconStats();
  const labels = p.labels;
  const [xIdx, setX] = useState(2); // 2s10s
  const [yIdx, setY] = useState(7); // HY OAS
  const [distIdx, setDist] = useState(0);
  const [rA, setRA] = useState(0);
  const [rB, setRB] = useState(3);
  const [acfIdx, setAcf] = useState(4);

  const n = labels.length;
  const months = p.dates.length;

  const pairs: { a: string; b: string; r: number }[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pairs.push({ a: labels[i], b: labels[j], r: p.corr[i][j] });
  const byCorr = [...pairs].sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
  const strongestPos = [...pairs].sort((x, y) => y.r - x.r)[0];
  const strongestNeg = [...pairs].sort((x, y) => x.r - y.r)[0];
  const stationaryCount = p.stationarity.filter((s) => s.stationary).length;

  // regression (client-side from aligned matrix)
  const xs = p.matrix[xIdx] ?? [];
  const ys = p.matrix[yIdx] ?? [];
  const reg = ols(xs, ys);
  const scatter = xs.map((x, i) => ({ x, y: ys[i] }));

  // distribution of monthly changes
  const dvals = diff(p.matrix[distIdx] ?? []);
  const hist = histogram(dvals, 13);
  const mo = moments(dvals);
  const latestZ = dvals.length ? (dvals[dvals.length - 1] - mo.mean) / (mo.sd || 1) : 0;

  const roll = rollingCorr(p.matrix[rA] ?? [], p.matrix[rB] ?? [], 12);
  const ac = acf(p.matrix[acfIdx] ?? [], 12);

  const statCols: Column<(typeof p.descstats)[number]>[] = [
    { key: "label", header: "Series", render: (r) => <span className="text-term-text">{r.label}</span> },
    { key: "mean", header: "Mean", align: "right", render: (r) => <span className="text-term-text-dim">{fmtNum(r.mean, 2)}</span>, sortVal: (r) => r.mean },
    { key: "sd", header: "Std Dev", align: "right", render: (r) => <span className="text-term-text-dim">{fmtNum(r.sd, 2)}</span>, sortVal: (r) => r.sd },
    { key: "skew", header: "Skew", align: "right", render: (r) => <span className={pnlClass(r.skew)}>{fmtNum(r.skew, 2)}</span>, sortVal: (r) => r.skew },
    { key: "kurt", header: "Ex.Kurt", align: "right", render: (r) => <span className="text-term-text">{fmtNum(r.kurtosis, 2)}</span>, sortVal: (r) => r.kurtosis },
    { key: "acf1", header: "AR(1)", align: "right", render: (r) => <span className="text-term-amber">{fmtNum(r.acf1, 2)}</span>, sortVal: (r) => r.acf1 },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        code="STAT"
        title="Statistical Analysis"
        desc="Correlation · Granger causality · regression · stationarity · distributions"
        right={<SourceBadge source={source} />}
      />

      <KpiStrip>
        <Stat label="Series" value={n} sub={`${months} monthly obs`} tone="amber" />
        <Stat label="Strongest +Corr" value={strongestPos ? fmtNum(strongestPos.r, 2) : "—"} sub={strongestPos ? `${strongestPos.a}/${strongestPos.b}` : ""} tone="up" />
        <Stat label="Strongest −Corr" value={strongestNeg ? fmtNum(strongestNeg.r, 2) : "—"} sub={strongestNeg ? `${strongestNeg.a}/${strongestNeg.b}` : ""} tone="down" />
        <Stat label="Granger Links" value={p.links.length} sub={`F-test · lag ${p.lag} · 5%`} />
        <Stat label="Stationary (ADF)" value={`${stationaryCount}/${n}`} sub="5% sig" />
        <Stat label="Regression R²" value={fmtNum(reg.r2, 2)} sub={`${labels[xIdx]}→${labels[yIdx]}`} tone="amber" />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        {/* Correlation + Granger */}
        <div className="flex flex-col gap-2">
          <Panel title="Correlation Matrix" code="CORR">
            <div className="p-2">
              <CorrelationMatrix labels={labels} values={p.corr} height={250} />
              <div className="mt-1 text-3xs text-term-text-mute">Pearson, monthly levels. Top: {byCorr.slice(0, 3).map((c) => `${c.a}/${c.b} ${fmtNum(c.r, 2)}`).join(" · ")}</div>
            </div>
          </Panel>

          <Panel title="Granger Causality — F(row → col)" code="GRNG" accent>
            <div className="p-2">
              <HeatGrid rows={labels} cols={labels} values={p.grangerF} fmt={(v) => (v ? v.toFixed(1) : "·")} height={220} />
              <div className="mt-1 text-3xs text-term-text-mute">
                F-test, lag {p.lag}, on first-differenced series. Higher F ⇒ row has stronger predictive (Granger) causality on column.
              </div>
            </div>
          </Panel>

          <Panel title="Significant Causal Links" code="CAUSE">
            <div className="max-h-[180px] divide-y divide-term-border-soft overflow-auto">
              {p.links.length === 0 && <div className="px-2 py-3 text-center text-2xs text-term-text-mute">None significant at 5%</div>}
              {p.links.map((l, i) => (
                <div key={i} className="flex items-center justify-between px-2 py-1 text-2xs">
                  <span className="text-term-text">
                    <span className="text-term-blue">{l.from}</span> <span className="text-term-text-mute">Granger-causes</span> <span className="text-term-amber">{l.to}</span>
                  </span>
                  <span className="tnum text-term-text-dim">F {fmtNum(l.fStat, 1)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* Regression + Distribution */}
        <div className="flex flex-col gap-2">
          <Panel
            title="OLS Regression"
            code="REG"
            right={
              <div className="flex items-center gap-1 text-3xs text-term-text-mute">
                <span>Y</span><Sel value={yIdx} onChange={setY} labels={labels} />
                <span>~ X</span><Sel value={xIdx} onChange={setX} labels={labels} />
              </div>
            }
          >
            <div className="p-2">
              <ScatterPlot points={scatter} fit={{ slope: reg.slope, intercept: reg.intercept }} xLabel={labels[xIdx]} yLabel={labels[yIdx]} height={210} />
              <div className="mt-1 grid grid-cols-4 divide-x divide-term-border border-t border-term-border">
                <Stat label="β (slope)" value={fmtNum(reg.slope, 3)} className="px-2 py-1" />
                <Stat label="R²" value={fmtNum(reg.r2, 3)} className="px-2 py-1" tone="amber" />
                <Stat label="t-stat" value={fmtNum(reg.tStat, 2)} sub={Math.abs(reg.tStat) > 2 ? "sig" : "ns"} className="px-2 py-1" tone={Math.abs(reg.tStat) > 2 ? "up" : "neutral"} />
                <Stat label="n" value={reg.n} className="px-2 py-1" />
              </div>
            </div>
          </Panel>

          <Panel title="Change Distribution" code="DIST" right={<Sel value={distIdx} onChange={setDist} labels={labels} />}>
            <div className="p-2">
              <BarChart data={hist.map((b) => ({ label: b.center.toFixed(1), value: b.count, color: "#3B9DFF" }))} height={150} />
              <div className="mt-1 grid grid-cols-4 divide-x divide-term-border border-t border-term-border">
                <Stat label="Mean Δ" value={fmtNum(mo.mean, 2)} className="px-2 py-1" />
                <Stat label="Std Dev" value={fmtNum(mo.sd, 2)} className="px-2 py-1" />
                <Stat label="Skew/Kurt" value={`${fmtNum(mo.skew, 1)}/${fmtNum(mo.kurtosis, 1)}`} className="px-2 py-1" />
                <Stat label="Latest Z" value={fmtNum(latestZ, 2)} className="px-2 py-1" tone={Math.abs(latestZ) > 2 ? "down" : "neutral"} />
              </div>
            </div>
          </Panel>
        </div>

        {/* Rolling corr, ACF, stationarity, descriptive */}
        <div className="flex flex-col gap-2">
          <Panel
            title="Rolling Correlation (12m)"
            code="ROLL"
            right={
              <div className="flex items-center gap-1 text-3xs text-term-text-mute">
                <Sel value={rA} onChange={setRA} labels={labels} /><span>×</span><Sel value={rB} onChange={setRB} labels={labels} />
              </div>
            }
          >
            <div className="p-2">
              <LineChart height={140} series={[{ name: "rho", data: roll, color: "#A78BFA", area: true }]} yFmt={(v) => v.toFixed(2)} />
              <div className="mt-1 text-3xs text-term-text-mute">12-month rolling Pearson — surfaces regime shifts in co-movement.</div>
            </div>
          </Panel>

          <Panel title="Autocorrelation (ACF)" code="ACF" right={<Sel value={acfIdx} onChange={setAcf} labels={labels} />}>
            <div className="p-2">
              <BarChart data={ac.map((v, i) => ({ label: `${i + 1}`, value: v, color: Math.abs(v) > 0.3 ? "#FF8C00" : "#3B9DFF" }))} height={130} />
              <div className="mt-1 text-3xs text-term-text-mute">ACF by lag (months); slow decay ⇒ persistent / non-stationary.</div>
            </div>
          </Panel>

          <Panel title="Stationarity (ADF)" code="ADF">
            <div className="max-h-[150px] divide-y divide-term-border-soft overflow-auto">
              {p.stationarity.map((s) => (
                <div key={s.label} className="flex items-center justify-between px-2 py-1 text-2xs">
                  <span className="text-term-text">{s.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="tnum text-term-text-dim">{fmtNum(s.stat, 2)}</span>
                    <Tag tone={s.stationary ? "up" : "amber"}>{s.stationary ? "STATIONARY" : "UNIT ROOT"}</Tag>
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Descriptive Statistics" code="DESC">
            <DataGrid columns={statCols} rows={p.descstats} rowKey={(r) => r.label} initialSort={{ key: "sd", dir: "desc" }} maxHeight="200px" />
          </Panel>
        </div>
      </div>
    </div>
  );
}
