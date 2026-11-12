/**
 * Correctness properties P1, P5 and P12, run with and without linked features (task 13.7).
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { summariseDates, summariseSet } from './dates';
import { featuresForEra, isDrawnInEra } from './eras';
import { linkedSets } from './links';
import { datasetArb, eraArb, featureCaseArb, yearRangeArb } from './testing/arbitraries';
import type { Dataset } from './testing/arbitraries';
import { makeCollection, makeFeature, makeSource, obs } from './testing/fixtures';
import { indexSources } from './sources';

const RUNS = { numRuns: 300 };

/** Window from raw observations: clear presences, leaving out sources the set disagrees about. */
function independentWindow(
  dataset: Dataset,
  memberIds: readonly string[],
): { from: number; to: number } | null {
  const bySource = new Map<string, Set<string>>();
  for (const f of dataset.features) {
    if (!memberIds.includes(f.id)) continue;
    for (const o of f.properties.observations) {
      const seen = bySource.get(o.source) ?? new Set<string>();
      seen.add(`${o.present}|${o.visibility}`);
      bySource.set(o.source, seen);
    }
  }
  const years: { from: number; to: number }[] = [];
  for (const [source, variants] of bySource) {
    if (variants.size !== 1) continue;
    const [only] = [...variants];
    if (only !== 'true|clear') continue;
    const s = dataset.sourceList.find((x) => x.id === source);
    if (s) years.push({ from: s.year_from as number, to: s.year_to });
  }
  if (years.length === 0) return null;
  return {
    from: Math.min(...years.map((y) => y.from)),
    to: Math.max(...years.map((y) => y.to)),
  };
}

for (const withLinks of [false, true]) {
  const label = withLinks ? 'with linked features' : 'without links';

  describe(`P1: a feature is never drawn outside its evidence window (${label})`, () => {
    it('every drawn entry has a clear presence and its window holds the whole era', () => {
      fc.assert(
        fc.property(datasetArb({ links: withLinks }), eraArb, (dataset, era) => {
          const list = featuresForEra(dataset.collections, dataset.sources, era);
          for (const entry of list.features) {
            const window = independentWindow(dataset, entry.linkedIds);
            expect(window).not.toBeNull();
            expect(era.year_from).toBeGreaterThanOrEqual((window as { from: number }).from);
            expect(era.year_to).toBeLessThanOrEqual((window as { to: number }).to);
            expect(entry.dates.presences.length).toBeGreaterThan(0);
          }
        }),
        RUNS,
      );
    });

    it('a published set whose window holds the era, with no conflict, is drawn', () => {
      fc.assert(
        fc.property(datasetArb({ links: withLinks }), (dataset) => {
          for (const set of linkedSets(dataset.collections)) {
            const s = summariseSet(set, dataset.sources);
            if (s.kind !== 'dated' || s.conflicts.length > 0) continue;
            const era = { id: 'e', label: 'e', year_from: s.window.from, year_to: s.window.to };
            const ids = featuresForEra(dataset.collections, dataset.sources, era).features.flatMap(
              (f) => f.linkedIds,
            );
            expect(set.memberIds.every((id) => ids.includes(id))).toBe(true);
          }
        }),
        RUNS,
      );
    });
  });

  describe(`P12: era lists are well-formed (${label})`, () => {
    it('holds for any dataset and era', () => {
      fc.assert(
        fc.property(datasetArb({ links: withLinks }), eraArb, (dataset, era) => {
          const list = featuresForEra(dataset.collections, dataset.sources, era);
          const published = new Set(
            dataset.features.filter((f) => f.properties.status === 'published').map((f) => f.id),
          );

          const ids = list.features.map((f) => f.id);
          expect(new Set(ids).size).toBe(ids.length);
          expect(ids).toEqual([...ids].sort());
          expect(list.needsReview).toEqual([...new Set(list.needsReview)].sort());

          const seenMembers = new Set<string>();
          for (const entry of list.features) {
            expect(published.has(entry.id)).toBe(true);
            expect(entry.linkedIds).toContain(entry.id);
            expect(entry.linkedIds).toEqual([...entry.linkedIds].sort());
            for (const m of entry.linkedIds) {
              expect(published.has(m)).toBe(true);
              expect(seenMembers.has(m)).toBe(false); // at most one entry per linked set
              seenMembers.add(m);
            }
            expect(entry.sourceIds).toEqual([...new Set(entry.sourceIds)]);
            expect(isDrawnInEra(entry.dates, era)).toBe(true);
            expect(entry.dates.conflicts).toEqual([]);
          }
          for (const id of list.needsReview) {
            expect(published.has(id)).toBe(true);
            expect(seenMembers.has(id)).toBe(false);
          }
          for (const set of linkedSets(dataset.collections)) {
            if (summariseSet(set, dataset.sources).conflicts.length > 0) {
              for (const id of set.memberIds) expect(list.needsReview).toContain(id);
            }
          }
        }),
        RUNS,
      );
    });
  });

  describe(`P5: conflicts are flagged, never resolved (${label})`, () => {
    it('a conflicted set is in needsReview and absent from features in every era', () => {
      fc.assert(
        fc.property(datasetArb({ links: withLinks }), fc.array(eraArb, { minLength: 1, maxLength: 4 }), (dataset, eras) => {
          for (const set of linkedSets(dataset.collections)) {
            const s = summariseSet(set, dataset.sources);
            if (s.conflicts.length === 0) continue;
            for (const era of eras) {
              const list = featuresForEra(dataset.collections, dataset.sources, era);
              const drawn = list.features.flatMap((f) => f.linkedIds);
              for (const id of set.memberIds) {
                expect(list.needsReview).toContain(id);
                expect(drawn).not.toContain(id);
              }
            }
          }
        }),
        RUNS,
      );
    });
  });
}

