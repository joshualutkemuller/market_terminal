"use client";

/** Correlation matrix / generic heat grid. */
export function CorrelationMatrix({ labels, values, height = 280, className }: { labels: string[]; values: number[][]; height?: number; className?: string }) {
  const n = labels.length;
  const cell = Math.min(height / (n + 1), 30);
  const color = (v: number) => {
    if (v >= 0) return `rgba(46,204,113,${(0.12 + Math.abs(v) * 0.7).toFixed(3)})`;
    return `rgba(255,59,59,${(0.12 + Math.abs(v) * 0.7).toFixed(3)})`;
  };
  const W = cell * (n + 1.4);
  const H = cell * (n + 1.4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} style={{ width: "100%", height }}>
      {labels.map((l, i) => (
        <text key={`r${i}`} x={cell * 1.3} y={cell * (i + 2) - cell / 2 + 3} textAnchor="end" fontSize={cell * 0.34} fill="#9A9AA3" fontFamily="var(--font-mono)">
          {l}
        </text>
      ))}
      {labels.map((l, j) => (
        <text key={`c${j}`} x={cell * 1.4 + cell * (j + 0.5)} y={cell} textAnchor="middle" fontSize={cell * 0.34} fill="#9A9AA3" fontFamily="var(--font-mono)">
          {l}
        </text>
      ))}
      {values.map((row, i) =>
        row.map((v, j) => (
          <g key={`${i}-${j}`}>
            <rect x={cell * 1.4 + cell * j} y={cell * 1.4 + cell * i} width={cell - 1} height={cell - 1} fill={color(v)} />
            {cell > 18 && (
              <text x={cell * 1.4 + cell * j + cell / 2} y={cell * 1.4 + cell * i + cell / 2 + 3} textAnchor="middle" fontSize={cell * 0.3} fill="#E6E6E6" fontFamily="var(--font-mono)">
                {v.toFixed(2)}
              </text>
            )}
          </g>
        ))
      )}
    </svg>
  );
}

/** Generic value heat grid with row/column labels. */
export function HeatGrid({
  rows,
  cols,
  values,
  fmt,
  height = 280,
  className,
}: {
  rows: string[];
  cols: string[];
  values: number[][];
  fmt?: (n: number) => string;
  height?: number;
  className?: string;
}) {
  const max = Math.max(...values.flat().map(Math.abs), 1e-9);
  return (
    <div className={className} style={{ maxHeight: height, overflow: "auto" }}>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-term-panel-2 px-2 py-1 text-left text-2xs text-term-text-mute" />
            {cols.map((c) => (
              <th key={c} className="px-1 py-1 text-center text-3xs font-semibold text-term-text-mute">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tnum">
          {rows.map((r, i) => (
            <tr key={r}>
              <td className="sticky left-0 z-10 bg-term-panel px-2 py-1 text-left text-2xs text-term-text-dim">{r}</td>
              {cols.map((c, j) => {
                const v = values[i]?.[j] ?? 0;
                const t = Math.abs(v) / max;
                return (
                  <td key={c} className="px-1 py-1 text-center text-3xs" style={{ background: `rgba(255,140,0,${(t * 0.6).toFixed(3)})` }}>
                    {fmt ? fmt(v) : v.toFixed(0)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
