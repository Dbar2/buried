/**
 * fast-check generators for the Report's property tests: small synthetic worlds around the fixture
 * lot with buildings, water and land-use areas on two plates, linked pairs (some disagreeing),
 * aerial absences, reviewed areas of random extent and `covers`, and uses that include banned words
 * and digits. Geometry is rectangles; reviewed and mapped areas are rectangles too, so a test can
 * check coverage with plain arithmetic.
 */
import fc from 'fast-check';
import type { Feature, FeatureCollection, PolygonalGeometry } from '../../evidence';
import { AERIAL, E0, N0, P1911, P1935, link, makeCollection, makeFeature, obs, rect } from './fixtures';

export const USES = ['Stores', 'Dwelling', 'Clean works', 'Safe deposit', 'Stable 2nd floor', 'Oil storage', 'Will flood cellar'] as const;

type Cover = 'building' | 'water' | 'land_use';
const COVERS: Array<Cover[] | undefined> = [undefined, ['building'], ['building', 'water'], ['building', 'water', 'land_use'], ['building', 'land_use']];

export type Box = { x0: number; y0: number; x1: number; y1: number };

export type PlateSpec = {
  present: boolean;
  mapped: Box | null;
  reviewed: { box: Box; covers: Cover[] | undefined } | null;
};

export type FeatureSpec = {
  origin: typeof P1911 | typeof P1935;
  kind: 'building' | 'water' | 'land_use';
  dx: number;
  dy: number;
  w: number;
  h: number;
  errorM: number;
  use: (typeof USES)[number] | undefined;
  storeys: number | undefined;
  confidence: 'documented' | 'estimated' | 'unknown';
  /** Another feature of the other plate drawn on top, linked to this one. */
  pair: null | { thisSeesOther: 'present' | 'absent' | 'obscured'; otherSeesThis: 'present' | 'absent' | 'obscured' };
  aerial: 'none' | 'absent_clear' | 'absent_obscured' | 'not_covered';
};

export type World = { plates: Record<typeof P1911 | typeof P1935, PlateSpec>; features: FeatureSpec[] };

const box = (cx: fc.Arbitrary<number>): fc.Arbitrary<Box> =>
  fc
    .tuple(fc.integer({ min: 0, max: 220 }), fc.integer({ min: 0, max: 220 }), fc.integer({ min: 40, max: 260 }), fc.integer({ min: 40, max: 260 }), cx)
    .map(([a, b, w, h]) => ({ x0: E0 - a, y0: N0 - b, x1: E0 - a + w + a, y1: N0 - b + h + b }));

const plateArb: fc.Arbitrary<PlateSpec> = fc.record({
  present: fc.boolean(),
  mapped: fc.oneof({ weight: 4, arbitrary: box(fc.constant(0)) }, { weight: 1, arbitrary: fc.constant(null) }),
  reviewed: fc.oneof(
    { weight: 3, arbitrary: fc.record({ box: box(fc.constant(0)), covers: fc.constantFrom(...COVERS) }) },
    { weight: 1, arbitrary: fc.constant(null) },
  ),
});

const seesArb = fc.constantFrom('present', 'absent', 'obscured') as fc.Arbitrary<'present' | 'absent' | 'obscured'>;

const featureArb: fc.Arbitrary<FeatureSpec> = fc.record({
  origin: fc.constantFrom(P1911, P1935),
  kind: fc.constantFrom('building', 'building', 'water', 'land_use') as fc.Arbitrary<'building' | 'water' | 'land_use'>,
  dx: fc.integer({ min: -70, max: 70 }),
  dy: fc.integer({ min: -70, max: 100 }),
  w: fc.integer({ min: 3, max: 25 }),
  h: fc.integer({ min: 3, max: 25 }),
  errorM: fc.integer({ min: 2, max: 16 }).map((n) => n / 2),
  use: fc.option(fc.constantFrom(...USES), { nil: undefined }),
  storeys: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
  confidence: fc.constantFrom('documented', 'estimated', 'unknown') as fc.Arbitrary<'documented' | 'estimated' | 'unknown'>,
  pair: fc.option(fc.record({ thisSeesOther: seesArb, otherSeesThis: seesArb }), { nil: null }),
  aerial: fc.constantFrom('none', 'none', 'absent_clear', 'absent_obscured', 'not_covered') as fc.Arbitrary<FeatureSpec['aerial']>,
});

