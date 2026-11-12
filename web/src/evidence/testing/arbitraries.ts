/**
 * fast-check generators shared by the Evidence Library tests.
 *
 * Generated sources have 1800 <= year_from <= year_to <= 2030. Generated features have 1 to 8
 * observations (one per source) with random `present` and `visibility`. Geometry is synthetic.
 */
import fc from 'fast-check';
import { indexSources } from '../sources';
import type { SourceIndex } from '../sources';
import type { Era, Feature, FeatureCollection, Observation, Source } from '../types.generated';
import { E0, N0, link, makeCollection, makeFeature, makeSource, obs, rect } from './fixtures';

export const MIN_YEAR = 1800;
export const MAX_YEAR = 2030;

export const yearRangeArb: fc.Arbitrary<{ from: number; to: number }> = fc
  .integer({ min: MIN_YEAR, max: MAX_YEAR })
  .chain((from) => fc.integer({ min: from, max: MAX_YEAR }).map((to) => ({ from, to })));

export const eraArb: fc.Arbitrary<Era> = fc
  .tuple(yearRangeArb, fc.integer({ min: 0, max: 9999 }))
  .map(([r, n]) => ({ id: `era${n}`, label: `Era ${n}`, year_from: r.from, year_to: r.to }));

/** Sources with distinct ids and random year ranges. */
export function sourcesArb(min = 2, max = 6): fc.Arbitrary<Source[]> {
  return fc.array(yearRangeArb, { minLength: min, maxLength: max }).map((ranges) =>
    ranges.map((r, i) => makeSource(`fip_v3_${r.from}_${100 + i}`, r.from, r.to)),
  );
}

const visibilityArb = fc.constantFrom<Observation['visibility']>(
  'clear',
  'clear',
  'clear',
  'obscured',
  'not_covered',
);

/** One observation per source in a random non-empty subset of at most 8 sources. */
export function observationsArb(sources: readonly Source[]): fc.Arbitrary<Observation[]> {
  return fc
    .subarray([...sources], { minLength: 1, maxLength: Math.min(8, sources.length) })
    .chain((chosen) =>
      fc
        .array(fc.tuple(fc.boolean(), visibilityArb), { minLength: chosen.length, maxLength: chosen.length })
        .map((flags) => chosen.map((s, i) => obs(s.id, flags[i]?.[0] ?? true, flags[i]?.[1] ?? 'clear'))),
    );
}

export type FeatureCase = { sources: SourceIndex; sourceList: Source[]; feature: Feature };

/** A registry and one feature whose observations cite it. The feature may have no clear presence. */
export const featureCaseArb: fc.Arbitrary<FeatureCase> = sourcesArb().chain((sourceList) =>
  fc
    .tuple(observationsArb(sourceList), fc.integer({ min: 0, max: sourceList.length - 1 }))
    .map(([observations, originIndex]) => ({
      sources: indexSources({ schema_version: '1.0.0', sources: sourceList }),
      sourceList,
      feature: makeFeature((sourceList[originIndex] as Source).id, observations),
    })),
);

/** A feature case that has at least one clear presence. */
export const presentCaseArb: fc.Arbitrary<FeatureCase> = featureCaseArb.filter((c) =>
  c.feature.properties.observations.some((o) => o.present && o.visibility === 'clear'),
);

export type Dataset = {
  sources: SourceIndex;
  sourceList: Source[];
  collections: FeatureCollection[];
  features: Feature[];
};

export type DatasetOptions = {
  /** Add mirrored `same_as` links between features from different origin sources. */
  links?: boolean;
  maxFeatures?: number;
};

/**
 * A registry and several features spread over collections by origin source. With `links`, random
 * mirrored links join features from different origins, never putting two features of one origin
 * into the same linked set.
 */
