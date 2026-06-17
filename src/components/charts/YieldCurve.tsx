"use client";

import { useId } from "react";

export interface CurveLine {
  label: string;
  color: string;
  points: { months: number; tenor: string; yield: number }[];
  dashed?: boolean;
  dots?: boolean;
}

interface YieldCurveProps {
  lines: CurveLine[];
  height?: number;
  className?: string;
  /** highlight inversion shading where front > back */
  shadeInversion?: boolean;
}

/**
 * Treasury yield curve chart. X axis is tenor on a log-month scale (so the short
 * end is readable), Y axis is yield %. Supports overlaying multiple snapshots.
 */
export function YieldCurve({ lines, height = 280, className, shadeInversion }: YieldCurveProps) {
  const id = useId();
  const W = 620;
  const H = height;
  const padL = 40;
  const padR = 44;
  const padT = 12;
  const padB = 26;

  const all = lines.flatMap((l) => l.points);
  const maxY = Math.max(...all.map((p) => p.yield)) + 0.3;
  const minY = Math.min(0, ...all.map((p) => p.yield)) - 0.1;
  const months = Array.from(new Set(all.map((p) => p.months))).sort((a, b) => a - b);
  const lx = (m: number) => Math.log(m);
  const minX = lx(Math.min(...months));
  const maxX = lx(Math.max(...months));
  const x = (m: number) => padL + ((lx(m) - minX) / (maxX - minX || 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - minY) / (maxY - minY || 1)) * (H - padT - padB);

  const yticks = 5;
  const tenorLabels = lines[0]?.points ?? all;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none" style={{ width: "100%", height }}>
      {/* y grid */}
      {Array.from({ length: yticks + 1 }, (_, i) => minY + ((maxY - minY) * i) / yticks).map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#1A1A1D" strokeWidth={1} />
          <text x={padL - 5} y={y(v) + 3} textAnchor="end" fontSize={9} fill="#5E5E66" fontFamily="var(--font-mono)">
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      {/* x tenor ticks */}
      {tenorLabels.map((p) => (
        <text key={p.tenor} x={x(p.months)} y={H - 8} textAnchor="middle" fontSize={9} fill="#5E5E66" fontFamily="var(--font-mono)">
          {p.tenor}
        </text>
      ))}

      {/* inversion shading: area between first line and a flat ref at its 10Y where front-end is higher */}
      {shadeInversion && lines[0] && (() => {
        const pts = [...lines[0].points].sort((a, b) => a.months - b.months);
        const back = pts[pts.length - 1].yield;
        const segs = pts.filter((p) => p.yield > back + 0.01);
        if (segs.length < 1) return null;
        return (
          <g>
            {segs.map((p, i) => (
              <line key={i} x1={x(p.months)} x2={x(p.months)} y1={y(p.yield)} y2={y(back)} stroke="#FF3B3B" strokeWidth={1} opacity={0.18} />
            ))}
          </g>
        );
      })()}

      {lines.map((l, li) => {
        const pts = [...l.points].sort((a, b) => a.months - b.months);
        const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.months).toFixed(1)},${y(p.yield).toFixed(1)}`).join(" ");
        return (
          <g key={li}>
            <path d={d} fill="none" stroke={l.color} strokeWidth={1.75} strokeDasharray={l.dashed ? "5 3" : undefined} strokeLinejoin="round" />
            {(l.dots ?? li === 0) &&
              pts.map((p, i) => <circle key={i} cx={x(p.months)} cy={y(p.yield)} r={2.2} fill={l.color} />)}
          </g>
        );
      })}
    </svg>
  );
}