export const worldArb: fc.Arbitrary<World> = fc.record({
  plates: fc.record({ [P1911]: plateArb, [P1935]: plateArb }) as unknown as fc.Arbitrary<World['plates']>,
  features: fc.array(featureArb, { minLength: 0, maxLength: 6 }),
});

const polygonOf = (b: Box): PolygonalGeometry => ({ type: 'Polygon', coordinates: [rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)] });

const other = (origin: string): string => (origin === P1911 ? P1935 : P1911);

function seesToObs(source: string, sees: 'present' | 'absent' | 'obscured') {
  return obs(source, sees === 'present', sees === 'obscured' ? 'obscured' : 'clear', 'match_auto');
}

/** Turn a world into evidence collections. Deterministic: the same world gives the same files. */
export function buildCollections(world: World): FeatureCollection[] {
  const features: Record<string, Feature[]> = { [P1911]: [], [P1935]: [] };
  const seq: Record<string, number> = { [P1911]: 0, [P1935]: 0 };
  const make = (origin: string, spec: FeatureSpec, observations: ReturnType<typeof obs>[]): Feature => {
    seq[origin] = (seq[origin] as number) + 1;
    const f = makeFeature(origin, observations, {
      seq: seq[origin] as number,
      kind: spec.kind,
      at: [E0 + spec.dx, N0 + spec.dy],
      size: [spec.w, spec.h],
      positionErrorM: spec.errorM,
    });
    f.properties.confidence = spec.confidence;
    f.properties.attributes = { ...(spec.use !== undefined ? { use: spec.use } : {}), ...(spec.kind === 'building' && spec.storeys !== undefined ? { storeys: spec.storeys } : {}) };
    (features[origin] as Feature[]).push(f);
    return f;
  };
  for (const spec of world.features) {
    const aerial =
      spec.aerial === 'absent_clear' ? [obs(AERIAL, false, 'clear', 'person')] : spec.aerial === 'absent_obscured' ? [obs(AERIAL, false, 'obscured', 'person')] : spec.aerial === 'not_covered' ? [obs(AERIAL, false, 'not_covered', 'match_auto')] : [];
    const own = obs(spec.origin, true, 'clear', 'origin');
    if (spec.pair === null) {
      make(spec.origin, spec, [own, ...aerial]);
      continue;
    }
    const a = make(spec.origin, spec, [own, seesToObs(other(spec.origin), spec.pair.thisSeesOther), ...aerial]);
    const b = make(other(spec.origin), spec, [obs(other(spec.origin), true, 'clear', 'origin'), seesToObs(spec.origin, spec.pair.otherSeesThis)]);
    link(a, b);
  }
  return [P1911, P1935].flatMap((origin) => {
    const plate = world.plates[origin as typeof P1911];
    if (!plate.present) return [];
    const c = makeCollection(origin, features[origin] as Feature[]);
    if (plate.mapped) c.mapped_area = { geometry: polygonOf(plate.mapped), method: 'map_area' } as FeatureCollection['mapped_area'];
    if (plate.reviewed) {
      c.reviewed_areas = [
        {
          geometry: polygonOf(plate.reviewed.box),
          method: 'person',
          confirmed_by: 'synthetic reviewer',
          confirmed_at: '2026-11-12T10:00:00Z',
          ...(plate.reviewed.covers ? { covers: plate.reviewed.covers } : {}),
        },
      ] as FeatureCollection['reviewed_areas'];
    }
    return [c];
  });
}
