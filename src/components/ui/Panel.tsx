import clsx from "clsx";
import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  code?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  scroll?: boolean;
  accent?: boolean;
}

/** The standard bordered terminal panel with a title strip. */
export function Panel({ title, code, right, children, className, bodyClassName, scroll, accent }: PanelProps) {
  return (
    <section className={clsx("flex min-h-0 flex-col border bg-term-panel", accent ? "border-term-amber/40" : "border-term-border", className)}>
      {title && (
        <header className="term-panel-head shrink-0">
          <div className="flex items-center gap-2">
            {accent && <span className="h-2 w-2 rounded-full bg-term-amber shadow-[0_0_6px_#FF8C00]" />}
            <span className="text-term-text-dim">{title}</span>
            {code && <span className="text-3xs text-term-text-mute">{code}</span>}
          </div>
          {right}
        </header>
      )}
      <div className={clsx("min-h-0 flex-1", scroll && "overflow-auto", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "up" | "down" | "amber" | "neutral";
  className?: string;
}) {
  const toneClass =
    tone === "up" ? "text-term-up" : tone === "down" ? "text-term-down" : tone === "amber" ? "text-term-amber" : "text-term-text";
  return (
    <div className={clsx("flex flex-col gap-0.5 px-3 py-2", className)}>
      <div className="term-label">{label}</div>
      <div className={clsx("tnum text-lg font-semibold leading-none", toneClass)}>{value}</div>
      {sub != null && <div className="tnum text-2xs text-term-text-dim">{sub}</div>}
    </div>
  );
}

export function Tag({ children, tone = "neutral", className }: { children: ReactNode; tone?: "up" | "down" | "amber" | "neutral" | "blue" | "violet"; className?: string }) {
  const map: Record<string, string> = {
    up: "border-term-up/40 bg-term-up/10 text-term-up",
    down: "border-term-down/40 bg-term-down/10 text-term-down",
    amber: "border-term-amber/40 bg-term-amber/10 text-term-amber",
    blue: "border-term-blue/40 bg-term-blue/10 text-term-blue",
    violet: "border-term-violet/40 bg-term-violet/10 text-term-violet",
    neutral: "border-term-border bg-term-panel-3 text-term-text-dim",
  };
  return (
    <span className={clsx("inline-flex items-center rounded-sm border px-1.5 py-px text-3xs font-semibold uppercase tracking-wide", map[tone], className)}>
      {children}
    </span>
  );
}
