/**
 * Committed real-FRED snapshot used as the econ fallback tier, between live FRED
 * and synthetic SIM. Populated by `npm run export:econ-snapshot` (see
 * `src/server/exportEconSnapshot.ts`). Empty until exported, in which case the
 * econ routes/hooks fall back to the deterministic simulation as before.
 *
 * Observations are stored in each series' resolved *display* units. For series
 * displayed as growth rates (YoY/MoM), `rawObservations` may also carry the
 * underlying level/index history so downstream code can derive true MoM/QoQ/YoY
 * rates instead of taking percent changes of an already-transformed print.
 */
import snapshot from "./econSnapshot.json";
import type { Observation } from "./econSeries";

interface EconSnapshotFile {
  generatedAt: string | null;
  series: Record<string, { asOf: string; observations: Observation[]; rawObservations?: Observation[] }>;
}

const data = snapshot as EconSnapshotFile;

/** True once a real snapshot has been exported (i.e. has any series). */
export function hasEconSnapshot(): boolean {
  return !!data.series && Object.keys(data.series).length > 0;
}

/** Real observations for a series (last `n`), or null if not in the snapshot. */
export function getSnapshotObservations(id: string, n?: number): Observation[] | null {
  const entry = data.series?.[id];
  if (!entry || !entry.observations?.length) return null;
  const obs = entry.observations;
  return typeof n === "number" && n < obs.length ? obs.slice(obs.length - n) : obs;
}

/** Raw level/index observations for a series when the snapshot includes them. */
export function getSnapshotRawObservations(id: string, n?: number): Observation[] | null {
  const entry = data.series?.[id];
  if (!entry || !entry.rawObservations?.length) return null;
  const obs = entry.rawObservations;
  return typeof n === "number" && n < obs.length ? obs.slice(obs.length - n) : obs;
}

/** As-of date of a snapshot series (drives the freshness/staleness badge). */
export function snapshotAsOf(id: string): string | null {
  return data.series?.[id]?.asOf ?? null;
}

/** When the snapshot was generated, or null if not yet exported. */
export const econSnapshotGeneratedAt: string | null = data.generatedAt;
