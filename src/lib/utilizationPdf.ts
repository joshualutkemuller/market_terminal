/**
 * Utilization Analytics PDF report builder.
 *
 * Generates a formatted report based on the user's current tab and selections.
 */
import { PdfReport } from "./pdfReport";
import { fmtSigned } from "./format";
import {
  PRESET_BLENDS,
  computeUtilizationSnapshot,
  buildUtilizationTimeSeries,
  computeAllBlends,
  computeRateSensitivity,
  computeUtilSummary,
  loadUserBlends,
  type UtilGroupBy,
  type BlendResult,
  type RateSensitivity,
} from "@/data/utilizationAnalytics";
import { defOf, type SeriesMap } from "@/data/benchmarkRates";
import type { InventoryRow } from "@/data/securitiesLending";
import type { SqueezeRow } from "@/data/squeeze";

export interface UtilPdfOptions {
  map: SeriesMap;
  inventory: InventoryRow[];
  squeezeBoard: SqueezeRow[];
  blends: BlendResult[];
  source: string;
  tab: "dashboard" | "overlay" | "blends" | "impact";
  groupBy: UtilGroupBy;
  selectedRate: string;
  selectedBlend: string;
  timeRange: string;
  chartRef?: HTMLElement | null;
  blendChartRef?: HTMLElement | null;
}

