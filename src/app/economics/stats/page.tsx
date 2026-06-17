"use client";

import { useState } from "react";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { CorrelationMatrix } from "@/components/charts/Matrix";
import { ScatterPlot } from "@/components/charts/ScatterPlot";
import { BarChart } from "@/components/charts/BarChart";
import {
  getCorrelationMatrix,
  getRegression,
  getDistribution,
  REGIME_STATES,
} from "@/data/econModels";
import { fmtNum, fmtSigned } from "@/lib/format";

const SERIES_IDS: { id: string; label: string }[] = [
  { id: "DGS10", label: "10Y" },
  { id: "DGS2", label: "2Y" },
  { id: "FEDFUNDS", label: "EFFR" },
  { id: "CPIAUCSL", label: "CPI" },
  { id: "UNRATE", label: "U-3" },
  { id: "T10Y2Y", label: "2s10s" },
  { id: "BAMLH0A0HYM2", label: "HY OAS" },
  { id: "SOFR", label: "SOFR" },
];

interface CorrPair {
  a: string;
  b: string;
  v: number;
}

function topAbsPairs(labels: string[], values: number[][], n: number): CorrPair[] {
  const pairs: CorrPair[] = [];
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      pairs.push({ a: labels[i], b: labels[j], v: values[i][j] });
    }
  }
  return pairs.sort((p, q) => Math.abs(q.v) - Math.abs(p.v)).slice(0, n);
}

const REGIME_DESC: Record<string, string> = {
  Goldilocks: "Above-trend growth, falling/contained inflation — risk-on, tight credit spreads.",
  Reflation: "Accelerating growth and rising inflation — steepening curve, cyclical leadership.",
  Slowdown: "Decelerating growth, easing inflation — defensive tilt, curve bull-steepening.",
  Stagflation: "Weak growth with sticky/high inflation — widening spreads, hawkish policy risk.",
};

