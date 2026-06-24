import data from "./sentimentAaiiSnapshot.json";
import type { AaiiWeek } from "./sentiment";

interface AaiiSnapshotFile {
  schemaVersion: number;
  generatedAt: string | null;
  sourceUrl: string | null;
  source: "AAII";
  observations: AaiiWeek[];
}

const snapshot = data as AaiiSnapshotFile;

export function getAaiiSnapshotHistory(weeks = 104): AaiiWeek[] | null {
  const obs = snapshot.observations ?? [];
  if (!obs.length) return null;
  return obs.slice(-weeks);
}

export function hasAaiiSnapshot(): boolean {
  return (snapshot.observations ?? []).length > 0;
}

export const aaiiSnapshotGeneratedAt: string | null = snapshot.generatedAt;
export const aaiiSnapshotSourceUrl: string | null = snapshot.sourceUrl;
