
import { usePathname } from "@/lib/navigation";
import { NAV } from "@/lib/nav";
import { Search, PanelLeft, Command } from "lucide-react";

export function CommandBar({ onOpenPalette, onToggleSidebar }: { onOpenPalette: () => void; onToggleSidebar: () => void }) {
  const path = usePathname();
  const current = NAV.find((n) => n.href === path) ?? NAV[0];
  return (
    <header className="flex h-9 shrink-0 items-center gap-3 border-b border-term-border bg-term-panel px-3">
      <button onClick={onToggleSidebar} className="text-term-text-mute hover:text-term-amber" title="Toggle sidebar">
        <PanelLeft size={16} />
      </button>
      <div className="flex items-center gap-2">
        <div className="flex h-5 w-5 items-center justify-center bg-term-amber font-mono text-xs font-bold text-black">S</div>
        <span className="font-mono text-sm font-bold tracking-tight text-term-amber">SFX</span>
        <span className="hidden text-3xs uppercase tracking-widest text-term-text-mute sm:inline">Securities Finance Terminal</span>
      </div>

      <div className="mx-1 h-4 w-px bg-term-border" />

      <div className="flex items-center gap-1.5 text-xs">
        <span className="font-mono font-semibold text-term-amber">{current.code}</span>
        <span className="text-term-text-mute">/</span>
        <span className="text-term-text-dim">{current.label}</span>
      </div>

      <button
        onClick={onOpenPalette}
        className="ml-auto flex w-72 items-center gap-2 border border-term-border bg-term-panel-2 px-2 py-1 text-2xs text-term-text-mute hover:border-term-amber/60"
      >
        <Search size={13} />
        <span className="flex-1 text-left">Run command / find security…</span>
        <span className="flex items-center gap-0.5">
          <Command size={10} />
          <span className="term-kbd">K</span>
        </span>
      </button>

      <div className="hidden items-center gap-3 text-3xs text-term-text-mute lg:flex">
        <span>DESK <span className="text-term-text-dim">SEC-FIN</span></span>
        <span>USER <span className="text-term-text-dim">jlutkemuller</span></span>
        <span className="flex items-center gap-1 text-term-up">RBAC <span>● PM</span></span>
      </div>
    </header>
  );
}
