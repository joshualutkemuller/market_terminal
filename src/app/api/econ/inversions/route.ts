import { json } from "@/lib/server/http";
import { fredEnabled, fredSeries } from "@/lib/server/fred";
import { getSnapshotObservations, getSnapshotRawObservations } from "@/data/econSnapshot";
import {
  computeInversionStats,
  detectInversions,
  getInversionStats,
  getInversionsForSpread,
  getSpreadSeriesFor,
  monthlySpreadTimeline,
  recessionRangesFromUsrec,
  spreadDef,
  tenorToFredId,
} from "@/data/econCurve";


const HISTORY_START = "1976-01-01"; // T10Y2Y begins 1976; DGS2 likewise
const REVALIDATE = 12 * 60 * 60; // 12h — deep daily history changes only at the tail

function snapshotObs(id: string) {
  return getSnapshotRawObservations(id) ?? getSnapshotObservations(id);
}

/**
 * GET /api/econ/inversions?spread=10Y2Y
 *
 * Fully-live inversion detection: pulls the spread's real daily history from FRED
 * (the direct T10Y2Y/T10Y3M series, or computed from the two constituent DGS
 * tenors), pulls USREC for NBER recession dating, then detects every unique
 * inversion period (negative-spread runs, brief blips bridged, sub-week noise
 * dropped) with recession lead-times. Returns the inversions, aggregate stats and
 * a monthly timeline. Falls back to the curated/simulated record without a key.
 */
export async function GET(req: Request) {
  const spreadId = new URL(req.url).searchParams.get("spread") ?? "10Y2Y";
  const def = spreadDef(spreadId);

  const sim = () => ({
    source: "SIM" as const,
    spread: spreadId,
    inversions: getInversionsForSpread(spreadId),
    stats: getInversionStats(spreadId),
    timeline: getSpreadSeriesFor(spreadId),
  });

  const snap = () => {
    let series: { date: string; bps: number }[] = [];
    if (def.fredId) {
      const obs = snapshotObs(def.fredId);
      if (obs?.length) series = obs.map((o) => ({ date: o.date, bps: o.value }));
    } else {
      const longId = tenorToFredId(def.longT);
      const shortId = tenorToFredId(def.shortT);
      const lo = longId ? snapshotObs(longId) : null;
      const sh = shortId ? snapshotObs(shortId) : null;
      if (lo?.length && sh?.length) {
        const shMap = new Map(sh.map((o) => [o.date, o.value]));
        series = lo
          .filter((o) => shMap.has(o.date))
          .map((o) => ({ date: o.date, bps: (o.value - (shMap.get(o.date) as number)) * 100 }));
      }
    }
    if (series.length < 30) return null;
    const usrec = snapshotObs("USREC") ?? [];
    const recessions = recessionRangesFromUsrec(usrec.map((o) => ({ date: o.date, value: o.value })));
    const fallbackRec = recessions.length ? recessions : [];
    const inversions = detectInversions(series, fallbackRec);
    const stats = computeInversionStats(inversions);
    const timeline = monthlySpreadTimeline(series, fallbackRec);
    return {
      source: "SNAPSHOT" as const,
      spread: spreadId,
      asOf: series[series.length - 1].date,
      inversions: inversions.length ? inversions : getInversionsForSpread(spreadId),
      stats: inversions.length ? stats : getInversionStats(spreadId),
      timeline: timeline.length ? timeline : getSpreadSeriesFor(spreadId),
    };
  };

  if (!fredEnabled()) return json(snap() ?? sim());

  try {
    // 1. Build the daily spread series (bps).
    let series: { date: string; bps: number }[] = [];
    if (def.fredId) {
      // Direct FRED spread series (percentage points -> bps).
      const obs = await fredSeries(def.fredId, { start: HISTORY_START, revalidateSec: REVALIDATE });
      series = obs
        .filter((o) => o.value !== null)
        .map((o) => ({ date: o.date, bps: (o.value as number) * 100 }));
    } else {
      // Compute from the two constituent constant-maturity tenors.
      const longId = tenorToFredId(def.longT);
      const shortId = tenorToFredId(def.shortT);
      if (!longId || !shortId) return json(sim());
      const [lo, sh] = await Promise.all([
        fredSeries(longId, { start: HISTORY_START, revalidateSec: REVALIDATE }),
        fredSeries(shortId, { start: HISTORY_START, revalidateSec: REVALIDATE }),
      ]);
      const shMap = new Map(sh.filter((o) => o.value !== null).map((o) => [o.date, o.value as number]));
      series = lo
        .filter((o) => o.value !== null && shMap.has(o.date))
        .map((o) => ({ date: o.date, bps: ((o.value as number) - (shMap.get(o.date) as number)) * 100 }));
    }
    if (series.length < 30) return json(sim());

    // 2. NBER recession ranges from USREC.
    const usrec = await fredSeries("USREC", { start: "1970-01-01", revalidateSec: REVALIDATE });
    const recessions = recessionRangesFromUsrec(
      usrec.filter((o) => o.value !== null).map((o) => ({ date: o.date, value: o.value as number }))
    );

    // 3. Detect every unique inversion + aggregate + timeline.
    const inversions = detectInversions(series, recessions);
    const stats = computeInversionStats(inversions);
    const timeline = monthlySpreadTimeline(series, recessions);

    return json({
      source: "FRED",
      spread: spreadId,
      asOf: series[series.length - 1].date,
      inversions,
      stats,
      timeline,
    });
  } catch (err) {
    return json({ ...(snap() ?? sim()), note: err instanceof Error ? err.message : "FRED error" });
  }
}
