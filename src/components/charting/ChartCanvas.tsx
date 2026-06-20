"use client";

import { useId, useRef, useState } from "react";
import clsx from "clsx";

export interface CanvasSeries {
  label: string;
  color: string;
  values: (number | null)[]; // aligned to `axis`
  area?: boolean;
}

interface ChartCanvasProps {
  axis: string[]; // ISO dates
  series: CanvasSeries[];
  height?: number;
  yFmt?: (n: number) => string;
  className?: string;
}

/** Build an SVG path with gaps for null values. */
function pathWithGaps(values: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v == null || !Number.isFinite(v)) { pen = false; return; }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    pen = true;
  });
  return d.trim();
}

/**
 * Multi-series line/area chart with grid, axis labels, crosshair and a
 * hover tooltip. SVG-based, matching the terminal's existing chart styling.
 * The shared engine renderer behind both charting studios (Phase 0).
 */
export function ChartCanvas({ axis, series, height = 320, yFmt, className }: ChartCanvasProps) {
  const gid = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 800;
  const H = height;
  const padL = 56, padR = 12, padT = 10, padB = 22;

  const flat = series.flatMap((s) => s.values).filter((v): v is number => v != null && Number.isFinite(v));
  const hasData = flat.length > 0 && axis.length > 1;
  const min = hasData ? Math.min(...flat) : 0;
  const max = hasData ? Math.max(...flat) : 1;
  const range = max - min || 1;
  const n = axis.length;

  const x = (i: number) => padL + (i / Math.max(1, n - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - min) / range) * (H - padT - padB);

  const yticks = 5;
  const gridVals = Array.from({ length: yticks + 1 }, (_, i) => min + (range * i) / yticks);
  const fmt = yFmt ?? ((v: number) => v.toFixed(2));

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el || n < 2) return;
    const rect = el.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const plotFrac = (frac * W - padL) / (W - padL - padR);
    const idx = Math.round(Math.min(1, Math.max(0, plotFrac)) * (n - 1));
    setHover(idx);
  };

  const xLabelEvery = Math.max(1, Math.ceil(n / 7));

  return (
    <div ref={wrapRef} className={clsx("relative", className)} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
        {/* grid + y labels */}
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#1F1F23" strokeWidth={1} />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#5E5E66" fontFamily="var(--font-mono)">
              {fmt(v)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {axis.map((d, i) =>
          i % xLabelEvery === 0 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="#5E5E66" fontFamily="var(--font-mono)">
              {d.slice(0, 7)}
            </text>
          ) : null
        )}

        {/* series */}
        {hasData &&
          series.map((s, si) => {
            const d = pathWithGaps(s.values, x, y);
            return (
              <g key={si}>
                {s.area && d && (
                  <>
                    <defs>
                      <linearGradient id={`${gid}-a${si}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <path d={`${d} L${x(n - 1).toFixed(1)},${y(min).toFixed(1)} L${x(0).toFixed(1)},${y(min).toFixed(1)} Z`} fill={`url(#${gid}-a${si})`} />
                  </>
                )}
                <path d={d} fill="none" stroke={s.color} strokeWidth={1.4} strokeLinejoin="round" />
              </g>
            );
          })}

        {/* crosshair */}
        {hover != null && hasData && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke="#5E5E66" strokeWidth={1} strokeDasharray="3 2" />
            {series.map((s, si) => {
              const v = s.values[hover];
              return v == null ? null : <circle key={si} cx={x(hover)} cy={y(v)} r={2.6} fill={s.color} />;
            })}
          </g>
        )}
      </svg>

      {/* tooltip */}
      {hover != null && hasData && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-32 -translate-x-1/2 rounded-sm border border-term-border bg-term-panel/95 px-2 py-1 text-2xs shadow-lg"
          style={{ left: `${(x(hover) / W) * 100}%` }}
        >
          <div className="mb-0.5 text-3xs text-term-text-mute">{axis[hover]}</div>
          {series.map((s, si) => (
            <div key={si} className="flex items-center justify-between gap-3 tnum">
              <span className="flex items-center gap-1">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                <span className="text-term-text-dim">{s.label}</span>
              </span>
              <span className="text-term-text">{s.values[hover] == null ? "—" : fmt(s.values[hover] as number)}</span>
            </div>
          ))}
        </div>
      )}

      {!hasData && (
        <div className="absolute inset-0 flex items-center justify-center text-2xs text-term-text-mute">No data for this selection</div>
      )}
    </div>
  );
}
