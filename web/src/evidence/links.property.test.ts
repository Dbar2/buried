/** Correctness properties P16, P17 and P18 (linked sets). */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { summariseDates, summariseSet } from './dates';
import { featuresForEra } from './eras';
import { linkedSets } from './links';
import type { LinkedSet } from './links';
import { datasetArb, eraArb } from './testing/arbitraries';
import type { Dataset } from './testing/arbitraries';
import { permuteCollections } from './testing/permute';
import { AERIAL, P1911, P1935, link, makeCollection, makeFeature, obs, showcaseSources } from './testing/fixtures';
import type { Feature } from './types.generated';

const RUNS = { numRuns: 300 };

const visibilityArb = fc.constantFrom<'clear' | 'obscured' | 'not_covered'>('clear', 'obscured', 'not_covered');
/** Clear presences in the union of the members' observations, leaving out disagreeing sources. */
function presencesOf(dataset: Dataset, set: LinkedSet): { from: number; to: number }[] {
  const variants = new Map<string, Set<string>>();
  for (const m of set.members) {
    for (const o of m.properties.observations) {
      const v = variants.get(o.source) ?? new Set<string>();
      v.add(`${o.present}|${o.visibility}`);
      variants.set(o.source, v);
    }
  }
  const out: { from: number; to: number }[] = [];
  for (const [source, v] of variants) {
    if (v.size === 1 && v.has('true|clear')) {
      const s = dataset.sourceList.find((x) => x.id === source);
      if (s) out.push({ from: s.year_from as number, to: s.year_to });
    }
  }
  return out;
}

describe('P16: linking never widens a window', () => {
  it('a set window is exactly the hull of the union of its clear presences', () => {
    fc.assert(
      fc.property(datasetArb({ links: true }), (dataset) => {
        for (const set of linkedSets(dataset.collections)) {
          const s = summariseSet(set, dataset.sources);
          const p = presencesOf(dataset, set);
          if (s.kind === 'dated') {
            expect(p.length).toBeGreaterThan(0);
            expect(s.window.from).toBe(Math.min(...p.map((x) => x.from)));
            expect(s.window.to).toBe(Math.max(...p.map((x) => x.to)));
          } else {
            expect(p).toEqual([]);
          }
        }
      }),
      RUNS,
    );
  });

  it('a set of one gives the same summary as summariseDates', () => {
    fc.assert(
      fc.property(datasetArb({ links: false }), (dataset) => {
        for (const set of linkedSets(dataset.collections)) {
          expect(summariseSet(set, dataset.sources)).toEqual(
            summariseDates(set.members[0] as Feature, dataset.sources),
          );
        }
      }),
      RUNS,
    );
  });

  it('joining two sets by one new link gives a window inside the hull of the two windows', () => {
    fc.assert(
      fc.property(datasetArb({ links: true }), (dataset) => {
        const sets = linkedSets(dataset.collections);
        for (let i = 0; i + 1 < sets.length; i += 2) {
          const s1 = sets[i] as LinkedSet;
          const s2 = sets[i + 1] as LinkedSet;
          const w1 = summariseSet(s1, dataset.sources);
          const w2 = summariseSet(s2, dataset.sources);
          const joinedMembers = [...s1.members, ...s2.members].sort((a, b) => (a.id < b.id ? -1 : 1));
          const joined = summariseSet(
            { memberIds: joinedMembers.map((m) => m.id), members: joinedMembers },
            dataset.sources,
          );
          if (joined.kind !== 'dated') continue;
          const windows = [w1, w2].flatMap((w) => (w.kind === 'dated' ? [w.window] : []));
          expect(windows.length).toBeGreaterThan(0);
          expect(joined.window.from).toBeGreaterThanOrEqual(Math.min(...windows.map((w) => w.from)));
          expect(joined.window.to).toBeLessThanOrEqual(Math.max(...windows.map((w) => w.to)));
        }
      }),
      RUNS,
    );
  });
});

