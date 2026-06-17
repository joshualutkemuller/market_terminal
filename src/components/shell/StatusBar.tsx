"use client";

import { useClock } from "@/lib/hooks";
import { fmtClock } from "@/lib/format";
import { getActiveAlerts } from "@/data/alerts";

/** Bottom status bar: clocks, feed health, alert counts, build tag. */
export function StatusBar() {
  const now = useClock(120);
  const alerts = getActiveAlerts();
  const critical = alerts.filter((a) => a.severity === "CRITICAL").length;
  const high = alerts.filter((a) => a.severity === "HIGH").length;

  const tz = (label: string, offset: number) => {
    if (!now) return "--:--:--";
    const d = new Date(now.getTime() + offset * 3600 * 1000);
    return `${label} ${d.toUTCString().slice(17, 25)}`;
  };

  return (
    <footer className="flex h-6 shrink-0 items-center justify-between border-t border-term-border bg-term-panel px-3 text-3xs text-term-text-dim">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 font-semibold text-term-up">
          <span className="h-1.5 w-1.5 rounded-full bg-term-up animate-blink" /> FEED LIVE
        </span>
        <span className="tnum">{now ? fmtClock(now) : "--:--:--"}</span>
        <span className="hidden tnum text-term-text-mute md:inline">{tz("NY", -5)}</span>
        <span className="hidden tnum text-term-text-mute md:inline">{tz("LDN", 0)}</span>
        <span className="hidden tnum text-term-text-mute lg:inline">{tz("TKY", 9)}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="tnum">KAFKA <span className="text-term-up">●</span> 8.2k msg/s</span>
        <span className="tnum">WS <span className="text-term-up">●</span> 14 streams</span>
        {critical > 0 && <span className="tnum font-semibold text-term-down">⚠ {critical} CRIT</span>}
        {high > 0 && <span className="tnum text-term-amber">{high} HIGH</span>}
        <span className="tnum text-term-text-mute">SFX-TERM v0.1.0</span>
      </div>
    </footer>
  );
}
