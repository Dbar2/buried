import { describe, expect, it } from 'vitest';
import { summariseDates } from './dates';
import { drawnMember, featuresForEra, isDrawnInEra } from './eras';
import { linkedSets } from './links';
import { indexSources } from './sources';
import {
  AERIAL,
  ERA_1911,
  ERA_1935,
  ERA_1947,
  ERA_TODAY,
  P1911,
  P1935,
  link,
  makeCollection,
  makeFeature,
  makeSource,
  obs,
  showcaseSources,
} from './testing/fixtures';
import type { Feature } from './types.generated';

const sources = showcaseSources();
const ERAS = [ERA_1911, ERA_1935, ERA_1947, ERA_TODAY];

const ids = (list: { features: { id: string }[] }) => list.features.map((f) => f.id);

describe('isDrawnInEra (requirement 12.1)', () => {
  const f = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true)]); // window 1911..1935
  const summary = summariseDates(f, sources);

  it('needs the whole era inside the window', () => {
    expect(isDrawnInEra(summary, ERA_1911)).toBe(true);
    expect(isDrawnInEra(summary, ERA_1935)).toBe(true);
    expect(isDrawnInEra(summary, { year_from: 1930, year_to: 1936 })).toBe(false);
    expect(isDrawnInEra(summary, { year_from: 1910, year_to: 1914 })).toBe(false);
    expect(isDrawnInEra(summary, ERA_1947)).toBe(false);
  });

  it('is false with no presence', () => {
    const none = summariseDates(makeFeature(P1911, [obs(P1911, true, 'obscured', 'origin')]), sources);
    expect(isDrawnInEra(none, ERA_1911)).toBe(false);
  });
});

describe('the four-era table', () => {
  const only1911 = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 1 });
  const only1935 = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin')], { seq: 1 });
  const gone1947 = makeFeature(P1911, [
    obs(P1911, true, 'clear', 'origin'),
    obs(P1935, true),
    obs(AERIAL, false, 'clear'),
  ], { seq: 2 });
  const lastSeen1935 = makeFeature(P1911, [
    obs(P1911, true, 'clear', 'origin'),
    obs(P1935, true),
    obs(AERIAL, false, 'obscured'),
  ], { seq: 3 });
  const collections = [
    makeCollection(P1911, [only1911, gone1947, lastSeen1935]),
    makeCollection(P1935, [only1935]),
  ];
  const list = (era: (typeof ERAS)[number]) => featuresForEra(collections, sources, era);

  it('draws each feature only in the eras its window holds', () => {
    expect(ids(list(ERA_1911))).toEqual([only1911.id, gone1947.id, lastSeen1935.id]);
    expect(ids(list(ERA_1935))).toEqual([only1935.id, gone1947.id, lastSeen1935.id].sort());
    expect(ids(list(ERA_1947))).toEqual([]);
    expect(ids(list(ERA_TODAY))).toEqual([]);
  });

  it('carries the date phrases', () => {
    const byId = new Map(list(ERA_1911).features.map((f) => [f.id, f]));
    expect(byId.get(only1911.id)?.phrases).toEqual(['Built by 1914', 'Last seen 1911']);
    expect(byId.get(gone1947.id)?.phrases).toEqual(['Built by 1914', 'Gone by 1947']);
    expect(byId.get(lastSeen1935.id)?.phrases).toEqual(['Built by 1914', 'Last seen 1935']);
  });

  it('is sorted by id and carries the geometry, position error and confidence unchanged', () => {
    const l = list(ERA_1911);
    expect(ids(l)).toEqual([...ids(l)].sort());
    const entry = l.features.find((f) => f.id === only1911.id);
    expect(entry?.geometry).toEqual(only1911.geometry);
    expect(entry?.positionErrorM).toBe(4.5);
    expect(entry?.confidence).toBe('documented');
    expect(entry?.confidenceReason).toBe('Synthetic.');
    expect(entry?.attributes).toEqual({ storeys: 2 });
    expect(entry?.kind).toBe('building');
    expect(entry?.linkedIds).toEqual([only1911.id]);
    expect(l).toMatchObject({ eraId: '1911', yearFrom: 1911, yearTo: 1914, needsReview: [] });
  });

  it('lists the origin source first, then every other cited source, sorted', () => {
    const entry = list(ERA_1911).features.find((f) => f.id === gone1947.id);
    expect(entry?.sourceIds).toEqual([P1911, AERIAL, P1935]);
  });
});

