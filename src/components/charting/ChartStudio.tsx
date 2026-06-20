"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Plus, X, Search } from "lucide-react";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { ChartCanvas } from "./ChartCanvas";
import { useChartSeries } from "@/lib/charting/resolver";
import { RANGE_PRESETS, SERIES_COLORS, type ChartType, type RangePreset, type SeriesRef } from "@/lib/charting/spec";
import { TRANSFORMS, TRANSFORM_LABELS, transformFmt, type Transform } from "@/lib/charting/transforms";
import { US_RECESSIONS } from "@/lib/charting/recessions";
import { INDICATOR_PRESETS, computeIndicator, synthOHLC, type IndicatorSpec } from "@/lib/charting/indicators";
import { STUDY_PRESETS, computeStudy, monthlySeasonality, type StudySpec } from "@/lib/charting/studies";
import type { CatalogItem } from "@/data/chartCatalog";

const CHART_TYPES: ChartType[] = ["line", "area", "candles"];

const MAX_SERIES = 6;

const SOURCE_TONE: Record<string, "up" | "amber" | "blue" | "violet" | "neutral" | "down"> = {
  FRED: "up", SNAPSHOT: "violet", ECON: "blue", SIM: "amber", ERR: "down",
};

interface ChartStudioProps {
  code: string;
  title: string;
  desc: string;
  catalog: CatalogItem[];
  defaultRefs: SeriesRef[];
  allowChartType?: boolean;
  defaultChartType?: ChartType;
  /** Show the NBER recession-shading toggle (macro studio). */
  recessionShading?: boolean;
  /** Show the technical-indicator controls (MA/Bollinger/RSI/MACD). */
  allowIndicators?: boolean;
}

function refKey(r: SeriesRef): string {
  return `${r.source}:${r.id}`;
}