describe('P1 and P5 for a single feature, as stated in the design', () => {
  it('P1: if isDrawnInEra then there is a clear presence and the era is inside the window', () => {
    fc.assert(
      fc.property(featureCaseArb, eraArb, ({ sources, feature }, era) => {
        const s = summariseDates(feature, sources);
        if (!isDrawnInEra(s, era)) return;
        expect(feature.properties.observations.some((o) => o.present && o.visibility === 'clear')).toBe(true);
        expect(era.year_from).toBeGreaterThanOrEqual(s.window.from);
        expect(era.year_to).toBeLessThanOrEqual(s.window.to);
      }),
      { numRuns: 500 },
    );
  });

  it('P5: a clear absence overlapping the window is listed, moves no date, and the feature needs review in every era', () => {
    fc.assert(
      fc.property(
        featureCaseArb.filter((c) => summariseDates(c.feature, c.sources).kind === 'dated'),
        fc.nat(),
        fc.nat(),
        fc.array(eraArb, { minLength: 1, maxLength: 4 }),
        ({ sources, sourceList, feature }, a, b, eras) => {
          const before = summariseDates(feature, sources);
          if (before.kind !== 'dated') return;
          const { from, to } = before.window;
          const yearFrom = from + (a % (to - from + 1)); // inside the window, so the ranges overlap
          const yearTo = yearFrom + (b % 5);
          const clash = makeSource('fip_v3_9999_999', yearFrom, yearTo);
          const index = indexSources({ schema_version: '1.0.0', sources: [...sourceList, clash] });
          const origin = feature.properties.provenance.origin_source;
          const withClash = makeFeature(origin, [...feature.properties.observations, obs(clash.id, false)]);

          const after = summariseDates(withClash, index);
          if (after.kind !== 'dated') throw new Error('presence disappeared');
          expect(after.conflicts.map((r) => r.source)).toContain(clash.id);
          expect([after.builtBy, after.lastSeen, after.window]).toEqual([
            before.builtBy,
            before.lastSeen,
            before.window,
          ]);
          for (const era of eras) {
            const list = featuresForEra([makeCollection(origin, [withClash])], index, era);
            expect(list.needsReview).toEqual([withClash.id]);
            expect(list.features).toEqual([]);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keeps the generator honest: yearRangeArb yields ordered ranges', () => {
    fc.assert(fc.property(yearRangeArb, (r) => r.from <= r.to));
  });
});
