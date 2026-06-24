
import clsx from "clsx";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { BarChart } from "@/components/charts/BarChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { ProgressBar } from "@/components/charts/Radial";
import { ProvenanceBadge } from "@/components/ui/ProvenanceBadge";
import {
  getTraderScores,
  getExecutions,
  getDeskRisk,
  getPositionConcentration,
  type TraderScore,
  type ExecutionRow,
  type PositionConc,
} from "@/data/trading";
import { getMarketConditions } from "@/data/marketConditions";
import {
  computeExecutionRisk,
  computeDeskStance,
  computeVolLiquidity,
  type ExecutionRiskRow,
} from "@/data/etrading";
import { fmtAbbr, fmtUsdAbbr, fmtPct, fmtBps, fmtInt, fmtNum, fmtSigned, fmtSignedPct, pnlClass } from "@/lib/format";

const RISK_TONE: Record<string, "up" | "amber" | "down"> = {
  Normal: "up", Cautious: "amber", Wide: "down", Stress: "down",
};
const STANCE_TONE: Record<string, "up" | "amber" | "down"> = {
  Aggressive: "up", Balanced: "up", Passive: "amber", "Reduce Size": "down",
};
const REGIME_TONE: Record<string, "up" | "amber" | "blue" | "violet"> = {
  Trending: "up", "Mean-Reverting": "blue", Choppy: "amber", Breakout: "violet",
};

