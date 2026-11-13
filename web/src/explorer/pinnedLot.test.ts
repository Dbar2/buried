import { describe, expect, it } from 'vitest';
import { checkMessage } from '../bridge/bridge';
import type { PresentLayer } from '../evidence';
import { LOTS_SOURCE, buildClearLot, buildFocusLot, buildSetDrapeMode, lotPolygon } from './pinnedLot';

const ring = (e: number, n: number): number[][] => [
  [e, n],
  [e + 12, n],
  [e + 12, n + 20],
  [e, n + 20],
  [e, n],
];

function layer(features: Array<{ id: string; geometry: unknown }>): PresentLayer {
  return {
    source: LOTS_SOURCE,
    features: features.map((f) => ({ type: 'Feature', id: f.id, geometry: f.geometry, properties: {} })),
  } as unknown as PresentLayer;
}

describe('the pinned lot', () => {
  const lots = layer([
    { id: 'lot_a', geometry: { type: 'Polygon', coordinates: [ring(632590, 4835060)] } },
    { id: 'lot_multi', geometry: { type: 'MultiPolygon', coordinates: [[ring(632600, 4835100)], [ring(632630, 4835100)]] } },
    { id: 'lot_open', geometry: { type: 'Polygon', coordinates: [[[632590, 4835060], [632602, 4835060], [632602, 4835080], [632590, 4835080]]] } },
    { id: 'lot_point', geometry: { type: 'Point', coordinates: [632590, 4835060] } },
  ]);

  it('finds a lot by its id', () => {
    expect(lotPolygon(lots, 'lot_a')).toEqual({ type: 'Polygon', coordinates: [ring(632590, 4835060)] });
    expect(lotPolygon(lots, 'lot_multi')?.type).toBe('MultiPolygon');
  });

  it('finds nothing for a missing id, no id, no layer, a point or an open ring', () => {
    expect(lotPolygon(lots, 'lot_missing')).toBeNull();
    expect(lotPolygon(lots, null)).toBeNull();
    expect(lotPolygon(lots, '')).toBeNull();
    expect(lotPolygon(undefined, 'lot_a')).toBeNull();
    expect(lotPolygon(lots, 'lot_point')).toBeNull();
    expect(lotPolygon(lots, 'lot_open')).toBeNull();
  });

  it('builds messages the bridge accepts', () => {
    const lot = lotPolygon(lots, 'lot_multi');
    expect(lot).not.toBeNull();
    for (const message of [
      buildFocusLot(lot as NonNullable<typeof lot>),
      buildClearLot(),
      buildSetDrapeMode('original'),
      buildSetDrapeMode('lit', 'fip_v3_1911_229'),
    ]) {
      const result = checkMessage(message);
      expect(result.ok, message.type).toBe(true);
    }
  });

  it('names a drape only when asked to', () => {
    expect(buildSetDrapeMode('original').payload).toEqual({ mode: 'original' });
    expect(buildSetDrapeMode('lit', 'a_b').payload).toEqual({ mode: 'lit', sourceId: 'a_b' });
  });
});
