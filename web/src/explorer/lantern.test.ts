import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkMessage } from '../bridge/bridge';
import type { Drape } from './drapes';
import {
  CANVAS_CENTRE,
  LENS_KEY_STEP,
  LENS_RADIUS,
  buildSetLantern,
  buildShowEvidence,
  lanternEra,
  moveByKey,
  toScreenPoint,
} from './lantern';

const order = [
  { id: 'today', index: 0 },
  { id: '1947', index: 1 },
  { id: '1935', index: 2 },
  { id: '1911', index: 3 },
];

const drape: Drape = {
  sourceId: 'fip_v3_1911_229',
  url: '/data/tiles/fip_v3_1911_229.jpg',
  corners: {
    topLeft: [632273.9, 4835125],
    topRight: [632592.4, 4835225.6],
    bottomRight: [632714.8, 4834837.7],
    bottomLeft: [632396.4, 4834737.1],
  },
  widthPx: 3428,
  heightPx: 4096,
};

describe('the lens position', () => {
  it('is the pointer on the canvas, from the top left, clamped to it', () => {
    const rect = { left: 100, top: 50, width: 800, height: 400 };
    expect(toScreenPoint(500, 250, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(toScreenPoint(100, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(toScreenPoint(2000, -10, rect)).toEqual({ x: 1, y: 0 });
  });

  it('is the middle of a canvas with no size', () => {
    expect(toScreenPoint(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual(CANVAS_CENTRE);
  });

  it('moves by the arrow keys and stays on the canvas', () => {
    expect(moveByKey({ x: 0.5, y: 0.5 }, 'ArrowRight')).toEqual({ x: 0.5 + LENS_KEY_STEP, y: 0.5 });
    expect(moveByKey({ x: 0.5, y: 0.5 }, 'ArrowUp')).toEqual({ x: 0.5, y: 0.5 - LENS_KEY_STEP });
    expect(moveByKey({ x: 0, y: 1 }, 'ArrowLeft')).toEqual({ x: 0, y: 1 });
    expect(moveByKey({ x: 0, y: 1 }, 'ArrowDown')).toEqual({ x: 0, y: 1 });
    expect(moveByKey({ x: 0.3, y: 0.3 }, 'a')).toEqual({ x: 0.3, y: 0.3 });
  });

  it('is always a point the bridge accepts, whatever the pointer does', () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, min: -1e6, max: 1e6 }), fc.double({ noNaN: true, min: -1e6, max: 1e6 }), (x, y) => {
        const point = toScreenPoint(x, y, { left: 10, top: 20, width: 640, height: 480 });
        const result = checkMessage(buildSetLantern({ on: true, center: point, eraId: '1911' }));
        expect(result.ok).toBe(true);
      }),
    );
  });
});

describe('the era shown inside the lens', () => {
  it('is the era at depth 1 unless a past era is asked for', () => {
    expect(lanternEra(order, null)).toBe('1947');
    expect(lanternEra(order, '1911')).toBe('1911');
  });

  it('is never Today, and an unknown era falls back to the default', () => {
    expect(lanternEra(order, 'today')).toBe('1947');
    expect(lanternEra(order, '1850')).toBe('1947');
  });

  it('is nothing when there is no past era', () => {
    expect(lanternEra([{ id: 'today', index: 0 }], null)).toBeNull();
  });
});

describe('the messages', () => {
  it('sets the lens with the fixed radius and passes the bridge', () => {
    const message = buildSetLantern({ on: true, center: { x: 0.4, y: 0.6 }, eraId: '1911' });
    expect(message.payload).toEqual({ on: true, center: { x: 0.4, y: 0.6 }, radius: LENS_RADIUS, eraId: '1911' });
    expect(checkMessage(message).ok).toBe(true);
    expect(checkMessage(buildSetLantern({ on: false, center: { x: 0.4, y: 0.6 }, eraId: '1911' })).ok).toBe(true);
  });

  it('carries the drape when Show Evidence is on and none when it is off', () => {
    const on = buildShowEvidence('bld_fip_v3_1911_229_0001', drape);
    expect(on.payload).toMatchObject({ on: true, drape });
    expect(checkMessage(on).ok).toBe(true);
    const off = buildShowEvidence('bld_fip_v3_1911_229_0001', null);
    expect(off.payload).toEqual({ featureId: 'bld_fip_v3_1911_229_0001', on: false });
    expect(checkMessage(off).ok).toBe(true);
  });

  it('is refused by the bridge when the drape is missing or extra', () => {
    expect(checkMessage({ type: 'scene/showEvidence', payload: { featureId: 'bld_fip_v3_1911_229_0001', on: true } }).ok).toBe(false);
    expect(checkMessage({ type: 'scene/showEvidence', payload: { featureId: 'bld_fip_v3_1911_229_0001', on: false, drape } }).ok).toBe(false);
  });
});
