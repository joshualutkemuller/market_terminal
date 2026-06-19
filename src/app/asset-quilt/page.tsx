"use client";

import { Fragment, useMemo, useState } from "react";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { MarketDataControls } from "@/components/market/MarketDataControls";
import { getAssetQuilt, quiltColor, type QuiltYear } from "@/data/marketAnalytics";
import { useMarketView, type MarketSource } from "@/lib/useMarket";
import type { BilelloView, ReturnBasis } from "@/data/marketPipeline";
import { fmtNum, fmtSignedPct } from "@/lib/format";

function tone(v: number): "up" | "down" | "amber" | "neutral" {
  if (v > 10) return "up";
  if (v < 0) return "down";
  if (v < 4) return "neutral";
  return "amber";
}

export default function AssetQuiltPage() {
  const [basis, setBasis] = useState<ReturnBasis>("total");
  const [asof, setAsOf] = useState("");
  const { data: bilello, source, earliestAsOf } = useMarketView<BilelloView>("bilello", basis, asof);
  const quilt = useMemo(() => quiltFromBilello(bilello) ?? getAssetQuilt(), [bilello]);
  const latest = quilt[quilt.length - 1];
  const bestLatest = latest.cells[0];
  const worstLatest = latest.cells[latest.cells.length - 1];
  const leaders = quilt.reduce<Record<string, number>>((acc, y) => {
    acc[y.cells[0].asset] = (acc[y.cells[0].asset] ?? 0) + 1;
    return acc;
  }, {});
  const leader = Object.entries(leaders).sort((a, b) => b[1] - a[1])[0];
  const dispersion = latest.cells[0].returnPct - latest.cells[latest.cells.length - 1].returnPct;

  const maxRank = Math.max(...quilt.map((y) => y.cells.length));

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        code="QUILT"
        title="Asset Quilt"
        desc="Annual ETF/index proxy return rank quilt"
        asOf={asof || bilello?.asof || null}
        right={<span className="flex items-center gap-2"><MarketDataControls basis={basis} onBasisChange={setBasis} asof={asof} onAsOfChange={setAsOf} latestAsOf={bilello?.asof} earliestAsOf={earliestAsOf} /><PipelineTag source={source} /></span>}
      />

      <KpiStrip>
        <Stat label="Latest Leader" value={bestLatest.asset} sub={fmtSignedPct(bestLatest.returnPct, 1)} tone={tone(bestLatest.returnPct)} />
        <Stat label="Latest Laggard" value={worstLatest.asset} sub={fmtSignedPct(worstLatest.returnPct, 1)} tone={tone(worstLatest.returnPct)} />
        <Stat label="Dispersion" value={`${fmtNum(dispersion, 1)} pts`} sub={`${latest.year} high-low`} tone="amber" />
        <Stat label="Most #1 Finishes" value={leader?.[0] ?? "—"} sub={`${leader?.[1] ?? 0} years`} />
        <Stat label="Years" value={`${quilt[0].year}-${latest.year}`} sub="2016-2025 + current YTD" />
        <Stat label="Method" value="ETF Proxy" sub={basis === "total" ? "adj close total return" : "raw close price return"} tone="neutral" />
      </KpiStrip>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-12">
        <Panel
          title="ETF / Index Proxy Return Quilt"
          code="RANK"
          className="xl:col-span-12"
          accent
          right={<span className="text-3xs text-term-text-mute">{source} · {basis === "total" ? "adjusted close" : "raw close"} · {asof || bilello?.asof || "latest"}</span>}
        >
          <div className="overflow-auto">
            <div className="grid min-w-[1080px]" style={{ gridTemplateColumns: `76px repeat(${quilt.length}, minmax(88px, 1fr))` }}>
              <div className="sticky left-0 z-20 border-b border-r border-term-border bg-term-panel-2 px-2 py-1 text-2xs font-semibold uppercase text-term-text-mute">Rank</div>
              {quilt.map((y) => (
                <div key={y.year} className="border-b border-r border-term-border bg-term-panel-2 px-2 py-1 text-center text-2xs font-semibold text-term-text-dim">
                  {y.year === 2026 ? `${y.year} YTD` : y.year}
                </div>
              ))}

              {Array.from({ length: maxRank }, (_, rank) => (
                <Fragment key={`rank-row-${rank}`}>
                  <div key={`rank-${rank}`} className="sticky left-0 z-10 border-b border-r border-term-border bg-term-panel px-2 py-3 text-center text-xs font-semibold text-term-text-mute">
                    #{rank + 1}
                  </div>
                  {quilt.map((year) => {
                    const cell = year.cells[rank];
                    if (!cell) {
                      return <div key={`${year.year}-empty-${rank}`} className="min-h-[64px] border-b border-r border-black/40 bg-term-panel" />;
                    }
                    return (
                      <div key={`${year.year}-${cell.asset}`} className="min-h-[64px] border-b border-r border-black/40 p-1.5" style={{ background: quiltColor(cell.asset) }}>
                        <div className="text-2xs font-semibold uppercase leading-tight text-black/85">{cell.asset}</div>
                        <div className="mt-0.5 truncate text-[9px] font-semibold leading-tight text-black/65" title={cell.displayName}>{cell.displayName ?? cell.assetClass ?? ""}</div>
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
            <p>Each column ranks the actual ETF/index proxy ticker from best annual return at the top to worst annual return at the bottom.</p>
            <p>The current year column is YTD, so it should not be compared as a full-year return.</p>
            <p>Default view ranks adjusted-close total returns. Switch to price return to rank raw-close performance. The data source badge and DATA AS OF date show the exact feed state.</p>
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
                <div className="mt-1 truncate text-xs text-term-text-dim" title={c.displayName}>{c.asset} · {c.displayName}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function quiltFromBilello(bilello: BilelloView | null | undefined): QuiltYear[] | null {
  const rows = bilello?.asset_class_returns_by_year ?? [];
  if (!rows.length) return null;
  const years = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b);
  return years.map((year) => {
    const cells = rows
      .filter((r) => r.year === year && r.total_return !== null)
      .sort((a, b) => b.total_return - a.total_return)
      .map((r, i) => ({
        year,
        asset: r.series_id ?? prettyAssetClass(r.asset_class),
        displayName: r.display_name,
        assetClass: r.asset_class,
        returnPct: Number((r.total_return * 100).toFixed(1)),
        rank: i + 1,
      }));
    return { year, cells };
  }).filter((y) => y.cells.length);
}

function prettyAssetClass(assetClass: string): string {
  const map: Record<string, string> = {
    EQUITY: "Equities",
    BOND: "Bonds",
    CREDIT: "Credit",
    COMMODITY: "Commodities",
    VOLATILITY: "Volatility",
    CURRENCY: "Currencies",
  };
  return map[assetClass] ?? assetClass;
}

function PipelineTag({ source }: { source: MarketSource }) {
  return <Tag tone={source === "DB" || source === "LIVE" || source === "FILE" ? "up" : "blue"}>{source === "LOADING" ? "SYNC" : source}</Tag>;
}
