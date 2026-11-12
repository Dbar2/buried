/**
 * The date logic: the single implementation in Buried (spec 01 requirement 10, evidence.md).
 *
 * Pure functions. Unity, the pipeline and any server receive these results and never recompute
 * them. Only `clear` observations count; `obscured` and `not_covered` are kept as checked but not
 * counted. Nothing here resolves a conflict.
 */
import type { LinkedSet } from './links';
import { yearRange } from './sources';
import type { SourceIndex } from './sources';
import type { Feature } from './types.generated';

export type Visibility = 'clear' | 'obscured' | 'not_covered';

export type ObservationRef = {
  source: string;
  yearFrom: number;
  yearTo: number;
  present: boolean;
  visibility: Visibility;
};

export type NoPresence = {
  kind: 'no_presence';
  /** Every observation looked at (none of them is a counted clear presence). */
  checked: ObservationRef[];
  /** Same-source disagreements inside a linked set (empty for a single feature). */
  conflicts: ObservationRef[];
};

export type Dated = {
  kind: 'dated';
  /** Minimum yearTo over the clear presences. */
  builtBy: number;
  /** Maximum yearFrom over the clear presences. */
  lastSeen: number;
  /** Minimum yearFrom to maximum yearTo over the clear presences. */
  window: { from: number; to: number };
  /** Maximum yearFrom over the before-absences, or null when the start is open. */
  notYetBuiltAt: number | null;
  /** Minimum yearTo over the after-absences, or null when the vanish window stays open. */
  goneBy: number | null;
  /** Clear absences inside the window, and same-source disagreements in a linked set. */
  conflicts: ObservationRef[];
  presences: ObservationRef[];
  beforeAbsences: ObservationRef[];
  afterAbsences: ObservationRef[];
  /** Obscured and not-covered observations: checked, never counted. */
  notCounted: ObservationRef[];
};

export type DateSummary = NoPresence | Dated;

const VISIBILITY_ORDER: Record<Visibility, number> = { clear: 0, obscured: 1, not_covered: 2 };

/** Total order, so every array in a summary is the same whatever order the input came in. */
export function compareRefs(a: ObservationRef, b: ObservationRef): number {
  return (
    a.yearFrom - b.yearFrom ||
    a.yearTo - b.yearTo ||
    (a.source < b.source ? -1 : a.source > b.source ? 1 : 0) ||
    Number(b.present) - Number(a.present) ||
    VISIBILITY_ORDER[a.visibility] - VISIBILITY_ORDER[b.visibility]
  );
}

const sorted = (refs: ObservationRef[]): ObservationRef[] => [...refs].sort(compareRefs);

/** Apply the evidence.md rules to observations that are already one per source. */
export function summariseRefs(counted: ObservationRef[], disagreements: ObservationRef[]): DateSummary {
  const conflicts = sorted(disagreements);
  const notCounted = counted.filter((r) => r.visibility !== 'clear');
  const clear = counted.filter((r) => r.visibility === 'clear');
  const presences = clear.filter((r) => r.present);
  const absences = clear.filter((r) => !r.present);

  if (presences.length === 0) {
    return { kind: 'no_presence', checked: sorted([...counted, ...disagreements]), conflicts };
  }

  const from = Math.min(...presences.map((r) => r.yearFrom));
  const to = Math.max(...presences.map((r) => r.yearTo));
  const before = absences.filter((r) => r.yearTo < from);
  const after = absences.filter((r) => r.yearFrom > to);
  const overlapping = absences.filter((r) => !(r.yearTo < from) && !(r.yearFrom > to));

  return {
    kind: 'dated',
    builtBy: Math.min(...presences.map((r) => r.yearTo)),
    lastSeen: Math.max(...presences.map((r) => r.yearFrom)),
    window: { from, to },
    notYetBuiltAt: before.length > 0 ? Math.max(...before.map((r) => r.yearFrom)) : null,
    goneBy: after.length > 0 ? Math.min(...after.map((r) => r.yearTo)) : null,
    conflicts: sorted([...overlapping, ...disagreements]),
    presences: sorted(presences),
    beforeAbsences: sorted(before),
    afterAbsences: sorted(after),
    notCounted: sorted(notCounted),
  };
}

function refsOf(feature: Feature, sources: SourceIndex): ObservationRef[] {
  return feature.properties.observations.map((o) => ({
    source: o.source,
    ...yearRange(sources, o.source),
    present: o.present,
    visibility: o.visibility,
  }));
}

/**
 * One DateSummary for a linked set, from the union of its members' observations, each source
 * once (requirement 18.1).
 *
 * Observations from one source that all agree count once. If they differ in `present` or
 * `visibility`, every distinct observation goes to `conflicts` and none of them is counted
 * (requirement 18.2). A set of one gives the single-feature summary.
 */
export function summariseSet(set: LinkedSet, sources: SourceIndex): DateSummary {
  const bySource = new Map<string, Map<string, ObservationRef>>();
  for (const member of set.members) {
    for (const ref of refsOf(member, sources)) {
      const variants = bySource.get(ref.source) ?? new Map<string, ObservationRef>();
      variants.set(`${ref.present}|${ref.visibility}`, ref);
      bySource.set(ref.source, variants);
    }
  }
  const counted: ObservationRef[] = [];
  const disagreements: ObservationRef[] = [];
  for (const variants of bySource.values()) {
    if (variants.size === 1) counted.push(...variants.values());
    else disagreements.push(...variants.values());
  }
  return summariseRefs(counted, disagreements);
}

/** Dates for one feature on its own: the summary of a linked set of one. */
export function summariseDates(feature: Feature, sources: SourceIndex): DateSummary {
  return summariseSet({ memberIds: [feature.id], members: [feature] }, sources);
}

/**
 * Date phrases, in order: "Not yet built at Y" (if known), "Built by Y", then "Gone by Y" or
 * "Last seen Y". Never "Built in". A summary with no presence has none.
 */
export function datePhrases(summary: DateSummary): string[] {
  if (summary.kind !== 'dated') return [];
  const phrases: string[] = [];
  if (summary.notYetBuiltAt !== null) phrases.push(`Not yet built at ${summary.notYetBuiltAt}`);
  phrases.push(`Built by ${summary.builtBy}`);
  phrases.push(summary.goneBy !== null ? `Gone by ${summary.goneBy}` : `Last seen ${summary.lastSeen}`);
  return phrases;
}