export async function generateUtilizationPdf(opts: UtilPdfOptions) {
  const { map, inventory, squeezeBoard, blends, source, tab, groupBy, selectedRate, selectedBlend, timeRange, chartRef, blendChartRef } = opts;

  const overallSeries = buildUtilizationTimeSeries(inventory, squeezeBoard, "all");
  const sensitivity = computeRateSensitivity(map, overallSeries);
  const summary = computeUtilSummary(inventory, blends, sensitivity);

  const report = new PdfReport({
    title: "Utilization Analytics Report",
    code: "UTIL",
    subtitle: `Securities lending utilization & benchmark overlays — ${timeRange} window`,
    source,
    asOf: new Date().toISOString().slice(0, 10),
  });

  // ── KPI Summary ──────────────────────────────────────────────────
  report.kpiStrip([
    { label: "Overall Util", value: summary.overallUtil != null ? `${summary.overallUtil.toFixed(1)}%` : "—", tone: summary.overallUtil != null && summary.overallUtil > 75 ? "down" : "neutral" },
    { label: "HTB Util", value: summary.htbUtil != null ? `${summary.htbUtil.toFixed(1)}%` : "—", tone: "down" },
    { label: "GC Util", value: summary.gcUtil != null ? `${summary.gcUtil.toFixed(1)}%` : "—" },
    { label: "Avg Fee", value: summary.avgFeeBps != null ? `${summary.avgFeeBps.toFixed(0)}bps` : "—", tone: "amber" },
    { label: "Top Driver", value: summary.topSensitivity },
    { label: "Blends", value: String(summary.blendCount) },
  ]);

  // ── DASHBOARD ────────────────────────────────────────────────────
  if (tab === "dashboard") {
    const utilSeries = buildUtilizationTimeSeries(inventory, squeezeBoard, groupBy);

    report.sectionTitle(`Utilization by ${groupBy === "all" ? "Overall" : groupBy}`, { text: `${utilSeries.length} groups` });
    report.table(
      ["Group", "Util %", "Avg Fee (bps)", "Names", "HTB", "Special"],
      utilSeries.map((s) => [
        s.groupKey,
        `${s.current.utilization.toFixed(1)}%`,
        s.current.avgFeeBps.toFixed(0),
        String(s.current.nameCount),
        String(s.current.htbCount),
        String(s.current.specialCount),
      ]),
      { columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } } },
    );

    const clsSnapshot = computeUtilizationSnapshot(inventory, "classification");
    report.sectionTitle("Utilization by Classification");
    report.table(
      ["Classification", "Util %", "Avg Fee (bps)", "Names", "On-Loan MV"],
      Object.entries(clsSnapshot).map(([key, m]) => [
        key,
        `${m.utilization.toFixed(1)}%`,
        m.avgFeeBps.toFixed(0),
        String(m.nameCount),
        `$${(m.totalOnLoanMV / 1e6).toFixed(1)}M`,
      ]),
      { columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" } } },
    );
  }

  // ── OVERLAY ──────────────────────────────────────────────────────
  if (tab === "overlay") {
    const rateDef = defOf(selectedRate);
    report.sectionTitle(`Benchmark Overlay — ${rateDef?.short ?? selectedRate}`, { text: rateDef?.label ?? "" });

    if (chartRef) {
      await report.captureElement(chartRef, { maxHeight: 220 });
    }

    report.sectionTitle("Rate Sensitivity Rankings");
    report.table(
      ["Benchmark", "Impact", "Magnitude", "Beta", "Description"],
      sensitivity.slice(0, 15).map((s) => [
        s.rateLabel,
        s.impact,
        s.magnitude,
        s.beta != null ? s.beta.toFixed(4) : "—",
        s.description,
      ]),
      { columnStyles: { 3: { halign: "right" } } },
    );
  }

  // ── BLENDS ───────────────────────────────────────────────────────
  if (tab === "blends") {
    report.sectionTitle("Benchmark Blends", { text: `${blends.length} active` });
    report.table(
      ["Blend", "Current", "Δ1D (bps)", "Δ20D (bps)", "Pctl", "Z-Score", "Description"],
      blends.map((b) => [
        b.blend.name,
        b.current != null ? `${b.current.toFixed(2)}%` : "—",
        b.chg1d != null ? fmtSigned(b.chg1d * 100, 1) : "—",
        b.chg20d != null ? fmtSigned(b.chg20d * 100, 1) : "—",
        b.percentile != null ? `${b.percentile}%` : "—",
        b.zScore != null ? fmtSigned(b.zScore, 2) : "—",
        b.blend.description,
      ]),
      { columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } } },
    );

    const selected = blends.find((b) => b.blend.id === selectedBlend);
    if (selected) {
      report.sectionTitle(`Blend Detail — ${selected.blend.name}`);

      if (blendChartRef) {
        await report.captureElement(blendChartRef, { maxHeight: 220 });
      }

      report.metricRows([
        { label: "Current", value: selected.current != null ? `${selected.current.toFixed(2)}%` : "—" },
        { label: "Change 1D", value: selected.chg1d != null ? `${fmtSigned(selected.chg1d * 100, 1)}bps` : "—" },
        { label: "Change 20D", value: selected.chg20d != null ? `${fmtSigned(selected.chg20d * 100, 1)}bps` : "—" },
        { label: "Percentile", value: selected.percentile != null ? `${selected.percentile}%` : "—" },
        { label: "Z-Score", value: selected.zScore != null ? fmtSigned(selected.zScore, 2) : "—" },
        { label: "Spread", value: `${selected.blend.spreadBps}bps` },
      ]);

      report.sectionTitle("Components");
      report.table(
        ["Series", "Weight"],
        selected.blend.components.map((c) => [c.label, `${Math.round(c.weight * 100)}%`]),
        { columnStyles: { 1: { halign: "right" } } },
      );
    }
  }

  // ── IMPACT ───────────────────────────────────────────────────────
  if (tab === "impact") {
    report.sectionTitle("Rate Impact Analysis");
    report.table(
      ["Benchmark", "Impact", "Magnitude", "Beta", "Description"],
      sensitivity.map((s) => [
        s.rateLabel,
        s.impact,
        s.magnitude,
        s.beta != null ? s.beta.toFixed(4) : "—",
        s.description,
      ]),
      { columnStyles: { 3: { halign: "right" } } },
    );
  }

  // ── Save ─────────────────────────────────────────────────────────
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const tabLabel = tab === "dashboard" ? "Dashboard" : tab === "overlay" ? "Overlay" : tab === "blends" ? "Blends" : "Impact";
  report.save(`UTIL_${tabLabel}_${date}.pdf`);
}
