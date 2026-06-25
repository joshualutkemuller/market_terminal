
import { useMemo } from "react";
import { getIndices, mergeLiveIndices, mergeSnapshotIndices, latestFredAsOf, INDEX_FRED_IDS, type PipelineCard } from "@/data/markets";
import { useLiveSeriesSet } from "@/lib/useEcon";
import { useMarketView } from "@/lib/useMarket";
import { fmtNum, fmtSignedPct } from "@/lib/format";

/** Scrolling top marquee of headline indices/rates with live/snapshot data. */
export function Ticker() {
  const sim = getIndices();

  const { data: indexFred } = useLiveSeriesSet(INDEX_FRED_IDS, "lin", 30);
  const fredAsOf = useMemo(() => latestFredAsOf(indexFred), [indexFred]);
  const anyFredLive = INDEX_FRED_IDS.some((id) => indexFred[id]?.source === "FRED");

  const { data: marketData, source: mktSource } = useMarketView<{ cards: PipelineCard[] }>("market");
  const pipelineLive = mktSource !== "SNAPSHOT" && mktSource !== "LOADING" && !!marketData?.cards?.length;
  const hasCards = !!marketData?.cards?.length;
  const pipelineAsOf = useMemo(() => {
    if (!marketData?.cards?.length) return null;
    return marketData.cards.reduce((best: string | null, c) => {
      const d = (c as any).asof ?? null;
      return d && (!best || d > best) ? d : best;
    }, null);
  }, [marketData]);

  const merged = useMemo(() => {
    let idx = sim;
    if (hasCards && marketData?.cards) {
      idx = mergeSnapshotIndices(idx, marketData.cards, pipelineAsOf);
    }
    if (anyFredLive) {
      idx = mergeLiveIndices(idx, indexFred);
    }
    return idx;
  }, [sim, indexFred, anyFredLive, marketData, hasCards, pipelineAsOf]);

  const displayAsOf = fredAsOf ?? pipelineAsOf;
  const sourceLabel = anyFredLive ? "FRED" : hasCards ? "SNAPSHOT" : "SIM";

  const items = [...merged, ...merged];
  return (
    <div className="relative h-6 overflow-hidden border-b border-term-border bg-term-panel">
      <div className="ticker-track flex h-full items-center whitespace-nowrap">
        {items.map((q, i) => {
          const up = q.chgPct >= 0;
          return (
            <span key={i} className="tnum mx-3 inline-flex items-center gap-1.5 text-2xs">
              <span className="font-semibold text-term-text-dim">{q.symbol}</span>
              <span className="text-term-text">{fmtNum(q.last, q.last > 1000 ? 1 : 2)}</span>
              <span className={up ? "text-term-up" : "text-term-down"}>
                {up ? "▲" : "▼"} {fmtSignedPct(q.chgPct)}
              </span>
            </span>
          );
        })}
        <span className="mx-4 inline-flex items-center gap-1.5 text-3xs text-term-text-mute">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${sourceLabel === "SIM" ? "bg-term-amber" : "bg-term-up"}`} />
          {sourceLabel}{displayAsOf ? ` as of ${displayAsOf}` : ""}
        </span>
      </div>
      <style>{`
        .ticker-track { animation: ticker 60s linear infinite; }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>
    </div>
  );
}