export function datasetArb(options: DatasetOptions = {}): fc.Arbitrary<Dataset> {
  const maxFeatures = options.maxFeatures ?? 8;
  return sourcesArb(2, 6).chain((sourceList) =>
    fc
      .array(
        fc.record({
          origin: fc.integer({ min: 0, max: sourceList.length - 1 }),
          observations: observationsArb(sourceList),
          published: fc.constantFrom(true, true, true, false),
        }),
        { minLength: 1, maxLength: maxFeatures },
      )
      .chain((specs) =>
        fc
          .array(fc.tuple(fc.nat(maxFeatures), fc.nat(maxFeatures)), {
            minLength: 0,
            maxLength: options.links ? 8 : 0,
          })
          .map((pairs) => {
            const counters = new Map<string, number>();
            const features = specs.map((spec) => {
              const origin = (sourceList[spec.origin] as Source).id;
              const seq = (counters.get(origin) ?? 0) + 1;
              counters.set(origin, seq);
              return makeFeature(origin, spec.observations, {
                seq,
                status: spec.published ? 'published' : 'rejected',
              });
            });
            addLinks(features, pairs);
            const collections = [...new Set(features.map((f) => f.properties.provenance.origin_source))]
              .sort()
              .map((origin) =>
                makeCollection(
                  origin,
                  features.filter((f) => f.properties.provenance.origin_source === origin),
                ),
              );
            return {
              sources: indexSources({ schema_version: '1.0.0', sources: sourceList }),
              sourceList,
              collections,
              features,
            };
          }),
      ),
  );
}

/** Link published features pairwise, skipping a pair that would put two of one origin in a set. */
function addLinks(features: Feature[], pairs: [number, number][]): void {
  const component = new Map<string, Set<string>>(); // feature id -> ids in its set
  const originOf = (f: Feature) => f.properties.provenance.origin_source;
  for (const [i, j] of pairs) {
    const a = features[i % features.length] as Feature;
    const b = features[j % features.length] as Feature;
    if (a.id === b.id || a.properties.status !== 'published' || b.properties.status !== 'published') continue;
    const setA = component.get(a.id) ?? new Set([a.id]);
    const setB = component.get(b.id) ?? new Set([b.id]);
    if (setA === setB) continue;
    const byId = new Map(features.map((f) => [f.id, f]));
    const origins = new Set([...setA].map((id) => originOf(byId.get(id) as Feature)));
    if ([...setB].some((id) => origins.has(originOf(byId.get(id) as Feature)))) continue;
    link(a, b);
    const merged = new Set([...setA, ...setB]);
    for (const id of merged) component.set(id, merged);
  }
}

/** Integer-metre rectangle near the project origin: [east, north, width, height]. */
export const rectangleArb = fc.tuple(
  fc.integer({ min: 0, max: 200 }),
  fc.integer({ min: 0, max: 200 }),
  fc.integer({ min: 1, max: 60 }),
  fc.integer({ min: 1, max: 60 }),
);

export function rectangleCoordinates(r: readonly [number, number, number, number]): [number, number][] {
  return rect(E0 + r[0], N0 + r[1], r[2], r[3]);
}

/**
 * An L-shaped lot (a rectangle with a notch cut from one corner), which has a reflex corner.
 * Returned as a closed ring in the order: counter-clockwise from the bottom-left corner.
 */
export const lShapedLotArb = fc
  .tuple(
    fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 20, max: 80 }),
    fc.integer({ min: 20, max: 80 }),
    fc.integer({ min: 5, max: 15 }),
    fc.integer({ min: 5, max: 15 }),
  )
  .map(([e, n, w, h, cutW, cutH]): [number, number][] => [
    [E0 + e, N0 + n],
    [E0 + e + w, N0 + n],
    [E0 + e + w, N0 + n + h - cutH],
    [E0 + e + w - cutW, N0 + n + h - cutH],
    [E0 + e + w - cutW, N0 + n + h],
    [E0 + e, N0 + n + h],
    [E0 + e, N0 + n],
  ]);