export default function StatisticalAnalysis() {
  const corr = getCorrelationMatrix();
  const top = topAbsPairs(corr.labels, corr.values, 3);
  const allPairs = topAbsPairs(corr.labels, corr.values, corr.labels.length * corr.labels.length);
  const bestPos = allPairs.filter((p) => p.v > 0).sort((a, b) => b.v - a.v)[0];
  const bestNeg = allPairs.filter((p) => p.v < 0).sort((a, b) => a.v - b.v)[0];

  const [xId, setXId] = useState("T10Y2Y");
  const [yId, setYId] = useState("BAMLH0A0HYM2");
  const reg = getRegression(xId, yId);
  const tSig = Math.abs(reg.tStat) > 2;

  const defaultDist = getDistribution();

  const [distId, setDistId] = useState("DGS10");
  const dist = getDistribution(distId);
  const zAbs = Math.abs(dist.latestZ);
  const zOutlier = zAbs > 2;
  const distLabel = SERIES_IDS.find((s) => s.id === distId)?.label ?? distId;

  const selectCls =
    "tnum border border-term-border bg-term-panel-2 px-1.5 py-0.5 text-2xs text-term-text focus:border-term-amber focus:outline-none";

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        code="STAT"
        title="Statistical Analysis"
        desc="Correlations, regressions, regimes & distributions"
      />

      <KpiStrip>
        <Stat label="Series Analyzed" value={corr.labels.length} sub="macro series" tone="amber" />
        <Stat
          label="Strongest +Corr"
          value={fmtNum(bestPos?.v ?? 0, 2)}
          sub={bestPos ? `${bestPos.a} · ${bestPos.b}` : "—"}
          tone="up"
        />
        <Stat
          label="Strongest -Corr"
          value={fmtNum(bestNeg?.v ?? 0, 2)}
          sub={bestNeg ? `${bestNeg.a} · ${bestNeg.b}` : "—"}
          tone="down"
        />
        <Stat label="Regression R²" value={fmtNum(reg.r2, 3)} sub={`${reg.xLabel} → ${reg.yLabel}`} />
        <Stat label="Regression β" value={fmtNum(reg.beta, 3)} sub={`t ${fmtNum(reg.tStat, 2)}`} />
        <Stat
          label="Latest Z-Score"
          value={fmtSigned(defaultDist.latestZ, 2)}
          sub="ΔDGS10 vs hist"
          tone={Math.abs(defaultDist.latestZ) > 2 ? "amber" : "neutral"}
        />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        {/* Correlation matrix */}
        <div className="flex flex-col gap-2 xl:col-span-1">
          <Panel title="Correlation Matrix" code="CORR" accent>
            <div className="p-2">
              <CorrelationMatrix labels={corr.labels} values={corr.values} height={300} />
              <p className="mt-1 text-3xs leading-relaxed text-term-text-mute">
                Pairwise Pearson correlation over the most recent 60 observations. Green = positive
                co-movement, red = inverse. Diagonal is self-correlation (1.00).
              </p>
              <div className="mt-2 border-t border-term-border pt-1">
                <div className="term-label mb-1 px-0.5">Top 3 |Correlations|</div>
                {top.map((p) => (
                  <div
                    key={`${p.a}-${p.b}`}
                    className="flex items-center justify-between px-0.5 py-0.5 text-2xs"
                  >
                    <span className="text-term-text-dim">
                      {p.a} <span className="text-term-text-mute">×</span> {p.b}
                    </span>
                    <Tag tone={p.v >= 0 ? "up" : "down"}>{fmtNum(p.v, 2)}</Tag>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* Regime panel */}
          <Panel title="Macro Regime Map" code="REGM">
            <div className="p-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xs text-term-text-dim">Implied current regime</span>
                <Tag tone="amber">Slowdown → Goldilocks transition</Tag>
              </div>
              <p className="mb-2 text-3xs leading-relaxed text-term-text-mute">
                Rationale: decelerating growth momentum with easing inflation trend favors a Slowdown
                read, but resilient labor and tightening credit spreads keep a Goldilocks path open —
                hence a transitional classification.
              </p>
              <table className="w-full border-collapse">
                <tbody className="tnum">
                  {REGIME_STATES.map((s, i) => (
                    <tr key={s} className="border-b border-term-border-soft align-top">
                      <td className="px-1 py-1 text-2xs font-semibold text-term-amber">
                        {String(i)} · {s}
                      </td>
                      <td className="px-1 py-1 text-3xs leading-relaxed text-term-text-dim">
                        {REGIME_DESC[s]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        {/* Regression */}
        <div className="flex flex-col gap-2 xl:col-span-1">
          <Panel
            title="OLS Regression"
            code="REGR"
            right={<Tag tone={tSig ? "up" : "neutral"}>{tSig ? "SIGNIFICANT" : "NS"}</Tag>}
          >
            <div className="p-2">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-2xs text-term-text-mute">
                <label className="flex items-center gap-1">
                  X
                  <select className={selectCls} value={xId} onChange={(e) => setXId(e.target.value)}>
                    {SERIES_IDS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  Y
                  <select className={selectCls} value={yId} onChange={(e) => setYId(e.target.value)}>
                    {SERIES_IDS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <ScatterPlot
                points={reg.points}
                height={240}
                xLabel={reg.xLabel}
                yLabel={reg.yLabel}
                fit={{ slope: reg.slope, intercept: reg.intercept }}
              />
              <div className="mt-2 grid grid-cols-2 gap-px bg-term-border sm:grid-cols-4">
                <Stat label="Slope / β" value={fmtNum(reg.beta, 3)} className="bg-term-panel" />
                <Stat label="Intercept" value={fmtNum(reg.intercept, 2)} className="bg-term-panel" />
                <Stat label="R²" value={fmtNum(reg.r2, 3)} className="bg-term-panel" tone="amber" />
                <Stat
                  label="t-Stat"
                  value={fmtNum(reg.tStat, 2)}
                  sub={tSig ? "|t|>2" : "|t|≤2"}
                  tone={tSig ? "up" : "down"}
                  className="bg-term-panel"
                />
              </div>
              <p className="mt-1 text-3xs leading-relaxed text-term-text-mute">
                OLS of {reg.yLabel} on {reg.xLabel} over 60 observations. Amber dashed line is the
                fitted regression.
              </p>
            </div>
          </Panel>
        </div>

        {/* Distribution */}
        <div className="flex flex-col gap-2 xl:col-span-1">
          <Panel
            title="Distribution of Changes"
            code="DIST"
            right={
              zOutlier ? (
                <Tag tone={zAbs > 3 ? "down" : "amber"}>OUTLIER {fmtSigned(dist.latestZ, 1)}σ</Tag>
              ) : (
                <Tag tone="neutral">{fmtSigned(dist.latestZ, 1)}σ</Tag>
              )
            }
          >
            <div className="p-2">
              <div className="mb-2 flex items-center gap-2 text-2xs text-term-text-mute">
                <label className="flex items-center gap-1">
                  Series
                  <select
                    className={selectCls}
                    value={distId}
                    onChange={(e) => setDistId(e.target.value)}
                  >
                    {SERIES_IDS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <span>Period-over-period Δ histogram</span>
              </div>
              <BarChart
                data={dist.bins.map((b) => ({
                  label: b.bin,
                  value: b.count,
                  color: "#FF8C00",
                }))}
                height={220}
                fmt={(n) => fmtNum(n, 0)}
              />
              <div className="mt-2 grid grid-cols-2 gap-px bg-term-border sm:grid-cols-4">
                <Stat label="Mean" value={fmtSigned(dist.mean, 3)} className="bg-term-panel" />
                <Stat label="Std Dev" value={fmtNum(dist.sd, 3)} className="bg-term-panel" />
                <Stat
                  label="Skew"
                  value={fmtSigned(dist.skew, 2)}
                  tone={dist.skew >= 0 ? "up" : "down"}
                  className="bg-term-panel"
                />
                <Stat
                  label="Latest Z"
                  value={fmtSigned(dist.latestZ, 2)}
                  sub={zOutlier ? "outlier" : "in-band"}
                  tone={zOutlier ? "amber" : "neutral"}
                  className="bg-term-panel"
                />
              </div>
              <p className="mt-1 text-3xs leading-relaxed text-term-text-mute">
                Histogram of {distLabel} period-over-period changes (120 obs). Latest move is{" "}
                {fmtSigned(dist.latestZ, 2)}σ from the mean.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
