
import type { ReactNode } from "react";
import { useTick } from "@/lib/hooks";
import { Tag } from "./Panel";

/** Consistent module header: code, title, live badge, right-aligned actions. */
export function PageHeader({ code, title, desc, right, asOf }: { code: string; title: string; desc?: string; right?: ReactNode; asOf?: string | null }) {
  const tick = useTick(3000);
  return (
    <div className="flex items-center justify-between border-b border-term-border bg-term-panel px-3 py-2">
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-base font-bold tracking-tight text-term-amber">{code}</span>
        <h1 className="text-sm font-semibold text-term-text">{title}</h1>
        {desc && <span className="hidden text-2xs text-term-text-mute md:inline">{desc}</span>}
      </div>
      <div className="flex items-center gap-2">
        {asOf && (
          <span
            className="tnum rounded-sm border border-term-border bg-term-panel-2 px-1.5 py-px text-3xs font-semibold uppercase tracking-wide text-term-text-dim"
            title="As-of date of the latest underlying data point"
          >
            DATA AS OF {asOf}
          </span>
        )}
        {right}
        <Tag tone="up">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-term-up animate-blink align-middle" />
          STREAMING
        </Tag>
        <span className="tnum hidden text-3xs text-term-text-mute lg:inline" suppressHydrationWarning>
          TICK {String(tick).padStart(5, "0")}
        </span>
      </div>
    </div>
  );
}

/** A row of compact KPI stats used at the top of most modules. */
export function KpiStrip({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 divide-x divide-term-border border-b border-term-border bg-term-panel sm:grid-cols-3 lg:grid-cols-6">{children}</div>;
}
