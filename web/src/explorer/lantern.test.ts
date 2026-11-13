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
  lanternHelp,
  lanternLabel,
  moveByKey,
  toScreenPoint,
} from './lantern';
import type { SourceIndex } from '../evidence';

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
  const drapedEras = new Set(['1935', '1911']);
  const hasDrape = (id: string): boolean => drapedEras.has(id);

  it('is the era at depth 1 unless a past era is asked for, when no drape is known', () => {
    expect(lanternEra(order, null)).toBe('1947');
    expect(lanternEra(order, '1911')).toBe('1911');
  });

  it('is the nearest era below Today that has a drape, unless a past era is asked for', () => {
    expect(lanternEra(order, null, hasDrape)).toBe('1935');
    expect(lanternEra(order, '1911', hasDrape)).toBe('1911');
    expect(lanternEra(order, '1947', hasDrape)).toBe('1947');
    expect(lanternEra([...order].reverse(), null, hasDrape)).toBe('1935');
    expect(lanternEra(order, null, (id) => id === '1947' || id === '1911')).toBe('1947');
  });

  it('falls back to depth 1 when no past era has a drape', () => {
    expect(lanternEra(order, null, () => false)).toBe('1947');
  });

  it('is never Today, and an unknown era falls back to the default', () => {
    expect(lanternEra(order, 'today')).toBe('1947');
    expect(lanternEra(order, '1850')).toBe('1947');
    expect(lanternEra(order, 'today', hasDrape)).toBe('1935');
    expect(lanternEra(order, '1850', hasDrape)).toBe('1935');
  });

  it('is nothing when there is no past era', () => {
    expect(lanternEra([{ id: 'today', index: 0 }], null)).toBeNull();
    expect(lanternEra([{ id: 'today', index: 0 }], null, hasDrape)).toBeNull();
  });
});

describe('the Lantern control label', () => {
  const sources = new Map([
    ['fip_v3_1935_229', { id: 'fip_v3_1935_229', type: 'fire_insurance_plan', year_from: 1931, year_to: 1935 }],
    ['aerial_1947_x', { id: 'aerial_1947_x', type: 'aerial_photograph', year_from: 1947, year_to: 1947 }],
  ]) as unknown as SourceIndex;

  it('names what is inside the lens in plain words, with no ids', () => {
    expect(lanternLabel(sources, [{ sourceId: 'fip_v3_1935_229' }])).toBe('Lantern: 1931-35 plan');
    expect(lanternLabel(sources, [{ sourceId: 'aerial_1947_x' }])).toBe('Lantern: 1947 photograph');
  });

  it('is just "Lantern" when the lens era has no drape or the source is unknown', () => {
    expect(lanternLabel(sources, [])).toBe('Lantern');
    expect(lanternLabel(sources, [{ sourceId: 'nope' }])).toBe('Lantern');
  });
});

describe('the Lantern help line', () => {
  const sources = new Map([
    ['fip_v3_1935_229', { id: 'fip_v3_1935_229', type: 'fire_insurance_plan', year_from: 1931, year_to: 1935 }],
  ]) as unknown as SourceIndex;

  it('names the keys, the touch gesture and the plan inside the circle, with no id', () => {
    const line = lanternHelp(sources, [{ sourceId: 'fip_v3_1935_229' }]);
    expect(line).toBe('Hold Space or press L (on a touch screen, press and hold) to see the 1931-35 plan inside a circle.');
    expect(line).not.toMatch(/fip_|_229/);
  });

  it('still reads as one plain line when there is no drape to name', () => {
    expect(lanternHelp(sources, [])).toBe('Hold Space or press L (on a touch screen, press and hold) to see an older view inside a circle.');
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