describe('what is never drawn', () => {
  it('leaves out features that are not published', () => {
    const rejected = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { status: 'rejected' });
    const merged = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 2, status: 'merged' });
    const list = featuresForEra([makeCollection(P1911, [rejected, merged])], sources, ERA_1911);
    expect(list.features).toEqual([]);
    expect(list.needsReview).toEqual([]);
  });

  it('leaves out a feature with no clear presence', () => {
    const f = makeFeature(P1911, [obs(P1911, true, 'obscured', 'origin')]);
    expect(featuresForEra([makeCollection(P1911, [f])], sources, ERA_1911).features).toEqual([]);
  });

  it('puts a conflicted feature in needsReview in every era, and draws it in none', () => {
    const extra = makeSource('fip_v3_1912_900', 1912, 1913);
    const index = indexSources({
      schema_version: '1.0.0',
      sources: [makeSource(P1911, 1911, 1914), makeSource(P1935, 1935, 1935), extra],
    });
    const f = makeFeature(P1911, [
      obs(P1911, true, 'clear', 'origin'),
      obs(P1935, true),
      obs(extra.id, false),
    ]);
    for (const era of ERAS) {
      const l = featuresForEra([makeCollection(P1911, [f])], index, era);
      expect(l.features).toEqual([]);
      expect(l.needsReview).toEqual([f.id]);
    }
  });
});

describe('linked sets (requirements 17 and 18)', () => {
  function pair(): { a: Feature; b: Feature } {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true, 'clear', 'match_auto')]);
    const b = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin'), obs(P1911, true, 'clear', 'match_auto')]);
    link(a, b);
    return { a, b };
  }
  const collectionsOf = (a: Feature, b: Feature) => [makeCollection(P1911, [a]), makeCollection(P1935, [b])];

  it('a 1911 feature linked to a 1935 feature: window 1911 to 1935, one entry per era, from the right plate', () => {
    const { a, b } = pair();
    const cs = collectionsOf(a, b);
    const e1911 = featuresForEra(cs, sources, ERA_1911);
    const e1935 = featuresForEra(cs, sources, ERA_1935);
    expect(e1911.features).toHaveLength(1);
    expect(e1935.features).toHaveLength(1);
    expect(e1911.features[0]?.id).toBe(a.id);
    expect(e1911.features[0]?.geometry).toEqual(a.geometry);
    expect(e1935.features[0]?.id).toBe(b.id);
    expect(e1935.features[0]?.geometry).toEqual(b.geometry);
    expect(e1911.features[0]?.dates.window).toEqual({ from: 1911, to: 1935 });
    expect(e1911.features[0]?.linkedIds).toEqual([a.id, b.id].sort());
    expect(e1911.features[0]?.sourceIds).toEqual([P1911, P1935]);
    expect(e1935.features[0]?.sourceIds).toEqual([P1935, P1911]);
    expect(featuresForEra(cs, sources, ERA_1947).features).toEqual([]);
  });

  it('gives every member the same dates as the set', () => {
    const { a, b } = pair();
    const [set] = linkedSets(collectionsOf(a, b));
    expect(set?.memberIds).toEqual([a.id, b.id].sort());
    const e = featuresForEra(collectionsOf(a, b), sources, ERA_1935).features[0];
    expect(e?.phrases).toEqual(['Built by 1914', 'Last seen 1935']);
  });

  it('the same pair with a person-set clear 1947 absence on the 1935 member: gone by 1947', () => {
    const { a, b } = pair();
    b.properties.observations.push(obs(AERIAL, false, 'clear', 'person'));
    const cs = collectionsOf(a, b);
    const e1911 = featuresForEra(cs, sources, ERA_1911).features[0];
    expect(e1911?.phrases).toEqual(['Built by 1914', 'Gone by 1947']);
    expect(featuresForEra(cs, sources, ERA_1935).features).toHaveLength(1);
    expect(featuresForEra(cs, sources, ERA_1947).features).toEqual([]);
    expect(e1911?.sourceIds).toEqual([P1911, AERIAL, P1935]);
  });

  it('a pair that disagrees about one source is a conflict: both members need review', () => {
    const { a, b } = pair();
    a.properties.observations[1] = obs(P1935, false, 'clear', 'person'); // says absent in 1935; b says present
    const cs = collectionsOf(a, b);
    for (const era of ERAS) {
      const l = featuresForEra(cs, sources, era);
      expect(l.features).toEqual([]);
      expect(l.needsReview).toEqual([a.id, b.id].sort());
    }
  });

  it('a link to an unpublished feature does not join the set', () => {
    const { a, b } = pair();
    b.properties.status = 'rejected';
    b.properties.status_reason = 'synthetic';
    const sets = linkedSets(collectionsOf(a, b));
    expect(sets.map((s) => s.memberIds)).toEqual([[a.id]]);
  });

  it('linkedSets is sorted and deterministic', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 2 });
    const c = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 1 });
    const sets = linkedSets([makeCollection(P1911, [a, c])]);
    expect(sets.map((s) => s.memberIds[0])).toEqual([c.id, a.id]);
  });

  it('a duplicate feature id across files is refused', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')]);
    expect(() => linkedSets([makeCollection(P1911, [a]), makeCollection(P1935, [a])])).toThrowError(
      /duplicate feature id/,
    );
  });
});

