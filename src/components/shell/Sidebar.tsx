"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { NAV, NAV_GROUPS } from "@/lib/nav";

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const path = usePathname();
  return (
    <nav className={clsx("flex shrink-0 flex-col border-r border-term-border bg-term-panel transition-all", collapsed ? "w-12" : "w-52")}>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {NAV_GROUPS.map((g) => {
          const items = NAV.filter((n) => n.group === g.id);
          return (
            <div key={g.id} className="mb-1">
              {!collapsed && <div className="px-3 pb-0.5 pt-2 text-3xs font-semibold uppercase tracking-widest text-term-text-mute">{g.label}</div>}
              {items.map((n) => {
                const active = path === n.href;
                const Icon = n.icon;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    title={`${n.label} — ${n.desc}`}
                    className={clsx(
                      "group flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors",
                      active ? "border-l-2 border-term-amber bg-term-amber-soft text-term-amber" : "border-l-2 border-transparent text-term-text-dim hover:bg-term-panel-2 hover:text-term-text"
                    )}
                  >
                    <Icon size={15} className={clsx("shrink-0", active && "text-term-amber")} />
                    {!collapsed && (
                      <span className="flex min-w-0 flex-1 items-center justify-between">
                        <span className="truncate">{n.label}</span>
                        <span className={clsx("ml-1 font-mono text-3xs", active ? "text-term-amber/70" : "text-term-text-mute")}>{n.code}</span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      {!collapsed && (
        <div className="border-t border-term-border px-3 py-2 text-3xs text-term-text-mute">
          <div className="flex items-center justify-between">
            <span>SESSION</span>
            <span className="text-term-up">● LIVE</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>LATENCY</span>
            <span className="tnum text-term-text-dim">2.4ms</span>
          </div>
        </div>
      )}
    </nav>
  );
}
