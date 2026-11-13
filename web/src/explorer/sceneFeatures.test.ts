import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkMessage } from '../bridge/bridge';
import { featuresForEra } from '../evidence';
import type { EraFeature, Feature } from '../evidence';
import {
  ERA_1911,
  P1911,
  makeCollection,
  makeFeature,
  obs,
  showcaseSources,
} from '../evidence/testing/fixtures';
import {
  AREA_SHEET_M,
  STOREY_HEIGHT_M,
  UNRECORDED_HEIGHT_M,
  WATER_RIBBON_MIN_M,
  sceneFeaturesFor,
  toSceneFeature,
} from './sceneFeatures';

const sources = showcaseSources();
const origin = () => [obs(P1911, true, 'clear', 'origin')];

function entryFor(feature: Feature): EraFeature {
  const list = featuresForEra([makeCollection(P1911, [feature])], sources, ERA_1911);
  const entry = list.features[0];
  if (!entry) throw new Error('the feature was not drawn in era 1911');
  return entry;
}

describe('toSceneFeature (requirement 6.4)', () => {
  it('copies id, kind, geometry and confidence unchanged', () => {
    const feature = makeFeature(P1911, origin(), { seq: 3 });
    feature.properties.confidence = 'estimated';
    const entry = entryFor(feature);
    const scene = toSceneFeature(entry);
    expect(scene).not.toBeNull();
    expect(scene?.id).toBe(entry.id);
    expect(scene?.kind).toBe('building');
    expect(scene?.geometry).toBe(entry.geometry);
    expect(scene?.confidence).toBe('estimated');
  });

  it('gives a building with recorded storeys that many storeys of height', () => {
    const feature = makeFeature(P1911, origin());
    feature.properties.attributes = { storeys: 3 };
    expect(toSceneFeature(entryFor(feature))?.heightM).toBe(3 * STOREY_HEIGHT_M);
  });

  it('gives a building with no recorded storeys one storey of height', () => {
    const feature = makeFeature(P1911, origin());
    feature.properties.attributes = {};
    feature.properties.confidence = 'estimated';
    expect(toSceneFeature(entryFor(feature))?.heightM).toBe(UNRECORDED_HEIGHT_M);
  });

  it('draws water as wide as twice its position error, at least the minimum', () => {
    const wide = makeFeature(P1911, origin(), { kind: 'water', positionErrorM: 4.5 });
    expect(toSceneFeature(entryFor(wide))?.heightM).toBe(9);
    const narrow = makeFeature(P1911, origin(), { kind: 'water', positionErrorM: 0.4 });
    expect(toSceneFeature(entryFor(narrow))?.heightM).toBe(WATER_RIBBON_MIN_M);
  });

  it('sends a land-use area (bridge 0.7.0), flat, with its confidence and no storeys', () => {
    const area = makeFeature(P1911, origin(), { kind: 'land_use' });
    area.properties.confidence = 'estimated';
    area.properties.attributes = { use: 'Coal yard' };
    const entry = entryFor(area);
    const scene = toSceneFeature(entry);
    expect(scene.kind).toBe('land_use');
    expect(scene.geometry).toBe(entry.geometry);
    expect(scene.confidence).toBe('estimated');
    expect(scene.heightM).toBe(AREA_SHEET_M);
    expect(Object.keys(scene).sort().join()).toBe('confidence,geometry,heightM,id,kind');
    expect(checkMessage({ type: 'scene/loadEra', payload: { eraId: '1911', features: [scene], drapes: [] } }).ok).toBe(true);
  });

  it('keeps the order of the Era list and drops nothing', () => {
    const features = [
      makeFeature(P1911, origin(), { seq: 1 }),
      makeFeature(P1911, origin(), { seq: 2, kind: 'land_use' }),
      makeFeature(P1911, origin(), { seq: 3, kind: 'water' }),
    ];
    const list = featuresForEra([makeCollection(P1911, features)], sources, ERA_1911);
    expect(sceneFeaturesFor(list).map((f) => f.id)).toEqual(features.map((f) => f.id));
  });
});

describe('E6 (gate subset): scene features mirror Era list entries', () => {
  it('holds for generated buildings and water', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('building', 'water') as fc.Arbitrary<'building' | 'water'>,
        fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined }),
        fc.integer({ min: 1, max: 400 }).map((n) => n / 10),
        fc.constantFrom('documented', 'estimated', 'unknown') as fc.Arbitrary<'documented' | 'estimated' | 'unknown'>,
        (kind, storeys, error, confidence) => {
          const feature = makeFeature(P1911, origin(), { kind, positionErrorM: error });
          feature.properties.confidence = confidence;
          if (kind === 'building') feature.properties.attributes = storeys === undefined ? {} : { storeys };
          const entry = entryFor(feature);
          const scene = toSceneFeature(entry);
          if (scene === null) return false;
          const height =
            kind === 'building'
              ? storeys === undefined
                ? UNRECORDED_HEIGHT_M
                : storeys * STOREY_HEIGHT_M
              : Math.max(WATER_RIBBON_MIN_M, 2 * error);
          // Bridge 0.5.0: a building's recorded storeys go with it, and an unrecorded count is never sent.
          const expectedKeys = kind === 'building' && storeys !== undefined ? 'confidence,geometry,heightM,id,kind,storeys' : 'confidence,geometry,heightM,id,kind';
          return (
            scene.id === entry.id &&
            scene.kind === entry.kind &&
            scene.geometry === entry.geometry &&
            scene.confidence === entry.confidence &&
            scene.heightM === height &&
            scene.storeys === (kind === 'building' ? storeys : undefined) &&
            Object.keys(scene).sort().join() === expectedKeys
          );
        },
      ),
      { numRuns: 200 },
    );
  });
});
