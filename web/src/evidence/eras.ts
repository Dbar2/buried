/**
 * Drawn-in-era and per-era feature lists (spec 01 requirements 12 and 18).
 *
 * The per-era list is the payload the shell sends to Unity. Unity does not filter it by date.
 */
import { datePhrases, summariseSet } from './dates';
import type { Dated, DateSummary } from './dates';
import { linkedSets } from './links';
import type { LinkedSet } from './links';
import { yearRange } from './sources';
import type { SourceIndex } from './sources';
import type { Era, Feature, FeatureCollection, FeatureGeometry } from './types.generated';

/** Only the fields of an era the logic reads. */
export type EraRange = Pick<Era, 'year_from' | 'year_to'>;

/** True only for a dated, non-conflicted summary whose window holds the whole era (requirement 12.1). */
export function isDrawnInEra(summary: DateSummary, era: EraRange): summary is Dated {
  return (
    summary.kind === 'dated' &&
    summary.conflicts.length === 0 &&
    era.year_from >= summary.window.from &&
    era.year_to <= summary.window.to
  );
}

const byId = (a: Feature, b: Feature): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function originRange(member: Feature, sources: SourceIndex): { yearFrom: number; yearTo: number } {
  return yearRange(sources, member.properties.provenance.origin_source);
}

/**
 * The member whose geometry represents a linked set in an era (requirement 18.4), in this order:
 * 1. a member whose origin source's year range contains the era's range;
 * 2. else the member whose origin source has the greatest `year_to` not after the era's start;
 * 3. else the member whose origin source has the smallest `year_from`.
 * Ties go to the smallest feature id.
 */
export function drawnMember(set: LinkedSet, era: EraRange, sources: SourceIndex): Feature {
  const ranged = set.members.map((member) => ({ member, range: originRange(member, sources) }));
  const pick = (candidates: typeof ranged, key: (r: (typeof ranged)[number]) => number) => {
    const best = Math.min(...candidates.map(key));
    return candidates
      .filter((c) => key(c) === best)
      .map((c) => c.member)
      .sort(byId)[0] as Feature;
  };

  const containing = ranged.filter(
    (c) => c.range.yearFrom <= era.year_from && era.year_to <= c.range.yearTo,
  );
  if (containing.length > 0) return pick(containing, () => 0);

  const before = ranged.filter((c) => c.range.yearTo <= era.year_from);
  if (before.length > 0) return pick(before, (c) => -c.range.yearTo);

  return pick(ranged, (c) => c.range.yearFrom);
}

export type EraFeature = {
  id: string;
  kind: 'building' | 'water' | 'land_use';
  /** EPSG:26917 metres, unchanged from the file. */
  geometry: FeatureGeometry;
  positionErrorM: number;
  confidence: 'documented' | 'estimated' | 'unknown';
  confidenceReason: string;
  attributes: { use?: string; material?: string; storeys?: number };
  dates: Dated;
  phrases: string[];
  /** The drawn member's origin source first, then every other cited source, sorted. */
  sourceIds: string[];
  /** Every member of the linked set, sorted; [id] for a set of one. */
  linkedIds: string[];
};

export type EraFeatureList = {
  eraId: string;
  yearFrom: number;
  yearTo: number;
  /** Sorted by id. */
  features: EraFeature[];
  /** Members of conflicted linked sets, sorted. */
  needsReview: string[];
};

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function citedSources(set: LinkedSet, drawn: Feature): string[] {
  const first = drawn.properties.provenance.origin_source;
  const rest = new Set<string>();
  for (const member of set.members) {
    rest.add(member.properties.provenance.origin_source);
    for (const o of member.properties.observations) rest.add(o.source);
  }
  rest.delete(first);
  return [first, ...[...rest].sort(compareStrings)];
}

/**
 * What to draw in an era: one entry per linked set whose evidence window holds the era, built from
 * `drawnMember`. Only published features are considered. Conflicted sets are left out of
 * `features` and their members listed in `needsReview`; features with no clear presence are never
 * listed.
 */
export function featuresForEra(
  collections: readonly FeatureCollection[],
  sources: SourceIndex,
  era: Era,
): EraFeatureList {
  const features: EraFeature[] = [];
  const needsReview: string[] = [];

  for (const set of linkedSets(collections)) {
    const summary = summariseSet(set, sources);
    if (summary.conflicts.length > 0) {
      needsReview.push(...set.memberIds);
      continue;
    }
    if (!isDrawnInEra(summary, era)) continue;
    const drawn = drawnMember(set, era, sources);
    const p = drawn.properties;
    features.push({
      id: drawn.id,
      kind: p.kind,
      geometry: drawn.geometry,
      positionErrorM: p.position_error_m,
      confidence: p.confidence,
      confidenceReason: p.confidence_reason,
      attributes: { ...p.attributes },
      dates: summary,
      phrases: datePhrases(summary),
      sourceIds: citedSources(set, drawn),
      linkedIds: [...set.memberIds],
    });
  }

  return {
    eraId: era.id,
    yearFrom: era.year_from,
    yearTo: era.year_to,
    features: features.sort((a, b) => compareStrings(a.id, b.id)),
    needsReview: needsReview.sort(compareStrings),
  };
}
