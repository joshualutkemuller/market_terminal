"use client";

import { Fragment } from "react";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { getAssetQuilt, quiltColor } from "@/data/marketAnalytics";
import { fmtNum, fmtSignedPct } from "@/lib/format";

function tone(v: number): "up" | "down" | "amber" | "neutral" {
  if (v > 10) return "up";
  if (v < 0) return "down";
  if (v < 4) return "neutral";
  return "amber";
}

export default function AssetQuiltPage() {
  const quilt = getAssetQuilt();
  const latest = quilt[quilt.length - 1];
  const bestLatest = latest.cells[0];
  const worstLatest = latest.cells[latest.cells.length - 1];
  const leaders = quilt.reduce<Record<string, number>>((acc, y) => {
    acc[y.cells[0].asset] = (acc[y.cells[0].asset] ?? 0) + 1;
    return acc;
  }, {});
  const leader = Object.entries(leaders).sort((a, b) => b[1] - a[1])[0];
  const dispersion = latest.cells[0].returnPct - latest.cells[latest.cells.length - 1].returnPct;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader code="QUILT" title="Asset Quilt" desc="Annual cross-asset return rank quilt" right={<Tag tone="blue">SNAPSHOT</Tag>} />

      <KpiStrip>
        <Stat label="Latest Leader" value={bestLatest.asset} sub={fmtSignedPct(bestLatest.returnPct, 1)} tone={tone(bestLatest.returnPct)} />
        <Stat label="Latest Laggard" value={worstLatest.asset} sub={fmtSignedPct(worstLatest.returnPct, 1)} tone={tone(worstLatest.returnPct)} />
        <Stat label="Dispersion" value={`${fmtNum(dispersion, 1)} pts`} sub={`${latest.year} high-low`} tone="amber" />
        <Stat label="Most #1 Finishes" value={leader?.[0] ?? "—"} sub={`${leader?.[1] ?? 0} years`} />
        <Stat label="Years" value={`${quilt[0].year}-${latest.year}`} sub="2016-2025 + current YTD" />
        <Stat label="Method" value="Ranked" sub="best to worst by year" tone="neutral" />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-12">
        <Panel title="Asset Class Return Quilt" code="RANK" className="xl:col-span-12" accent>
          <div className="overflow-auto">
            <div className="grid min-w-[1080px]" style={{ gridTemplateColumns: `76px repeat(${quilt.length}, minmax(88px, 1fr))` }}>
              <div className="sticky left-0 z-20 border-b border-r border-term-border bg-term-panel-2 px-2 py-1 text-2xs font-semibold uppercase text-term-text-mute">Rank</div>
              {quilt.map((y) => (
                <div key={y.year} className="border-b border-r border-term-border bg-term-panel-2 px-2 py-1 text-center text-2xs font-semibold text-term-text-dim">
                  {y.year === 2026 ? `${y.year} YTD` : y.year}
                </div>
              ))}

              {Array.from({ length: 10 }, (_, rank) => (
                <Fragment key={`rank-row-${rank}`}>
                  <div key={`rank-${rank}`} className="sticky left-0 z-10 border-b border-r border-term-border bg-term-panel px-2 py-3 text-center text-xs font-semibold text-term-text-mute">
                    #{rank + 1}
                  </div>
                  {quilt.map((year) => {
                    const cell = year.cells[rank];
                    return (
                      <div key={`${year.year}-${cell.asset}`} className="min-h-[64px] border-b border-r border-black/40 p-1.5" style={{ background: quiltColor(cell.asset) }}>
                        <div className="text-2xs font-semibold uppercase leading-tight text-black/80">{cell.asset}</div>
                        <div className="tnum mt-1 text-lg font-bold leading-none text-black">{fmtSignedPct(cell.returnPct, 1)}</div>
                      </div>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="How to Read" code="NOTE" className="xl:col-span-4">
          <div className="space-y-2 p-3 text-xs text-term-text-dim">
            <p>Each column ranks asset classes from best annual return at the top to worst annual return at the bottom.</p>
            <p>The current year column is YTD, so it should not be compared as a full-year return.</p>
            <p>This local view uses deterministic market-style returns and is shaped to accept future Yahoo or licensed index total-return feeds.</p>
          </div>
        </Panel>

        <Panel title="Latest Ranking" code="YTD" className="xl:col-span-8">
          <div className="grid grid-cols-2 gap-px bg-term-border md:grid-cols-5">
            {latest.cells.map((c) => (
              <div key={c.asset} className="bg-term-panel p-2">
                <div className="flex items-center justify-between gap-2">
                  <Tag tone={tone(c.returnPct)}>#{c.rank}</Tag>
                  <span className="tnum text-xs font-semibold text-term-text">{fmtSignedPct(c.returnPct, 1)}</span>
                </div>
                <div className="mt-1 truncate text-xs text-term-text-dim">{c.asset}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
