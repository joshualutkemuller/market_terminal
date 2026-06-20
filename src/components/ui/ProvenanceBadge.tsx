import clsx from "clsx";
import { provenanceMeta, PROVENANCE_TONE_CLASS } from "@/lib/provenance";

/**
 * Canonical data-provenance pill. Renders any source code (FRED, DB, FILE,
 * SNAPSHOT, ECON, SIM, …) with a consistent label, tone, dot, and tooltip
 * across every module. See `lib/provenance.ts` for the vocabulary.
 */
export function ProvenanceBadge({ source, className }: { source: string; className?: string }) {
  const meta = provenanceMeta(source);
  const tone = PROVENANCE_TONE_CLASS[meta.tone];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-3xs font-semibold uppercase tracking-wide",
        tone.pill,
        className
      )}
      title={meta.title}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", tone.dot)} />
      {meta.label}
    </span>
  );
}
