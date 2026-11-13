import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkMessage } from '../bridge/bridge';
import type { PresentLayer } from '../evidence';
import { PRESENT_BUILDINGS_SOURCE, PRESENT_HEIGHT_M, presentBuildings } from './presentBuildings';

type PF = PresentLayer['features'][number];

const square = (e: number, n: number): number[][][] => [
  [
    [e, n],
    [e + 10, n],
    [e + 10, n + 10],
    [e, n + 10],
    [e, n],
  ],
];

function layerOf(features: PF[]): PresentLayer {
  return { source: PRESENT_BUILDINGS_SOURCE, features } as unknown as PresentLayer;
}
const polygon = (id: string, e: number, n: number): PF =>
  ({ type: 'Feature', id, geometry: { type: 'Polygon', coordinates: square(e, n) }, properties: {} }) as unknown as PF;

describe('presentBuildings (requirement 8.4)', () => {
  it('gives every building the fixed display height and keeps its id and geometry', () => {
    const { buildings, skipped } = presentBuildings(layerOf([polygon('a', 632000, 4835000), polygon('b', 632100, 4835100)]));
    expect(skipped).toBe(0);
    expect(buildings.map((b) => b.id)).toEqual(['a', 'b']);
    expect(buildings.every((b) => b.heightM === PRESENT_HEIGHT_M)).toBe(true);
  });

  it('keeps MultiPolygons', () => {
    const multi = { type: 'Feature', id: 'm', geometry: { type: 'MultiPolygon', coordinates: [square(632000, 4835000)] }, properties: {} } as unknown as PF;
    expect(presentBuildings(layerOf([multi])).buildings).toHaveLength(1);
  });

  it('leaves out what the bridge cannot carry, and counts it', () => {
    const point = { type: 'Feature', id: 'p', geometry: { type: 'Point', coordinates: [632000, 4835000] }, properties: {} } as unknown as PF;
    const open = {
      type: 'Feature',
      id: 'o',
      geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] },
      properties: {},
    } as unknown as PF;
    const result = presentBuildings(layerOf([point, open, polygon('a', 632000, 4835000), polygon('a', 632200, 4835000)]));
    expect(result.buildings.map((b) => b.id)).toEqual(['a']);
    expect(result.skipped).toBe(3);
  });

  it('with no layer gives no buildings', () => {
    expect(presentBuildings(undefined)).toEqual({ buildings: [], skipped: 0 });
  });

  it('never states a height as text (the figure is a display value only)', () => {
    const { buildings } = presentBuildings(layerOf([polygon('a', 632000, 4835000)]));
    expect(Object.keys(buildings[0] ?? {}).sort()).toEqual(['geometry', 'heightM', 'id']);
  });
});

describe('the committed building outlines', () => {
  const path = fileURLToPath(new URL('../../../data/present/present_toronto_building_outlines_2026.geojson', import.meta.url));
  const layer = JSON.parse(readFileSync(path, 'utf8')) as PresentLayer;

  it('all pass through the bridge as a scene/init (the Schema and the semantic rules)', () => {
    const { buildings, skipped } = presentBuildings(layer);
    expect(buildings.length + skipped).toBe(layer.features.length);
    expect(skipped).toBe(0);
    const message = {
      type: 'scene/init',
      payload: {
        bridgeVersion: '0.4.0',
        origin: { easting: 632500, northing: 4835000 },
        bounds: { minE: 631900, minN: 4834400, maxE: 633200, maxN: 4835600 },
        initialView: { minE: 632000, minN: 4834500, maxE: 633100, maxN: 4835500 },
        eras: [{ id: 'today', index: 0 }],
        present: buildings,
        reducedMotion: false,
        debug: false,
      },
    };
    const result = checkMessage(message);
    expect(result.ok ? 'ok' : result.reason).toBe('ok');
  });
});