describe('drawnMember (requirement 18.4)', () => {
  const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')]);
  const b = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin')]);
  link(a, b);
  const [set] = linkedSets([makeCollection(P1911, [a]), makeCollection(P1935, [b])]);

  it('picks the member whose source range contains the era', () => {
    expect(drawnMember(set as NonNullable<typeof set>, ERA_1911, sources).id).toBe(a.id);
    expect(drawnMember(set as NonNullable<typeof set>, ERA_1935, sources).id).toBe(b.id);
  });

  it('else the member whose source ends latest without being after the era start', () => {
    expect(drawnMember(set as NonNullable<typeof set>, ERA_1947, sources).id).toBe(b.id);
    expect(drawnMember(set as NonNullable<typeof set>, ERA_TODAY, sources).id).toBe(b.id);
    expect(drawnMember(set as NonNullable<typeof set>, { year_from: 1920, year_to: 1930 }, sources).id).toBe(a.id);
  });

  it('else the member whose source starts earliest', () => {
    expect(drawnMember(set as NonNullable<typeof set>, { year_from: 1900, year_to: 1905 }, sources).id).toBe(a.id);
  });

  it('breaks ties by the smallest feature id', () => {
    const twinA = makeSource('fip_v3_1950_001', 1950, 1951);
    const twinB = makeSource('fip_v3_1950_002', 1950, 1951);
    const index = indexSources({ schema_version: '1.0.0', sources: [twinA, twinB] });
    const x = makeFeature(twinB.id, [obs(twinB.id, true, 'clear', 'origin')]);
    const y = makeFeature(twinA.id, [obs(twinA.id, true, 'clear', 'origin')]);
    link(x, y);
    const [s] = linkedSets([makeCollection(twinB.id, [x]), makeCollection(twinA.id, [y])]);
    const era = { year_from: 1950, year_to: 1951 };
    expect(drawnMember(s as NonNullable<typeof s>, era, index).id).toBe([x.id, y.id].sort()[0]);
  });
});