/** The rule of requirement 18.4, written out again for the oracle. */
function expectedMember(dataset: Dataset, set: LinkedSet, era: { year_from: number; year_to: number }): string {
  const range = (f: Feature) => {
    const s = dataset.sourceList.find((x) => x.id === f.properties.provenance.origin_source);
    return { from: s?.year_from as number, to: s?.year_to as number };
  };
  const byId = (a: Feature, b: Feature) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const containing = set.members.filter((m) => range(m).from <= era.year_from && era.year_to <= range(m).to);
  if (containing.length > 0) return [...containing].sort(byId)[0]?.id as string;
  const ended = set.members.filter((m) => range(m).to <= era.year_from);
  if (ended.length > 0) {
    const latest = Math.max(...ended.map((m) => range(m).to));
    return ended.filter((m) => range(m).to === latest).sort(byId)[0]?.id as string;
  }
  const earliest = Math.min(...set.members.map((m) => range(m).from));
  return set.members.filter((m) => range(m).from === earliest).sort(byId)[0]?.id as string;
}

describe('P17: a linked set is drawn at most once, from the member the rule picks', () => {
  it('holds for any dataset and era, and under any reordering', () => {
    fc.assert(
      fc.property(datasetArb({ links: true }), eraArb, fc.integer(), (dataset, era, seed) => {
        const list = featuresForEra(dataset.collections, dataset.sources, era);
        const sets = linkedSets(dataset.collections);

        const claimed = new Set<string>();
        for (const entry of list.features) {
          for (const m of entry.linkedIds) {
            expect(claimed.has(m)).toBe(false);
            claimed.add(m);
          }
          const set = sets.find((s) => s.memberIds.includes(entry.id)) as LinkedSet;
          expect(set.memberIds).toEqual(entry.linkedIds);
          expect(entry.id).toBe(expectedMember(dataset, set, era));
          const member = set.members.find((m) => m.id === entry.id) as Feature;
          expect(entry.geometry).toEqual(member.geometry);
          // sourceIds names every source any member cites.
          const cited = new Set(
            set.members.flatMap((m) => [
              m.properties.provenance.origin_source,
              ...m.properties.observations.map((o) => o.source),
            ]),
          );
          expect(new Set(entry.sourceIds)).toEqual(cited);
          expect(entry.sourceIds[0]).toBe(member.properties.provenance.origin_source);
        }

        const permuted = featuresForEra(permuteCollections(dataset.collections, seed), dataset.sources, era);
        expect(permuted).toEqual(list);
      }),
      RUNS,
    );
  });
});

describe('P18: same-source disagreement inside a set is a conflict', () => {
  const sources = showcaseSources();
  const flags = fc
    .tuple(fc.boolean(), visibilityArb, fc.boolean(), visibilityArb)
    .filter(([pa, va, pb, vb]) => pa !== pb || va !== vb);

  it('lists both observations, draws nothing and sends every member to review', () => {
    fc.assert(
      fc.property(flags, eraArb, ([pa, va, pb, vb], era) => {
        const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(AERIAL, pa, va, 'person')]);
        const b = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin'), obs(AERIAL, pb, vb, 'person')]);
        link(a, b);
        const cs = [makeCollection(P1911, [a]), makeCollection(P1935, [b])];
        const [set] = linkedSets(cs);
        const s = summariseSet(set as LinkedSet, sources);
        const conflicted = s.conflicts.filter((r) => r.source === AERIAL);
        expect(conflicted).toHaveLength(2);
        expect(new Set(conflicted.map((r) => `${r.present}|${r.visibility}`)).size).toBe(2);

        const list = featuresForEra(cs, sources, era);
        expect(list.features).toEqual([]);
        expect(list.needsReview).toEqual([a.id, b.id].sort());
      }),
      RUNS,
    );
  });

  it('agreement is not a conflict', () => {
    fc.assert(
      fc.property(fc.boolean(), visibilityArb, (p, v) => {
        const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(AERIAL, p, v, 'person')]);
        const b = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin'), obs(AERIAL, p, v, 'person')]);
        link(a, b);
        const [set] = linkedSets([makeCollection(P1911, [a]), makeCollection(P1935, [b])]);
        const s = summariseSet(set as LinkedSet, sources);
        expect(s.conflicts.filter((r) => r.source === AERIAL && v === 'clear' && p)).toEqual([]);
        if (s.kind === 'dated') {
          // The only conflicts possible are clear absences inside the window (1911..1935).
          expect(s.conflicts.every((r) => !r.present && r.visibility === 'clear')).toBe(true);
        }
      }),
      RUNS,
    );
  });
});