export default function TradingDesk() {
  const traders = getTraderScores().slice().sort((a, b) => b.revenueMtd - a.revenueMtd);
  const execs = getExecutions();
  const risk = getDeskRisk();
  const conc = getPositionConcentration();

  const cond = getMarketConditions();
  const execRiskRows = computeExecutionRisk(cond);
  const deskStance = computeDeskStance(cond);
  const volLiq = computeVolLiquidity(execRiskRows);

  const deskRevDay = traders.reduce((a, t) => a + t.revenueDay, 0);
  const deskPnlDay = traders.reduce((a, t) => a + t.pnlDay, 0);
  const revMtd = traders.reduce((a, t) => a + t.revenueMtd, 0);
  const avgSharpe = traders.reduce((a, t) => a + t.sharpe, 0) / traders.length;

  const avgSlippage = execs.reduce((a, e) => a + e.slippageBps, 0) / execs.length;
  const avgFill = execs.reduce((a, e) => a + e.fillRate, 0) / execs.length;

  const execRiskCols: Column<ExecutionRiskRow>[] = [
    { key: "symbol", header: "Symbol", render: (r) => <span className="font-semibold text-term-text">{r.symbol}</span>, sortVal: (r) => r.symbol },
    { key: "ac", header: "Class", render: (r) => <span className="text-term-text-mute">{r.assetClass}</span>, sortVal: (r) => r.assetClass },
    { key: "spark", header: "40d", align: "right", width: "70px", render: (r) => <Sparkline data={r.sparkline} width={60} height={18} /> },
    { key: "chg", header: "Δ 1d", align: "right", render: (r) => <span className={pnlClass(r.chg1d)}>{fmtSignedPct(r.chg1d, 1)}</span>, sortVal: (r) => r.chg1d },
    { key: "rvol", header: "RVol 20d", align: "right", render: (r) => <span className="text-term-text">{fmtPct(r.realizedVol, 1)}</span>, sortVal: (r) => r.realizedVol },
    { key: "vratio", header: "Vol Ratio", align: "right", render: (r) => <span className="text-term-text-dim">{r.volRatio}</span>, sortVal: (r) => parseFloat(r.volRatio) },
    { key: "volz", header: "Vol Z", align: "right", render: (r) => <span className={pnlClass(-Math.abs(r.volumeZ))}>{fmtNum(r.volumeZ, 1)}</span>, sortVal: (r) => r.volumeZ },
    { key: "range", header: "Range %ile", align: "right", render: (r) => <span className={r.rangePctile >= 80 ? "text-term-down" : "text-term-text-dim"}>{fmtPct(r.rangePctile, 0)}</span>, sortVal: (r) => r.rangePctile },
    { key: "gap", header: "Gap Risk", align: "right", render: (r) => <span className={r.gapRisk >= 3 ? "text-term-down" : "text-term-text-dim"}>{fmtPct(r.gapRisk, 1)}</span>, sortVal: (r) => r.gapRisk },
    { key: "regime", header: "Regime", align: "center", render: (r) => <Tag tone={REGIME_TONE[r.regime]}>{r.regime}</Tag>, sortVal: (r) => r.regime },
    { key: "risk", header: "Exec Risk", align: "center", render: (r) => <Tag tone={RISK_TONE[r.riskLevel]}>{r.riskLevel}</Tag>, sortVal: (r) => r.riskLevel },
  ];

  const traderCols: Column<TraderScore>[] = [
    { key: "rank", header: "#", align: "right", width: "32px", render: (t) => <span className={t.rank <= 3 ? "font-bold text-term-amber" : "text-term-text-mute"}>{t.rank}</span>, sortVal: (t) => t.rank },
    { key: "name", header: "Trader", render: (t) => <span className="font-semibold text-term-text">{t.name}</span>, sortVal: (t) => t.name },
    { key: "desk", header: "Desk", render: (t) => <span className="text-term-text-dim">{t.desk}</span>, sortVal: (t) => t.desk },
    { key: "revenueDay", header: "Rev Day", align: "right", render: (t) => <span className="text-term-text">{fmtUsdAbbr(t.revenueDay)}</span>, sortVal: (t) => t.revenueDay },
    { key: "revenueMtd", header: "Rev MTD", align: "right", render: (t) => <span className="text-term-amber">{fmtUsdAbbr(t.revenueMtd)}</span>, sortVal: (t) => t.revenueMtd },
    { key: "pnlDay", header: "P&L Day", align: "right", render: (t) => <span className={pnlClass(t.pnlDay)}>{fmtUsdAbbr(t.pnlDay)}</span>, sortVal: (t) => t.pnlDay },
    { key: "pnlMtd", header: "P&L MTD", align: "right", render: (t) => <span className={pnlClass(t.pnlMtd)}>{fmtUsdAbbr(t.pnlMtd)}</span>, sortVal: (t) => t.pnlMtd },
    { key: "utilization", header: "Util", align: "right", width: "110px", render: (t) => <ProgressBar value={t.utilization} color={t.utilization > 90 ? "#FF3B3B" : "#FF8C00"} height={5} showPct />, sortVal: (t) => t.utilization },
    { key: "sharpe", header: "Sharpe", align: "right", render: (t) => <span className={t.sharpe >= 2 ? "text-term-up" : "text-term-text"}>{fmtNum(t.sharpe, 2)}</span>, sortVal: (t) => t.sharpe },
    { key: "hitRate", header: "Hit %", align: "right", render: (t) => <span className="text-term-text-dim">{fmtPct(t.hitRate, 0)}</span>, sortVal: (t) => t.hitRate },
    { key: "pnlTrend", header: "Trend", align: "right", width: "70px", render: (t) => <Sparkline data={t.pnlTrend} width={60} height={20} /> },
  ];

  const execCols: Column<ExecutionRow>[] = [
    { key: "ticker", header: "Ticker", render: (e) => <span className="font-semibold text-term-text">{e.ticker}</span>, sortVal: (e) => e.ticker },
    { key: "side", header: "Side", render: (e) => <Tag tone={e.side === "BUY" ? "up" : "down"}>{e.side}</Tag>, sortVal: (e) => e.side },
    { key: "qty", header: "Qty", align: "right", render: (e) => <span className="text-term-text-dim">{fmtInt(e.qty)}</span>, sortVal: (e) => e.qty },
    { key: "avgPx", header: "Avg Px", align: "right", render: (e) => <span className="text-term-text">{fmtNum(e.avgPx, 2)}</span>, sortVal: (e) => e.avgPx },
    { key: "vwap", header: "VWAP", align: "right", render: (e) => <span className="text-term-text-dim">{fmtNum(e.vwap, 2)}</span>, sortVal: (e) => e.vwap },
    { key: "slippageBps", header: "Slip", align: "right", render: (e) => <span className={pnlClass(-e.slippageBps)}>{fmtBps(e.slippageBps, 1)}</span>, sortVal: (e) => e.slippageBps },
    { key: "fillRate", header: "Fill", align: "right", width: "110px", render: (e) => <ProgressBar value={e.fillRate} color={e.fillRate >= 95 ? "#2ECC71" : "#FF8C00"} height={5} showPct />, sortVal: (e) => e.fillRate },
    { key: "venue", header: "Venue", render: (e) => <span className="text-term-text-dim">{e.venue}</span>, sortVal: (e) => e.venue },
    { key: "algo", header: "Algo", render: (e) => <Tag tone="violet">{e.algo}</Tag>, sortVal: (e) => e.algo },
  ];

  const concCols: Column<PositionConc>[] = [
    { key: "ticker", header: "Ticker", render: (p) => <span className="font-semibold text-term-text">{p.ticker}</span>, sortVal: (p) => p.ticker },
    { key: "netExposure", header: "Net Exposure", align: "right", render: (p) => <span className={pnlClass(p.netExposure)}>{p.netExposure >= 0 ? "+" : "-"}{fmtUsdAbbr(Math.abs(p.netExposure))}</span>, sortVal: (p) => p.netExposure },
    { key: "pctBook", header: "% Book", align: "right", width: "120px", render: (p) => <ProgressBar value={p.pctBook} max={15} color={p.pctBook > 10 ? "#FF3B3B" : "#FF8C00"} height={5} showPct />, sortVal: (p) => p.pctBook },
    { key: "liquidity", header: "Liquidity", align: "right", render: (p) => <Tag tone={p.liquidity === "DEEP" ? "up" : p.liquidity === "THIN" ? "down" : "neutral"}>{p.liquidity}</Tag>, sortVal: (p) => p.liquidity },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        code="DESK"
        title="Trading Desk"
        desc="Market Conditions · Execution Risk · Scorecards"
        right={<ProvenanceBadge source="SIM" />}
      />

      <KpiStrip>
        <Stat label="Desk Stance" value={deskStance.stance} sub={`${deskStance.score}/100 caution`} tone={STANCE_TONE[deskStance.stance]} />
        <Stat label="VIX" value={fmtNum(cond.vix, 1)} sub={cond.equityVolRegime} tone={cond.vix >= 22 ? "down" : cond.vix >= 16 ? "amber" : "up"} />
        <Stat label="Symbols at Risk" value={`${execRiskRows.filter((r) => r.riskLevel === "Stress" || r.riskLevel === "Wide").length}/${execRiskRows.length}`} sub="Wide + Stress" tone={volLiq.pctStress + volLiq.pctWide > 30 ? "down" : "neutral"} />
        <Stat label="Desk Revenue" value={fmtUsdAbbr(deskRevDay)} sub={`MTD ${fmtUsdAbbr(revMtd)}`} tone="amber" />
        <Stat label="Desk P&L" value={fmtUsdAbbr(deskPnlDay)} sub="realized + unrealized" tone={deskPnlDay >= 0 ? "up" : "down"} />
        <Stat label="Avg Sharpe" value={fmtNum(avgSharpe, 2)} sub="risk-adjusted" tone={avgSharpe >= 2 ? "up" : "neutral"} />
      </KpiStrip>

      <div className="flex flex-1 flex-col gap-2 p-2">
        {/* Desk Stance + Vol/Liquidity Summary */}
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-12">
          <div className="xl:col-span-4">
            <Panel title="Desk Stance" code="STANCE" accent right={<Tag tone={STANCE_TONE[deskStance.stance]}>{deskStance.stance}</Tag>}>
              <div className="p-3">
                <div className="flex items-end justify-between">
                  <span className="tnum text-3xl font-bold text-term-text">{deskStance.score}</span>
                  <span className="text-2xs text-term-text-mute">/ 100 caution</span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-sm bg-term-panel-3">
                  <div
                    className={clsx("h-full rounded-sm", deskStance.score >= 70 ? "bg-term-down" : deskStance.score >= 45 ? "bg-term-amber" : "bg-term-up")}
                    style={{ width: `${deskStance.score}%` }}
                  />
                </div>
                <p className="mt-3 text-2xs leading-relaxed text-term-text-dim">{deskStance.readThrough}</p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {deskStance.components.map((c) => (
                    <div key={c.label} className="grid grid-cols-[110px_1fr_56px] items-center gap-2 text-3xs">
                      <span className="text-term-text-mute">{c.label}</span>
                      <div className="h-1.5 overflow-hidden rounded-sm bg-term-panel-3">
                        <div className={clsx("h-full rounded-sm", c.contribution >= 65 ? "bg-term-down" : c.contribution >= 35 ? "bg-term-amber" : "bg-term-up")} style={{ width: `${c.contribution}%` }} />
                      </div>
                      <span className="tnum text-right text-term-text-dim">{c.detail}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 border-t border-term-border-soft pt-2">
                  <div className="text-3xs font-semibold uppercase tracking-wide text-term-text-mute">Adjustments</div>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {deskStance.adjustments.map((a, i) => (
                      <li key={i} className="text-2xs text-term-text-dim">• {a}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Panel>
          </div>

          <div className="xl:col-span-8">
            <Panel title="Vol & Liquidity Summary" code="VLIQ" right={<span className="text-3xs text-term-text-mute">{execRiskRows.length} symbols monitored</span>}>
              <div className="grid grid-cols-2 gap-px bg-term-border lg:grid-cols-4">
                <div className="bg-term-panel p-2">
                  <div className="term-label">Risk Distribution</div>
                  <div className="mt-2 flex flex-col gap-1">
                    {(["Normal", "Cautious", "Wide", "Stress"] as const).map((level) => {
                      const pct = level === "Normal" ? volLiq.pctNormal : level === "Cautious" ? volLiq.pctCautious : level === "Wide" ? volLiq.pctWide : volLiq.pctStress;
                      return (
                        <div key={level} className="flex items-center gap-2 text-2xs">
                          <Tag tone={RISK_TONE[level]}>{level}</Tag>
                          <ProgressBar value={pct} color={RISK_TONE[level] === "up" ? "#2ECC71" : RISK_TONE[level] === "amber" ? "#FF8C00" : "#FF3B3B"} height={5} />
                          <span className="tnum w-8 text-right text-term-text-dim">{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="bg-term-panel p-2">
                  <div className="term-label">Regime Breakdown</div>
                  <div className="mt-2 flex flex-col gap-1">
                    {([["Trending", volLiq.trendingCount], ["Mean-Reverting", volLiq.meanRevertCount], ["Choppy", volLiq.choppyCount], ["Breakout", volLiq.breakoutCount]] as const).map(([label, count]) => (
                      <div key={label} className="flex items-center justify-between text-2xs">
                        <Tag tone={REGIME_TONE[label]}>{label}</Tag>
                        <span className="tnum text-term-text">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-term-panel p-2">
                  <div className="term-label">Vol Metrics</div>
                  <div className="mt-2 flex flex-col gap-2 text-2xs">
                    <div className="flex justify-between"><span className="text-term-text-mute">Avg RVol 20d</span><span className="tnum text-term-text">{fmtPct(volLiq.avgRealizedVol, 1)}</span></div>
                    <div className="flex justify-between"><span className="text-term-text-mute">Avg Vol Z</span><span className="tnum text-term-text">{fmtNum(volLiq.avgVolumeZ, 2)}</span></div>
                    <div className="flex justify-between"><span className="text-term-text-mute">VIX</span><span className="tnum text-term-text">{fmtNum(cond.vix, 1)}</span></div>
                    <div className="flex justify-between"><span className="text-term-text-mute">MOVE</span><span className="tnum text-term-text">{fmtNum(cond.moveIndex, 0)}</span></div>
                  </div>
                </div>
                <div className="bg-term-panel p-2">
                  <div className="term-label">Market Context</div>
                  <div className="mt-2 flex flex-col gap-2 text-2xs">
                    <div className="flex justify-between"><span className="text-term-text-mute">Eq Vol</span><Tag tone={cond.equityVolRegime === "Low" ? "up" : cond.equityVolRegime === "Normal" ? "up" : "down"}>{cond.equityVolRegime}</Tag></div>
                    <div className="flex justify-between"><span className="text-term-text-mute">Credit</span><Tag tone={cond.creditRegime === "Tight" ? "up" : cond.creditRegime === "Normal" ? "up" : "down"}>{cond.creditRegime}</Tag></div>
                    <div className="flex justify-between"><span className="text-term-text-mute">Liquidity</span><Tag tone={cond.liquidityRegime === "Ample" ? "up" : cond.liquidityRegime === "Adequate" ? "up" : "down"}>{cond.liquidityRegime}</Tag></div>
                    <div className="flex justify-between"><span className="text-term-text-mute">Funding</span><span className="tnum text-term-text">{cond.fundingStress.toFixed(0)}/100</span></div>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>

        {/* Execution Risk by Symbol */}
        <Panel
          title="Execution Risk by Symbol"
          code="ERISK"
          accent
          right={<span className="text-3xs text-term-text-mute">realized vol · volume z-score · gap risk · trend regime · execution risk level</span>}
        >
          <DataGrid columns={execRiskCols} rows={execRiskRows} rowKey={(r) => r.symbol} maxHeight="400px" initialSort={{ key: "risk", dir: "desc" }} zebra />
        </Panel>

        {/* Trader scorecards */}
        <Panel title="Trader Scorecards" code="SCORE" right={<span className="text-3xs text-term-text-mute">ranked by MTD revenue</span>}>
          <DataGrid columns={traderCols} rows={traders} rowKey={(t) => t.id} maxHeight="360px" initialSort={{ key: "revenueMtd", dir: "desc" }} zebra />
        </Panel>

        {/* Execution analytics */}
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-3">
          <Panel title="Execution Analytics" code="EXEC" className="xl:col-span-2">
            <DataGrid columns={execCols} rows={execs} rowKey={(e) => e.ticker} maxHeight="300px" initialSort={{ key: "slippageBps", dir: "asc" }} zebra />
          </Panel>

          <Panel title="Slippage by Ticker" code="SLIP" right={<Tag tone={avgSlippage <= 0 ? "up" : "down"}>{fmtBps(avgSlippage, 1)} avg</Tag>}>
            <div className="grid grid-cols-2 divide-x divide-term-border border-b border-term-border">
              <Stat label="Avg Slippage" value={fmtBps(avgSlippage, 2)} tone={avgSlippage <= 0 ? "up" : "down"} />
              <Stat label="Avg Fill Rate" value={fmtPct(avgFill, 1)} tone="up" />
            </div>
            <div className="p-2">
              <BarChart
                horizontal
                data={execs
                  .slice()
                  .sort((a, b) => a.slippageBps - b.slippageBps)
                  .map((e) => ({ label: e.ticker, value: e.slippageBps, color: e.slippageBps <= 0 ? "#2ECC71" : "#FF3B3B" }))}
                fmt={(n) => fmtBps(n, 1)}
              />
            </div>
          </Panel>
        </div>

        {/* Risk + concentration */}
        <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
          <Panel title="Risk Analytics" code="RISK" right={<Tag tone="amber">{risk.length} limits</Tag>}>
            <div className="divide-y divide-term-border-soft">
              {risk.map((r) => {
                const isScore = r.unit === "score";
                const util = isScore ? r.limit / Math.max(r.value, 1e-9) : Math.abs(r.value) / r.limit;
                const danger = util > 0.85;
                const warn = util > 0.65;
                const color = danger ? "#FF3B3B" : warn ? "#FF8C00" : "#2ECC71";
                const valStr =
                  r.unit === "$" ? (r.value < 0 ? "-" : "") + fmtUsdAbbr(Math.abs(r.value)) : r.unit === "%" ? fmtPct(r.value, 1) : fmtNum(r.value, 0);
                const limStr = r.unit === "$" ? fmtUsdAbbr(r.limit) : r.unit === "%" ? fmtPct(r.limit, 0) : fmtNum(r.limit, 0);
                return (
                  <div key={r.metric} className="px-2 py-2">
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-term-text-dim">{r.metric}</span>
                      <span className="tnum">
                        <span className={danger ? "text-term-down" : "text-term-text"}>{valStr}</span>
                        <span className="text-term-text-mute"> / {limStr} {isScore ? "floor" : "limit"}</span>
                      </span>
                    </div>
                    <ProgressBar value={Math.min(util * 100, 100)} color={color} height={6} />
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Position Concentration" code="CONC">
            <DataGrid columns={concCols} rows={conc} rowKey={(p) => p.ticker} maxHeight="200px" initialSort={{ key: "netExposure", dir: "desc" }} zebra />
            <div className="border-t border-term-border p-2">
              <div className="term-label mb-1.5">Net Exposure — Long / Short</div>
              <BarChart
                horizontal
                data={conc.map((p) => ({ label: p.ticker, value: p.netExposure, color: p.netExposure >= 0 ? "#2ECC71" : "#FF3B3B" }))}
                fmt={(n) => fmtSigned(n / 1e6, 0) + "M"}
              />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
