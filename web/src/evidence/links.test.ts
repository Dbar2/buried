import { describe, expect, it } from 'vitest';
import { summariseDates, summariseSet } from './dates';
import type { Dated } from './dates';
import { linkedSets } from './links';
import {
  AERIAL,
  P1911,
  P1935,
  link,
  makeCollection,
  makeFeature,
  obs,
  showcaseSources,
} from './testing/fixtures';

const sources = showcaseSources();

describe('linkedSets', () => {
  it('a feature with no links is a set of one', () => {
    const f = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')]);
    expect(linkedSets([makeCollection(P1911, [f])])).toEqual([{ memberIds: [f.id], members: [f] }]);
  });

  it('joins a chain of links into one set, whichever way the links point', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')]);
    const b = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin')]);
    const c = makeFeature(AERIAL, [obs(AERIAL, true, 'clear', 'person')]);
    link(a, b);
    // c lists b but b does not list c: the set is still one (the Validator rejects one-way links).
    c.properties.same_as = [{ feature: b.id, method: 'match_auto' }];
    const sets = linkedSets([makeCollection(P1911, [a]), makeCollection(P1935, [b]), makeCollection(AERIAL, [c])]);
    expect(sets).toHaveLength(1);
    expect(sets[0]?.memberIds).toEqual([a.id, b.id, c.id].sort());
  });
});

describe('summariseSet', () => {
  it('a set of one gives exactly the single-feature summary', () => {
    const f = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(AERIAL, false)]);
    const [set] = linkedSets([makeCollection(P1911, [f])]);
    expect(summariseSet(set as NonNullable<typeof set>, sources)).toEqual(summariseDates(f, sources));
  });

  it('takes each source once even when several members report it', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true, 'clear', 'match_auto')]);
    const b = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin'), obs(P1911, true, 'clear', 'match_auto')]);
    link(a, b);
    const [set] = linkedSets([makeCollection(P1911, [a]), makeCollection(P1935, [b])]);
    const s = summariseSet(set as NonNullable<typeof set>, sources) as Dated;
    expect(s.presences.map((r) => r.source)).toEqual([P1911, P1935]);
    expect(s.window).toEqual({ from: 1911, to: 1935 });
  });

  it('does not widen the window beyond the union of clear presences', () => {
    // b is linked to a but only has an obscured aerial; the set cannot reach 1947.
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')]);
    const b = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin'), obs(AERIAL, true, 'obscured', 'person')]);
    link(a, b);
    const [set] = linkedSets([makeCollection(P1911, [a]), makeCollection(P1935, [b])]);
    const s = summariseSet(set as NonNullable<typeof set>, sources) as Dated;
    expect(s.window).toEqual({ from: 1911, to: 1935 });
    expect(s.notCounted.map((r) => r.source)).toEqual([AERIAL]);
  });

  it('lists both sides of a same-source disagreement and counts neither', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(AERIAL, true, 'clear', 'person')]);
    const b = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin'), obs(AERIAL, false, 'clear', 'person')]);
    link(a, b);
    const [set] = linkedSets([makeCollection(P1911, [a]), makeCollection(P1935, [b])]);
    const s = summariseSet(set as NonNullable<typeof set>, sources) as Dated;
    expect(s.conflicts.map((r) => [r.source, r.present])).toEqual([
      [AERIAL, true],
      [AERIAL, false],
    ]);
    expect(s.window).toEqual({ from: 1911, to: 1935 }); // the 1947 presence is not counted
    expect(s.afterAbsences).toEqual([]);
  });

  it('a disagreement that removes every presence still reports the conflict', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'person')]);
    const b = makeFeature(P1935, [obs(P1911, false, 'clear', 'person')]);
    link(a, b);
    const [set] = linkedSets([makeCollection(P1911, [a]), makeCollection(P1935, [b])]);
    const s = summariseSet(set as NonNullable<typeof set>, sources);
    expect(s.kind).toBe('no_presence');
    expect(s.conflicts).toHaveLength(2);
  });
});
