
import { fmtSignedPct } from "@/lib/format";

export interface TreeCell {
  label: string;
  weight: number;
  value: number; // colored by this (e.g. % change)
  group?: string;
}

interface TreemapProps {
  cells: TreeCell[];
  height?: number;
  className?: string;
  maxAbs?: number;
}

function color(v: number, maxAbs: number): string {
  const t = Math.max(-1, Math.min(1, v / (maxAbs || 1)));
  if (t >= 0) return `rgba(46,204,113,${(0.18 + t * 0.62).toFixed(3)})`;
  return `rgba(255,59,59,${(0.18 + -t * 0.62).toFixed(3)})`;
}

/** Squarified-ish treemap (slice-and-dice rows). Good enough for a dense heat grid. */
export function Treemap({ cells, height = 260, className, maxAbs = 4 }: TreemapProps) {
  const sorted = [...cells].sort((a, b) => b.weight - a.weight);
  const total = sorted.reduce((a, c) => a + c.weight, 0) || 1;
  const W = 100;
  const H = 100;
  // Lay out in rows targeting ~ aspect via row capacity.
  const rows: TreeCell[][] = [];
  let row: TreeCell[] = [];
  let rowSum = 0;
  const target = total / Math.ceil(Math.sqrt(sorted.length));
  for (const c of sorted) {
    row.push(c);
    rowSum += c.weight;
    if (rowSum >= target) {
      rows.push(row);
      row = [];
      rowSum = 0;
    }
  }
  if (row.length) rows.push(row);

  const rowWeights = rows.map((r) => r.reduce((a, c) => a + c.weight, 0));
  const rowTotal = rowWeights.reduce((a, b) => a + b, 0) || 1;

  let y = 0;
  const out: { x: number; y: number; w: number; h: number; cell: TreeCell }[] = [];
  rows.forEach((r, ri) => {
    const rh = (rowWeights[ri] / rowTotal) * H;
    let x = 0;
    const rw = rowWeights[ri] || 1;
    for (const cell of r) {
      const cw = (cell.weight / rw) * W;
      out.push({ x, y, w: cw, h: rh, cell });
      x += cw;
    }
    y += rh;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none" style={{ width: "100%", height }}>
      {out.map((o, i) => (
        <g key={i}>
          <rect x={o.x} y={o.y} width={o.w} height={o.h} fill={color(o.cell.value, maxAbs)} stroke="#0A0A0A" strokeWidth={0.4} />
          {o.w > 8 && o.h > 8 && (
            <>
              <text x={o.x + o.w / 2} y={o.y + o.h / 2 - 1} textAnchor="middle" fontSize={Math.min(3.4, o.w / 4)} fill="#fff" fontFamily="var(--font-mono)" fontWeight={600}>
                {o.cell.label}
              </text>
              {o.h > 14 && (
                <text x={o.x + o.w / 2} y={o.y + o.h / 2 + 3.2} textAnchor="middle" fontSize={Math.min(2.6, o.w / 5)} fill="rgba(255,255,255,0.8)" fontFamily="var(--font-mono)">
                  {fmtSignedPct(o.cell.value, 1)}
                </text>
              )}
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
