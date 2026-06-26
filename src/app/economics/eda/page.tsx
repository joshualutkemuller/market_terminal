import { useState, useMemo } from "react";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { CorrelationMatrix } from "@/components/charts/Matrix";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import { fmtNum, fmtSignedPct, pnlClass } from "@/lib/format";
import {
  edaView,
  type CrossCorrelationResult,
  type GrangerResult,
  type LaggedOlsResult,
  type CusumResult,
  type PeltResult,
  type EdaView,
} from "@/data/marketPipeline";

function sigStars(p: number): string {
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "";
}

function pvalTone(p: number): "up" | "amber" | "neutral" {
  if (p < 0.01) return "up";
  if (p < 0.05) return "amber";
  return "neutral";
}

export default function EdaPage() {
  const data: EdaView = edaView;
  const [ccfIdx, setCcfIdx] = useState(0);

  const strongestLead = useMemo(() => {
    let best = data.cross_correlation[0];
    for (const p of data.cross_correlation) {
      if (Math.abs(p.best_corr) > Math.abs(best.best_corr)) best = p;
    }
    return best;
  }, [data]);

  const bestGranger = useMemo(() => {
    let best = data.granger_causality[0];
    for (const g of data.granger_causality) {
      if (g.p_value < best.p_value) best = g;
    }
    return best;
  }, [data]);

  const recentChangepoints = useMemo(() => {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    return data.cusum.reduce((count, c) => {
      return count + c.changepoints.filter((d) => new Date(d) >= cutoff).length;
    }, 0);
  }, [data]);

  const avgAbsCorr = useMemo(() => {
    const vals = data.cross_correlation.map((p) => Math.abs(p.best_corr));
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }, [data]);

  const grangerSorted = useMemo(
    () => [...data.granger_causality].sort((a, b) => a.p_value - b.p_value),
    [data],
  );

  const olsSorted = useMemo(
    () => [...data.lagged_ols].sort((a, b) => b.best_r2 - a.best_r2),
    [data],
  );

  const selectedCcf = data.cross_correlation[ccfIdx];
  const heatmap = data.pearson_heatmap;

  const grangerCols: Column<GrangerResult>[] = [
    {
      key: "pair",
      header: "Leader → Follower",
      render: (r) => `${r.leader_name} → ${r.follower_name}`,
      sortVal: (r) => r.leader_name,
    },
    {
      key: "lag",
      header: "Best Lag",
      align: "right",
      render: (r) => `${r.best_lag}mo`,
      sortVal: (r) => r.best_lag,
    },
    {
      key: "fstat",
      header: "F-Stat",
      align: "right",
      render: (r) => fmtNum(r.f_stat, 1),
      sortVal: (r) => r.f_stat,
    },
    {
      key: "pval",
      header: "p-value",
      align: "right",
      render: (r) => <Tag tone={pvalTone(r.p_value)}>{r.p_value.toFixed(4)}</Tag>,
      sortVal: (r) => r.p_value,
    },
    {
      key: "sig",
      header: "Sig",
      align: "center",
      render: (r) => <span className="text-term-amber">{sigStars(r.p_value)}</span>,
      sortVal: (r) => -sigStars(r.p_value).length,
    },
  ];

  const olsCols: Column<LaggedOlsResult>[] = [
    {
      key: "pair",
      header: "Leader → Follower",
      render: (r) => `${r.leader_name} → ${r.follower_name}`,
      sortVal: (r) => r.leader_name,
    },
    {
      key: "lag",
      header: "Best Lag",
      align: "right",
      render: (r) => `${r.best_lag}mo`,
      sortVal: (r) => r.best_lag,
    },
    {
      key: "r2",
      header: "R²",
      align: "right",
      render: (r) => fmtSignedPct(r.best_r2 * 100, 1),
      sortVal: (r) => r.best_r2,
    },
    {
      key: "beta",
      header: "Beta",
      align: "right",
      render: (r) => <span className={pnlClass(r.best_beta)}>{fmtNum(r.best_beta, 2)}</span>,
      sortVal: (r) => r.best_beta,
    },
    {
      key: "pval",
      header: "p-value",
      align: "right",
      render: (r) => <Tag tone={pvalTone(r.best_pvalue)}>{r.best_pvalue.toFixed(4)}</Tag>,
      sortVal: (r) => r.best_pvalue,
    },
  ];

  const cusumCols: Column<CusumResult>[] = [
    {
      key: "series",
      header: "Series",
      render: (r) => r.display_name,
      sortVal: (r) => r.display_name,
    },
    {
      key: "count",
      header: "Count",
      align: "right",
      render: (r) => r.changepoints.length,
      sortVal: (r) => r.changepoints.length,
    },
    {
      key: "dates",
      header: "Changepoints",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.changepoints.map((d) => (
            <Tag key={d} tone="amber">{d}</Tag>
          ))}
        </div>
      ),
    },
  ];

  const peltCols: Column<PeltResult>[] = [
    {
      key: "series",
      header: "Series",
      render: (r) => r.display_name,
      sortVal: (r) => r.display_name,
    },
    {
      key: "segs",
      header: "Segments",
      align: "right",
      render: (r) => r.segments.length,
      sortVal: (r) => r.segments.length,
    },
    {
      key: "latestReturn",
      header: "Latest μ Return",
      align: "right",
      render: (r) => {
        const s = r.segments[r.segments.length - 1];
        return <span className={pnlClass(s.mean_return)}>{fmtSignedPct(s.mean_return * 100, 2)}</span>;
      },
      sortVal: (r) => r.segments[r.segments.length - 1].mean_return,
    },
    {
      key: "latestVol",
      header: "Latest Vol",
      align: "right",
      render: (r) => {
        const s = r.segments[r.segments.length - 1];
        return fmtSignedPct(s.volatility * 100, 2);
      },
      sortVal: (r) => r.segments[r.segments.length - 1].volatility,
    },
    {
      key: "breaks",
      header: "Breakpoints",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.changepoints.map((d) => (
            <Tag key={d} tone="neutral">{d}</Tag>
          ))}
        </div>
      ),
    },
  ];

  const ccfMax = Math.max(...selectedCcf.ccf.map((p) => Math.abs(p.corr)), 0.01);
  const barW = 32;
  const barGap = 4;
  const chartW = selectedCcf.ccf.length * (barW + barGap) + 60;
  const chartH = 200;
  const axisY = chartH / 2;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        code="EDA"
        title="Exploratory Data Analysis"
        desc="Cross-correlation, Granger causality & structural breaks"
        asOf={data.asof}
        right={<ProvenanceBadge source="SIM" />}
      />

      <KpiStrip>
        <Stat
          label="Strongest Lead"
          value={`${strongestLead.leader_name} → ${strongestLead.follower_name}`}
          sub={`${fmtNum(strongestLead.best_corr, 2)} at lag ${strongestLead.best_lag}`}
          tone={strongestLead.best_corr < 0 ? "down" : "up"}
        />
        <Stat
          label="Best Granger"
          value={`${bestGranger.leader_name} → ${bestGranger.follower_name}`}
          sub={`p=${bestGranger.p_value.toFixed(4)}`}
          tone="up"
        />
        <Stat
          label="Active Changepoints"
          value={recentChangepoints}
          sub="last 6 months (CUSUM)"
          tone={recentChangepoints > 3 ? "amber" : "neutral"}
        />
        <Stat
          label="Avg |Cross-Corr|"
          value={fmtNum(avgAbsCorr, 2)}
          tone="neutral"
        />
        <Stat
          label="Pairs Analyzed"
          value={data.cross_correlation.length}
          tone="neutral"
        />
      </KpiStrip>

      <div className="analytics-grid flex-1 grid auto-rows-[minmax(20rem,auto)] grid-cols-12 gap-px bg-term-border">
        <Panel title="Granger Causality Tests" code="GRNR" className="col-span-12 xl:col-span-6">
          <DataGrid
            columns={grangerCols}
            rows={grangerSorted}
            rowKey={(r) => `${r.leader}-${r.follower}`}
            initialSort={{ key: "pval", dir: "asc" }}
          />
        </Panel>

        <Panel title="Lagged OLS Regression" code="OLS" className="col-span-12 xl:col-span-6">
          <DataGrid
            columns={olsCols}
            rows={olsSorted}
            rowKey={(r) => `${r.leader}-${r.follower}`}
            initialSort={{ key: "r2", dir: "desc" }}
          />
        </Panel>

        <Panel
          title="Cross-Correlation Function"
          code="CCF"
          subtitle={`${selectedCcf.leader_name} → ${selectedCcf.follower_name}`}
          className="col-span-12 xl:col-span-8"
        >
          <div className="flex flex-col gap-2 p-2">
            <div className="flex flex-wrap gap-1">
              {data.cross_correlation.map((p, i) => (
                <button
                  key={`${p.leader}-${p.follower}`}
                  onClick={() => setCcfIdx(i)}
                  className={`rounded-sm border px-1.5 py-px text-3xs font-semibold uppercase tracking-wide transition-colors ${
                    i === ccfIdx
                      ? "border-term-amber/60 bg-term-amber/15 text-term-amber"
                      : "border-term-border bg-term-panel-2 text-term-text-dim hover:text-term-text"
                  }`}
                >
                  {p.leader_name} → {p.follower_name}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${chartW} ${chartH + 30}`} className="w-full" style={{ minWidth: 480, maxHeight: 240 }}>
                <line x1={50} y1={axisY} x2={chartW - 10} y2={axisY} stroke="#3A3A4A" strokeWidth={1} />
                {selectedCcf.ccf.map((pt, i) => {
                  const x = 55 + i * (barW + barGap);
                  const barH = (Math.abs(pt.corr) / ccfMax) * (axisY - 10);
                  const y = pt.corr >= 0 ? axisY - barH : axisY;
                  const isBest = pt.lag === selectedCcf.best_lag;
                  const fill = isBest
                    ? "#FF8C00"
                    : pt.corr >= 0
                      ? "rgba(46,204,113,0.6)"
                      : "rgba(255,59,59,0.6)";
                  return (
                    <g key={pt.lag}>
                      <rect x={x} y={y} width={barW} height={barH} fill={fill} />
                      <text
                        x={x + barW / 2}
                        y={chartH + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#9A9AA3"
                        fontFamily="var(--font-mono)"
                      >
                        {pt.lag}
                      </text>
                      <text
                        x={x + barW / 2}
                        y={pt.corr >= 0 ? y - 3 : y + barH + 11}
                        textAnchor="middle"
                        fontSize={8}
                        fill={isBest ? "#FF8C00" : "#9A9AA3"}
                        fontFamily="var(--font-mono)"
                      >
                        {pt.corr.toFixed(2)}
                      </text>
                    </g>
                  );
                })}
                <text x={chartW / 2} y={chartH + 28} textAnchor="middle" fontSize={10} fill="#6A6A7A" fontFamily="var(--font-mono)">
                  Lag (months)
                </text>
                <text x={14} y={axisY + 4} textAnchor="middle" fontSize={9} fill="#6A6A7A" fontFamily="var(--font-mono)" transform={`rotate(-90,14,${axisY})`}>
                  Corr
                </text>
              </svg>
            </div>
          </div>
        </Panel>

        <Panel title="Pearson Correlation Heatmap" code="CORR" className="col-span-12 xl:col-span-4" scroll>
          <div className="p-2">
            <CorrelationMatrix labels={heatmap.labels} values={heatmap.matrix} height={420} />
          </div>
        </Panel>

        <Panel title="CUSUM Changepoints" code="CUSUM" className="col-span-12 xl:col-span-6">
          <DataGrid
            columns={cusumCols}
            rows={data.cusum}
            rowKey={(r) => r.series_id}
          />
        </Panel>

        <Panel title="PELT Regime Segments" code="PELT" className="col-span-12 xl:col-span-6">
          <DataGrid
            columns={peltCols}
            rows={data.pelt}
            rowKey={(r) => r.series_id}
          />
        </Panel>
      </div>
    </div>
  );
}
