
import { useState } from "react";
import { PageHeader, KpiStrip } from "@/components/ui/PageHeader";
import { Panel, Stat, Tag } from "@/components/ui/Panel";
import { DataGrid, type Column } from "@/components/ui/DataGrid";
import { BarChart } from "@/components/charts/BarChart";
import { SourceBadge } from "@/components/econ/SourceBadge";
import { getCalendarSensitivity, getReleaseMoveSummaries, type CalendarSensitivityTag, type ReleaseMoveSummary } from "@/data/econEnhancements";
import { useEconCalendar } from "@/lib/useEcon";
import { useTick, useMounted } from "@/lib/hooks";
import type { EconEvent, EventImportance } from "@/data/econRates";
import { fmtSigned } from "@/lib/format";

const IMPORTANCES: (EventImportance | "ALL")[] = ["ALL", "HIGH", "MEDIUM", "LOW"];

function importanceTone(imp: EventImportance): "down" | "blue" | "neutral" {
  if (imp === "HIGH") return "down";
  if (imp === "MEDIUM") return "blue";
  return "neutral";
}

function importanceDot(imp: EventImportance): string {
  if (imp === "HIGH") return "#FF8C00";
  if (imp === "MEDIUM") return "#3B9DFF";
  return "#5E5E66";
}

function sensitivityTone(tag: CalendarSensitivityTag): "up" | "down" | "amber" | "blue" | "violet" {
  if (tag === "Rates P&L") return "amber";
  if (tag === "Haircut Risk") return "down";
  if (tag === "Borrow Demand") return "up";
  if (tag === "Funding Liquidity") return "blue";
  return "violet";
}

/** Parse a percent-ish string ("0.3%", "145k", "4.3%") to a number for beat/miss. */
function toNum(s: string | null): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let v = parseFloat(m[0]);
  if (/k/i.test(s)) v *= 1e3;
  if (/m/i.test(s)) v *= 1e6;
  return isFinite(v) ? v : null;
}

/** Beat / miss / in-line vs consensus. */
function surprise(actual: string | null, consensus: string): { label: string; tone: "up" | "down" | "neutral" } | null {
  const a = toNum(actual);
  const c = toNum(consensus);
  if (a == null || c == null) return null;
  if (a > c) return { label: "BEAT", tone: "up" };
  if (a < c) return { label: "MISS", tone: "down" };
  return { label: "IN-LINE", tone: "neutral" };
}

