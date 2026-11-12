/** Correctness properties P2, P3, P4 and P6 (spec 01 design "Correctness properties"). */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { compareRefs, datePhrases, summariseDates } from './dates';
import type { DateSummary, ObservationRef } from './dates';
import { indexSources } from './sources';
import { featureCaseArb, presentCaseArb } from './testing/arbitraries';
import type { FeatureCase } from './testing/arbitraries';
import { makeFeature, makeSource, obs } from './testing/fixtures';
import type { Feature, Observation } from './types.generated';

const RUNS = { numRuns: 300 };

function withObservations(f: Feature, observations: Observation[]): Feature {
  return makeFeature(f.properties.provenance.origin_source, observations);
}

describe('P2: a vanish window is only closed by a clear absence', () => {
  it('goneBy comes from a clear absence after the window, and equals its year_to', () => {
    fc.assert(
      fc.property(featureCaseArb, ({ sources, feature }: FeatureCase) => {
        const s = summariseDates(feature, sources);
        if (s.kind !== 'dated' || s.goneBy === null) return;
        const closers = feature.properties.observations.filter((o) => {
          const range = sources.get(o.source);
          return (
            !o.present &&
            o.visibility === 'clear' &&
            range !== undefined &&
            (range.year_from as number) > s.window.to &&
            range.year_to === s.goneBy
          );
        });
        expect(closers.length).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });

  it('turning every absence obscured or not covered leaves the window open', () => {
    fc.assert(
      fc.property(
        featureCaseArb,
        fc.constantFrom<Observation['visibility']>('obscured', 'not_covered'),
        ({ sources, feature }: FeatureCase, unclear) => {
          const softened = feature.properties.observations.map((o) =>
            o.present ? o : { ...o, visibility: unclear },
          );
          const s = summariseDates(withObservations(feature, softened), sources);
          if (s.kind === 'dated') {
            expect(s.goneBy).toBeNull();
            expect(s.notYetBuiltAt).toBeNull();
            expect(s.conflicts).toEqual([]);
          }
        },
      ),
      RUNS,
    );
  });
});

describe('P3: obscured and not-covered observations never change dates', () => {
  it('adding one only adds it to the not-counted list', () => {
    fc.assert(
      fc.property(
        featureCaseArb,
        fc.constantFrom<Observation['visibility']>('obscured', 'not_covered'),
        fc.boolean(),
        ({ sources, sourceList, feature }: FeatureCase, unclear, present) => {
          const used = new Set(feature.properties.observations.map((o) => o.source));
          const unused = sourceList.find((s) => !used.has(s.id));
          fc.pre(unused !== undefined);
          const extra = obs((unused as { id: string }).id, present, unclear);
          const before = summariseDates(feature, sources);
          const after = summariseDates(
            withObservations(feature, [...feature.properties.observations, extra]),
            sources,
          );
          const ref: ObservationRef = {
            source: extra.source,
            yearFrom: sources.get(extra.source)?.year_from as number,
            yearTo: sources.get(extra.source)?.year_to as number,
            present,
            visibility: unclear,
          };
          const expected: DateSummary =
            before.kind === 'dated'
              ? { ...before, notCounted: [...before.notCounted, ref].sort(compareRefs) }
              : { ...before, checked: [...before.checked, ref].sort(compareRefs) };
          expect(after).toEqual(expected);
        },
      ),
      RUNS,
    );
  });
});

describe('P4: order independence', () => {
  it('any permutation of the observations gives the same summary', () => {
    fc.assert(
      fc.property(
        featureCaseArb.chain((c) =>
          fc
            .shuffledSubarray(c.feature.properties.observations, {
              minLength: c.feature.properties.observations.length,
              maxLength: c.feature.properties.observations.length,
            })
            .map((shuffled) => ({ c, shuffled })),
        ),
        ({ c, shuffled }) => {
          const a = summariseDates(c.feature, c.sources);
          const b = summariseDates(withObservations(c.feature, shuffled), c.sources);
          expect(b).toEqual(a);
        },
      ),
      RUNS,
    );
  });
});

describe('P6: phrases never say "Built in" and every year comes from a cited source', () => {
  it('holds for any feature', () => {
    fc.assert(
      fc.property(featureCaseArb, ({ sources, feature }: FeatureCase) => {
        const phrases = datePhrases(summariseDates(feature, sources));
        const years = new Set<number>();
        for (const o of feature.properties.observations) {
          const s = sources.get(o.source);
          if (s) {
            years.add(s.year_from as number);
            years.add(s.year_to);
          }
        }
        for (const phrase of phrases) {
          expect(phrase.toLowerCase()).not.toContain('built in');
          expect(phrase).toMatch(/^(Not yet built at|Built by|Last seen|Gone by) \d{4}$/);
          for (const y of phrase.match(/\d{4}/g) ?? []) expect(years.has(Number(y))).toBe(true);
        }
        if (phrases.length > 0) expect(phrases.some((p) => p.startsWith('Built by'))).toBe(true);
      }),
      RUNS,
    );
  });

  it('a feature with a clear presence always gets "Built by" and one of "Last seen" / "Gone by"', () => {
    fc.assert(
      fc.property(presentCaseArb, ({ sources, feature }: FeatureCase) => {
        const phrases = datePhrases(summariseDates(feature, sources));
        expect(phrases.filter((p) => p.startsWith('Built by'))).toHaveLength(1);
        expect(phrases.filter((p) => p.startsWith('Last seen') || p.startsWith('Gone by'))).toHaveLength(1);
      }),
      RUNS,
    );
  });

  it('is built from sources only: a hand-made registry check', () => {
    const index = indexSources({
      schema_version: '1.0.0',
      sources: [makeSource('fip_v3_1920_001', 1920, 1922)],
    });
    const f = makeFeature('fip_v3_1920_001', [obs('fip_v3_1920_001', true, 'clear', 'origin')]);
    expect(datePhrases(summariseDates(f, index))).toEqual(['Built by 1922', 'Last seen 1920']);
  });
});
