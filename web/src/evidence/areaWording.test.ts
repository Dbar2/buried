/** Session 034: land-use areas are lettered on plans, not built. Wording and its properties. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { areaPhrases } from './areaWording';
import { summariseDates } from './dates';
import type { Dated } from './dates';
import { featuresForEra } from './eras';
import { plainSourceName } from './plainWords';
import { presentCaseArb } from './testing/arbitraries';
import { AERIAL, ERA_1911, P1911, P1935, makeCollection, makeFeature, obs, showcaseSources } from './testing/fixtures';

const RUNS = { numRuns: 300 };
const sources = showcaseSources();

function dated(...observations: ReturnType<typeof obs>[]): Dated {
  const s = summariseDates(makeFeature(P1911, observations, { kind: 'land_use' }), sources);
  if (s.kind !== 'dated') throw new Error('expected a dated summary');
  return s;
}

describe('areaPhrases', () => {
  it('words a use lettered on one plan', () => {
    expect(areaPhrases(dated(obs(P1911, true, 'clear', 'origin')), sources)).toEqual(['Lettered on the 1911 plan']);
  });

  it('adds "Still lettered" for a later plan that shows it', () => {
    const s = dated(obs(P1911, true, 'clear', 'origin'), obs(P1935, true));
    expect(areaPhrases(s, sources)).toEqual(['Lettered on the 1911 plan', 'Still lettered on the 1931-35 plan']);
  });

  it('says "Not lettered" only for a clear absence', () => {
    const gone = dated(obs(P1911, true, 'clear', 'origin'), obs(P1935, false, 'clear'));
    expect(areaPhrases(gone, sources)).toEqual(['Lettered on the 1911 plan', 'Not lettered on the 1931-35 plan']);
    const obscured = dated(obs(P1911, true, 'clear', 'origin'), obs(P1935, false, 'obscured'));
    expect(areaPhrases(obscured, sources)).toEqual(['Lettered on the 1911 plan']);
    const notCovered = dated(obs(P1911, true, 'clear', 'origin'), obs(P1935, false, 'not_covered'));
    expect(areaPhrases(notCovered, sources)).toEqual(['Lettered on the 1911 plan']);
  });

  it('calls a photograph "shown", not "lettered"', () => {
    const s = dated(obs(P1911, true, 'clear', 'origin'), obs(AERIAL, true));
    expect(areaPhrases(s, sources)).toEqual(['Lettered on the 1911 plan', 'Still shown on the 1947 photograph']);
    const absent = dated(obs(P1911, true, 'clear', 'origin'), obs(AERIAL, false));
    expect(areaPhrases(absent, sources)).toEqual(['Lettered on the 1911 plan', 'Not shown on the 1947 photograph']);
  });

  it('never says built, gone or last seen, and the era list uses it for areas only', () => {
    const area = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true)], { kind: 'land_use', seq: 1 });
    const building = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true)], { kind: 'building', seq: 2 });
    const list = featuresForEra([makeCollection(P1911, [area, building])], sources, ERA_1911);
    const phrasesOf = (id: string) => list.features.find((f) => f.id === id)?.phrases;
    expect(phrasesOf(area.id)).toEqual(['Lettered on the 1911 plan', 'Still lettered on the 1931-35 plan']);
    expect(phrasesOf(building.id)?.[0]).toBe('Built by 1914');
  });
});

describe('areaPhrases properties', () => {
  it('has no building words, no id and only years of registered sources', () => {
    fc.assert(
      fc.property(presentCaseArb, ({ sources: index, feature }) => {
        const s = summariseDates(feature, index);
        if (s.kind !== 'dated') return;
        const phrases = areaPhrases(s, index);
        const text = phrases.join('. ');
        expect(text).not.toMatch(/Built|Gone|Last seen|Not yet built/);
        expect(text).not.toMatch(/[a-z]+_[a-z0-9_]+/);
        const allowed = new Set<string>();
        for (const ref of [...s.presences, ...s.beforeAbsences, ...s.afterAbsences]) {
          for (const n of plainSourceName(index.get(ref.source)!).match(/\d+/g) ?? []) allowed.add(n);
        }
        for (const n of text.match(/\d+/g) ?? []) expect(allowed.has(n), n).toBe(true);
      }),
      RUNS,
    );
  });

  it('starts the presences once, and words only counted observations', () => {
    fc.assert(
      fc.property(presentCaseArb, ({ sources: index, feature }) => {
        const s = summariseDates(feature, index);
        if (s.kind !== 'dated') return;
        const phrases = areaPhrases(s, index);
        expect(phrases.filter((p) => /^(Lettered|Shown) on /.test(p))).toHaveLength(1);
        expect(phrases.filter((p) => p.startsWith('Still ')).length).toBeLessThanOrEqual(s.presences.length - 1);
        expect(phrases.filter((p) => p.startsWith('Not ')).length).toBeLessThanOrEqual(s.beforeAbsences.length + s.afterAbsences.length);
      }),
      RUNS,
    );
  });

  it('closes nothing without a clear absence: absences made obscured or not covered add no "Not" phrase', () => {
    fc.assert(
      fc.property(presentCaseArb, fc.constantFrom<'obscured' | 'not_covered'>('obscured', 'not_covered'), ({ sources: index, feature }, unclear) => {
        const softened = makeFeature(
          feature.properties.provenance.origin_source,
          feature.properties.observations.map((o) => (o.present ? o : { ...o, visibility: unclear })),
          { kind: 'land_use' },
        );
        const s = summariseDates(softened, index);
        if (s.kind !== 'dated') return;
        expect(areaPhrases(s, index).filter((p) => p.startsWith('Not '))).toEqual([]);
      }),
      RUNS,
    );
  });
});