export default function EconomicCalendarPage() {
  const { data: events, source } = useEconCalendar();
  const moveSummaries = getReleaseMoveSummaries();
  const tick = useTick(2000);
  const mounted = useMounted();
  // "today" reference for the calendar — rendered only after mount so the
  // server/client hydration never disagrees on the date.
  const todayStr = mounted ? new Date().toISOString().slice(0, 10) : null;
  const [impFilter, setImpFilter] = useState<EventImportance | "ALL">("ALL");
  const [catFilter, setCatFilter] = useState<string>("ALL");

  const categories = [...new Set(events.map((e) => e.category))].sort();

  const sorted = [...events].sort((a, b) => a.daysOut - b.daysOut || a.time.localeCompare(b.time));

  // KPIs (computed over the full set, unfiltered).
  const thisWeek = events.filter((e) => e.daysOut >= 0 && e.daysOut <= 7).length;
  const highCount = events.filter((e) => e.importance === "HIGH").length;
  const releasedCount = events.filter((e) => e.actual != null).length;
  const upcoming = sorted.filter((e) => e.daysOut >= 0 && e.actual == null);
  const upcomingCount = upcoming.length;
  const nextEvent = upcoming[0] ?? null;
  const policyCount = events.filter((e) => e.category === "Policy").length;

  const filtered = sorted.filter(
    (e) => (impFilter === "ALL" || e.importance === impFilter) && (catFilter === "ALL" || e.category === catFilter)
  );

  // Group by date preserving daysOut/time sort order.
  const groups: { date: string; daysOut: number; rows: EconEvent[] }[] = [];
  for (const e of filtered) {
    let g = groups.find((x) => x.date === e.date);
    if (!g) {
      g = { date: e.date, daysOut: e.daysOut, rows: [] };
      groups.push(g);
    }
    g.rows.push(e);
  }

  const highImpactWeek = sorted.filter((e) => e.importance === "HIGH" && e.daysOut >= 0 && e.daysOut <= 7);

  const catCounts = categories
    .map((c) => ({ label: c, value: events.filter((e) => e.category === c).length, color: "#FF8C00" }))
    .sort((a, b) => b.value - a.value);

  const moveCols: Column<ReleaseMoveSummary>[] = [
    { key: "release", header: "Release", render: (r) => <span className="font-semibold text-term-text">{r.release}</span>, sortVal: (r) => r.release },
    { key: "factor", header: "Factor", render: (r) => <span className="text-term-amber">{r.factor}</span>, sortVal: (r) => r.factor },
    { key: "pre", header: "Pre", align: "right", render: (r) => <span className="text-term-text-dim">{fmtSigned(r.preMoveBps, 0)}</span>, sortVal: (r) => r.preMoveBps },
    { key: "post", header: "Post", align: "right", render: (r) => <span className={r.postMoveBps >= 0 ? "text-term-up" : "text-term-down"}>{fmtSigned(r.postMoveBps, 0)}</span>, sortVal: (r) => r.postMoveBps },
    { key: "impact", header: "Impact", align: "center", render: (r) => <Tag tone={sensitivityTone(r.deskImpact)}>{r.deskImpact}</Tag>, sortVal: (r) => r.deskImpact },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader code="CAL" title="Economic Calendar" desc="Releases & events" asOf={todayStr} right={<SourceBadge source={source} />} />

      <KpiStrip>
        <Stat label="Events This Week" value={thisWeek} sub="next 7 days" tone="amber" />
        <Stat label="High Importance" value={highCount} sub="HIGH tier" tone="down" />
        <Stat label="Released" value={releasedCount} sub="actual reported" tone="up" />
        <Stat label="Upcoming" value={upcomingCount} sub="awaiting print" />
        <Stat label="Next Event" value={<span className="text-sm">{nextEvent ? nextEvent.name : "—"}</span>} sub={nextEvent ? `${nextEvent.date} ${nextEvent.time}` : "—"} tone="amber" />
        <Stat label="Policy Events" value={policyCount} sub="Fed / FOMC" tone="amber" />
      </KpiStrip>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-term-border bg-term-panel px-3 py-1.5">
        <span className="mr-1 text-3xs uppercase tracking-wider text-term-text-mute">Importance</span>
        {IMPORTANCES.map((i) => (
          <button key={i} className={`term-btn ${impFilter === i ? "term-btn-active" : ""}`} onClick={() => setImpFilter(i)}>
            {i === "ALL" ? "All" : i}
          </button>
        ))}
        <span className="ml-2 mr-1 text-3xs uppercase tracking-wider text-term-text-mute">Category</span>
        <button className={`term-btn ${catFilter === "ALL" ? "term-btn-active" : ""}`} onClick={() => setCatFilter("ALL")}>
          All
        </button>
        {categories.map((c) => (
          <button key={c} className={`term-btn ${catFilter === c ? "term-btn-active" : ""}`} onClick={() => setCatFilter(c)}>
            {c}
          </button>
        ))}
        <span className="ml-auto tnum text-3xs text-term-text-mute">{filtered.length} events</span>
      </div>

      <div className="grid flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        {/* Main calendar stream */}
        <div className="xl:col-span-2">
          <Panel title="Release Stream" code="ECO" accent right={<Tag tone="amber">{groups.length} days</Tag>}>
            <div className="divide-y divide-term-border">
              {groups.map((g) => {
                const isToday = g.daysOut === 0;
                return (
                  <div key={g.date}>
                    <div className={`flex items-center justify-between px-2.5 py-1 ${isToday ? "bg-term-amber-soft" : "bg-term-panel-2"}`}>
                      <span className={`text-2xs font-semibold uppercase tracking-wide ${isToday ? "text-term-amber" : "text-term-text-dim"}`}>
                        {g.date}
                        {isToday && " · TODAY"}
                      </span>
                      <span className="tnum text-3xs text-term-text-mute">
                        {g.daysOut < 0 ? `${Math.abs(g.daysOut)}d ago` : g.daysOut === 0 ? "today" : `+${g.daysOut}d`}
                      </span>
                    </div>
                    <div className="divide-y divide-term-border-soft">
                      {g.rows.map((e) => {
                        const released = e.actual != null;
                        const isNext = nextEvent != null && e.id === nextEvent.id;
                        const sup = surprise(e.actual, e.consensus);
                        const sensitivities = getCalendarSensitivity(e.name, e.category);
                        return (
                          <div
                            key={e.id}
                            className={`grid grid-cols-[44px_1fr] items-start gap-2 px-2.5 py-1.5 hover:bg-term-panel-2 ${released ? "opacity-70" : ""} ${isToday ? "bg-term-amber/5" : ""}`}
                          >
                            <div className="flex items-center gap-1 pt-0.5">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: importanceDot(e.importance) }} />
                              <span className="tnum text-3xs text-term-text-mute">{e.time}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-semibold text-term-text">{e.name}</span>
                                {isNext && (
                                  <span className="inline-flex items-center gap-1 text-3xs text-term-amber">
                                    <span className={`h-1.5 w-1.5 rounded-full bg-term-amber ${tick % 2 === 0 ? "opacity-100" : "opacity-30"}`} />
                                    NEXT
                                  </span>
                                )}
                                <Tag tone={importanceTone(e.importance)}>{e.importance}</Tag>
                                <Tag tone="neutral">{e.category}</Tag>
                                <span className="text-3xs text-term-text-mute">{e.period}</span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-3xs">
                                <span className="text-term-text-mute">Prior <span className="tnum text-term-text-dim">{e.prior}</span></span>
                                <span className="text-term-text-mute">Cons. <span className="tnum text-term-text-dim">{e.consensus}</span></span>
                                <span className="text-term-text-mute">
                                  Actual <span className={`tnum ${released ? "text-term-amber" : "text-term-text-mute"}`}>{e.actual ?? "—"}</span>
                                </span>
                                {sup && <Tag tone={sup.tone}>{sup.label}</Tag>}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {sensitivities.map((tag) => (
                                  <Tag key={tag} tone={sensitivityTone(tag)}>{tag}</Tag>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {groups.length === 0 && (
                <div className="px-3 py-6 text-center text-2xs text-term-text-mute">No events match the current filters.</div>
              )}
            </div>
          </Panel>
        </div>

        {/* Side panel */}
        <div className="flex flex-col gap-2">
          <Panel title="This Week's High-Impact" code="HOT" right={<Tag tone="down">{highImpactWeek.length}</Tag>}>
            <div className="divide-y divide-term-border-soft">
              {highImpactWeek.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-2.5 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-2xs font-semibold text-term-text">{e.name}</div>
                    <div className="text-3xs text-term-text-mute">{e.category} · {e.period}</div>
                  </div>
                  <div className="ml-2 shrink-0 text-right">
                    <div className="tnum text-2xs text-term-amber">{e.date}</div>
                    <div className="tnum text-3xs text-term-text-mute">{e.time} · +{e.daysOut}d</div>
                  </div>
                </div>
              ))}
              {highImpactWeek.length === 0 && (
                <div className="px-3 py-4 text-center text-2xs text-term-text-mute">No high-impact events in the next 7 days.</div>
              )}
            </div>
          </Panel>

          <Panel title="Releases by Category" code="CAT">
            <div className="p-2">
              <BarChart horizontal data={catCounts} fmt={(n) => `${n.toFixed(0)}`} />
            </div>
          </Panel>

          <Panel title="Pre/Post Release Factor Moves" code="MOVE" accent>
            <DataGrid columns={moveCols} rows={moveSummaries} rowKey={(r) => `${r.release}-${r.factor}`} maxHeight="260px" initialSort={{ key: "post", dir: "desc" }} zebra />
          </Panel>
        </div>
      </div>
    </div>
  );
}