export function ChartStudio({ code, title, desc, catalog, defaultRefs, allowChartType = false, defaultChartType = "line", recessionShading = false, allowIndicators = false }: ChartStudioProps) {
  const [refs, setRefs] = useState<SeriesRef[]>(defaultRefs);
  const [range, setRange] = useState<RangePreset>("2Y");
  const [transform, setTransform] = useState<Transform>("none");
  const [chartType, setChartType] = useState<ChartType>(defaultChartType);
  const [showRecession, setShowRecession] = useState(recessionShading);
  const [indicators, setIndicators] = useState<IndicatorSpec[]>([]);
  const [indMenu, setIndMenu] = useState(false);
  const [studies, setStudies] = useState<StudySpec[]>([]);
  const [studyMenu, setStudyMenu] = useState(false);
  const [showSeasonality, setShowSeasonality] = useState(false);
  const [query, setQuery] = useState("");

  const { axis, series, loading } = useChartSeries(refs, range, transform);

  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);

  const results = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    return catalog
      .filter((c) => c.id.toUpperCase().includes(q) || c.label.toUpperCase().includes(q) || (c.sub ?? "").toUpperCase().includes(q))
      .slice(0, 8);
  }, [query, catalog]);

  const addRef = (item: CatalogItem) => {
    const ref: SeriesRef = { source: item.source, id: item.id, assetClass: item.assetClass };
    setRefs((prev) => (prev.some((r) => refKey(r) === refKey(ref)) || prev.length >= MAX_SERIES ? prev : [...prev, ref]));
    setQuery("");
  };
  const removeRef = (r: SeriesRef) => setRefs((prev) => prev.filter((x) => refKey(x) !== refKey(r)));

  const addIndicator = (spec: Omit<IndicatorSpec, "id">) => {
    setIndicators((prev) => [...prev, { ...spec, id: `${spec.type}-${Math.random().toString(36).slice(2, 7)}` }]);
    setIndMenu(false);
  };
  const removeIndicator = (id: string) => setIndicators((prev) => prev.filter((i) => i.id !== id));

  const addStudy = (spec: Omit<StudySpec, "id">) => {
    setStudies((prev) => [...prev, { ...spec, id: `${spec.type}-${Math.random().toString(36).slice(2, 7)}` }]);
    setStudyMenu(false);
  };
  const removeStudy = (id: string) => setStudies((prev) => prev.filter((s) => s.id !== id));

  const allSeries = series.map((s, i) => ({
    label: byId.get(s.ref.id)?.label ?? s.label,
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    values: s.values,
    area: chartType === "area",
  }));

  // Indicators are computed on the primary (first) series.
  const primary = series[0];
  const indResults = useMemo(
    () => indicators.map((spec, i) => computeIndicator(spec, primary?.values ?? [], i)),
    [indicators, primary?.values]
  );
  const overlays = indResults.flatMap((r) => r.overlays);

  // Studies (spread/ratio/rolling corr/beta/percentile) → oscillator panes.
  const studyPanes = useMemo(() => {
    const vals = series.map((s) => s.values);
    const labels = series.map((s) => byId.get(s.ref.id)?.label ?? s.label);
    return studies.map((spec) => computeStudy(spec, vals, labels)).filter((p): p is NonNullable<typeof p> => p != null);
  }, [studies, series, byId]);

  const oscPanes = [...indResults.flatMap((r) => r.oscPanes), ...studyPanes];

  const seasonality = useMemo(
    () => (showSeasonality && primary ? monthlySeasonality(axis, primary.values) : null),
    [showSeasonality, axis, primary]
  );
  const seasonalityMax = seasonality ? Math.max(0.01, ...seasonality.map((m) => Math.abs(m.mean ?? 0))) : 1;

  const candles = chartType === "candles" && primary ? synthOHLC(primary.values) : undefined;
  // In candle mode the primary is drawn as candlesticks; remaining series stay as lines.
  const mainSeries = candles ? allSeries.slice(1) : allSeries;

  const yFmt = transformFmt(transform);
  const sources = Array.from(new Set(series.map((s) => s.source)));

  const btn = "rounded-sm border px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide transition-colors";

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        code={code}
        title={title}
        desc={desc}
        right={
          <span className="flex items-center gap-1">
            {sources.map((s) => (
              <Tag key={s} tone={SOURCE_TONE[s] ?? "neutral"}>{s}</Tag>
            ))}
          </span>
        }
      />

      <KpiStrip>
        <Stat label="Series" value={refs.length} sub={`of ${MAX_SERIES} max`} tone="amber" />
        <Stat label="Range" value={range} sub="lookback" />
        <Stat label="Transform" value={TRANSFORM_LABELS[transform]} sub={transform === "none" ? "native units" : "applied"} tone={transform === "none" ? "neutral" : "amber"} />
        <Stat label="Points" value={axis.length} sub={loading ? "loading…" : "observations"} tone={axis.length ? "up" : "neutral"} />
        <Stat label="Sources" value={sources.join(", ") || "—"} sub="provenance" />
      </KpiStrip>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-term-border bg-term-panel px-3 py-1.5">
        {/* Series search */}
        <div className="relative">
          <div className="flex items-center gap-1 rounded-sm border border-term-border bg-term-panel-2 px-2">
            <Search className="h-3 w-3 text-term-text-mute" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add series…"
              className="h-6 w-40 bg-transparent text-2xs text-term-text outline-none placeholder:text-term-text-mute"
            />
          </div>
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 max-h-72 w-64 overflow-auto rounded-sm border border-term-border bg-term-panel shadow-xl">
              {results.map((c) => (
                <button
                  key={`${c.source}:${c.id}`}
                  onClick={() => addRef(c)}
                  className="flex w-full items-center justify-between gap-2 px-2 py-1 text-left text-2xs hover:bg-term-panel-3"
                >
                  <span className="flex items-center gap-1.5">
                    <Plus className="h-3 w-3 text-term-amber" />
                    <span className="w-12 font-semibold text-term-text">{c.label}</span>
                    <span className="truncate text-term-text-mute">{c.sub}</span>
                  </span>
                  <Tag tone="neutral">{c.group}</Tag>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Range presets */}
        <div className="flex flex-wrap gap-1">
          {RANGE_PRESETS.map((r) => (
            <button key={r} onClick={() => setRange(r)} className={clsx(btn, range === r ? "border-term-amber bg-term-amber text-black" : "border-term-border bg-term-panel-2 text-term-text-mute hover:text-term-text")}>
              {r}
            </button>
          ))}
        </div>

        {/* Transform */}
        <select
          value={transform}
          onChange={(e) => setTransform(e.target.value as Transform)}
          className="h-6 rounded-sm border border-term-border bg-term-panel-2 px-1.5 text-2xs text-term-text outline-none focus:border-term-amber"
        >
          {TRANSFORMS.map((t) => (
            <option key={t} value={t}>{TRANSFORM_LABELS[t]}</option>
          ))}
        </select>

        {/* Recession shading (macro) */}
        {recessionShading && (
          <button onClick={() => setShowRecession((v) => !v)} className={clsx(btn, showRecession ? "border-term-amber bg-term-amber/15 text-term-amber" : "border-term-border bg-term-panel-2 text-term-text-mute hover:text-term-text")}>
            Recessions
          </button>
        )}

        {/* Chart type (MKC) */}
        {allowChartType && (
          <div className="flex gap-1">
            {CHART_TYPES.map((t) => (
              <button key={t} onClick={() => setChartType(t)} className={clsx(btn, chartType === t ? "border-term-amber bg-term-amber text-black" : "border-term-border bg-term-panel-2 text-term-text-mute hover:text-term-text")}>
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Indicators */}
        {allowIndicators && (
          <div className="relative">
            <button onClick={() => setIndMenu((v) => !v)} className={clsx(btn, indMenu ? "border-term-amber bg-term-amber/15 text-term-amber" : "border-term-border bg-term-panel-2 text-term-text-mute hover:text-term-text")}>
              + Indicator
            </button>
            {indMenu && (
              <div className="absolute z-20 mt-1 w-44 overflow-hidden rounded-sm border border-term-border bg-term-panel shadow-xl">
                {INDICATOR_PRESETS.map((p) => (
                  <button key={p.label} onClick={() => addIndicator(p.spec)} className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-2xs text-term-text hover:bg-term-panel-3">
                    <Plus className="h-3 w-3 text-term-amber" />
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Studies (derived series / pair analytics) */}
        <div className="relative">
          <button onClick={() => setStudyMenu((v) => !v)} className={clsx(btn, studyMenu ? "border-term-amber bg-term-amber/15 text-term-amber" : "border-term-border bg-term-panel-2 text-term-text-mute hover:text-term-text")}>
            + Study
          </button>
          {studyMenu && (
            <div className="absolute z-20 mt-1 w-52 overflow-hidden rounded-sm border border-term-border bg-term-panel shadow-xl">
              {STUDY_PRESETS.map((p) => {
                const disabled = p.needsPair && refs.length < 2;
                return (
                  <button
                    key={p.label}
                    onClick={() => !disabled && addStudy(p.spec)}
                    disabled={disabled}
                    title={disabled ? "Add a second series (S1, S2) first" : undefined}
                    className={clsx("flex w-full items-center gap-1.5 px-2 py-1 text-left text-2xs", disabled ? "cursor-not-allowed text-term-text-mute/50" : "text-term-text hover:bg-term-panel-3")}
                  >
                    <Plus className="h-3 w-3 text-term-amber" />
                    {p.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Seasonality */}
        <button onClick={() => setShowSeasonality((v) => !v)} className={clsx(btn, showSeasonality ? "border-term-amber bg-term-amber/15 text-term-amber" : "border-term-border bg-term-panel-2 text-term-text-mute hover:text-term-text")}>
          Seasonality
        </button>

        {/* Active indicator + study chips */}
        {indicators.map((ind) => (
          <span key={ind.id} className="flex items-center gap-1 rounded-sm border border-term-border bg-term-panel-2 px-1.5 py-0.5 text-3xs text-term-text-dim">
            {ind.type.toUpperCase()}{ind.length ? ` ${ind.length}` : ind.type === "macd" ? ` ${ind.fast}/${ind.slow}/${ind.signal}` : ""}
            <button onClick={() => removeIndicator(ind.id)} className="text-term-text-mute hover:text-term-down" aria-label="remove indicator">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        {studies.map((s) => (
          <span key={s.id} className="flex items-center gap-1 rounded-sm border border-term-amber/40 bg-term-amber/5 px-1.5 py-0.5 text-3xs text-term-amber">
            {s.type.replace("_", " ").toUpperCase()}{s.window ? ` ${s.window}` : ""}
            <button onClick={() => removeStudy(s.id)} className="text-term-text-mute hover:text-term-down" aria-label="remove study">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-2">
        <Panel title="Chart" code={code} accent>
          <div className="p-2">
            <ChartCanvas axis={axis} series={mainSeries} candles={candles} overlays={overlays} oscPanes={oscPanes} height={candles || overlays.length ? 340 : 360} yFmt={yFmt} recessions={showRecession ? US_RECESSIONS : undefined} />
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-1.5 border-t border-term-border px-2 py-1.5">
            {series.map((s, i) => (
              <span key={refKey(s.ref)} className="flex items-center gap-1 rounded-sm border border-term-border bg-term-panel-2 px-1.5 py-0.5 text-2xs">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
                <span className="font-semibold text-term-text">{byId.get(s.ref.id)?.label ?? s.ref.id}</span>
                <Tag tone={SOURCE_TONE[s.source] ?? "neutral"}>{s.source}</Tag>
                <button onClick={() => removeRef(s.ref)} className="text-term-text-mute hover:text-term-down" aria-label="remove">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {refs.length === 0 && <span className="text-2xs text-term-text-mute">Add a series to begin.</span>}
          </div>
        </Panel>

        {/* Seasonality — average % return by calendar month for the primary series */}
        {seasonality && (
          <Panel title={`Seasonality — ${primary ? byId.get(primary.ref.id)?.label ?? primary.ref.id : ""}`} code="SEAS">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 p-3 sm:grid-cols-3 lg:grid-cols-4">
              {seasonality.map((m) => {
                const v = m.mean ?? 0;
                const w = Math.min(1, Math.abs(v) / seasonalityMax) * 100;
                const pos = v >= 0;
                return (
                  <div key={m.month} className="grid grid-cols-[28px_1fr_52px] items-center gap-2 text-2xs">
                    <span className="font-semibold text-term-text-dim">{m.month}</span>
                    <div className="relative h-3 bg-term-panel-3">
                      <div className={clsx("absolute top-0 h-full", pos ? "left-1/2 bg-term-up/60" : "right-1/2 bg-term-down/60")} style={{ width: `${w / 2}%` }} />
                      <div className="absolute left-1/2 top-0 h-full w-px bg-term-border" />
                    </div>
                    <span className={clsx("tnum text-right", m.mean == null ? "text-term-text-mute" : pos ? "text-term-up" : "text-term-down")}>
                      {m.mean == null ? "—" : `${pos ? "+" : ""}${v.toFixed(2)}%`}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-term-border px-3 py-1 text-3xs text-term-text-mute">
              Average month-over-month % change by calendar month over the visible range.
            </div>
          </Panel>
        )}
      </div>

      <div className="border-t border-term-border bg-term-panel px-3 py-1.5 text-3xs text-term-text-mute">
        <span className="text-term-amber">{title}</span> — freeform charting on the terminal&apos;s existing data layer.
        {" "}Macro via FRED/econ · market via committed snapshots. ETF proxies labelled; research-grade data.
      </div>
    </div>
  );
}
