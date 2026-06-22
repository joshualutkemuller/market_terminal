
import { getIndices } from "@/data/markets";
import { fmtNum, fmtSignedPct } from "@/lib/format";

/** Scrolling top marquee of headline indices/rates. */
export function Ticker() {
  const idx = getIndices();
  const items = [...idx, ...idx]; // duplicate for seamless loop
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
      </div>
      <style>{`
        .ticker-track { animation: ticker 60s linear infinite; }
        @keyframes ticker { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>
    </div>
  );
}
