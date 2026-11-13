import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyAffine, cropWindow, ringsOf, tilePixelToWorld, tileToCanvas, worldToCanvas } from './cropPlan';
import type { TileRef } from './cropPlan';

const square = (e: number, n: number, w: number, h: number) => ({
  type: 'Polygon' as const,
  coordinates: [[[e, n], [e + w, n], [e + w, n + h], [e, n + h], [e, n]]] as [number, number][][],
});

describe('cropWindow', () => {
  it('is square, centred on the lot, and the lot plus 25 m on each side', () => {
    const w = cropWindow(square(632400, 4834900, 8, 30));
    expect(w.side).toBe(30 + 50);
    expect(w.minE + w.side / 2).toBeCloseTo(632404, 9);
    expect(w.minN + w.side / 2).toBeCloseTo(4834915, 9);
  });

  it('always contains the lot with at least the margin on every side', () => {
    fc.assert(
      fc.property(fc.double({ min: 632000, max: 633000, noNaN: true }), fc.double({ min: 4834000, max: 4836000, noNaN: true }), fc.double({ min: 1, max: 200, noNaN: true }), fc.double({ min: 1, max: 200, noNaN: true }), (e, n, w, h) => {
        const win = cropWindow(square(e, n, w, h));
        expect(win.minE).toBeLessThanOrEqual(e - 25 + 1e-6);
        expect(win.minN).toBeLessThanOrEqual(n - 25 + 1e-6);
        expect(win.minE + win.side).toBeGreaterThanOrEqual(e + w + 25 - 1e-6);
        expect(win.minN + win.side).toBeGreaterThanOrEqual(n + h + 25 - 1e-6);
      }),
    );
  });
});

describe('worldToCanvas', () => {
  it('puts the south-west corner at the bottom left and the north-east at the top right', () => {
    const win = { minE: 100, minN: 200, side: 50 };
    const m = worldToCanvas(win, 500);
    expect(applyAffine(m, 100, 200)).toEqual([0, 500]);
    expect(applyAffine(m, 150, 250)).toEqual([500, 0]);
  });
});

describe('tileToCanvas', () => {
  const tile = (tl: [number, number], tr: [number, number], bl: [number, number]): TileRef => ({
    sourceId: 's',
    image: 's.jpg',
    widthPx: 400,
    heightPx: 600,
    topLeft: tl,
    topRight: tr,
    bottomLeft: bl,
    attributionLine: 'a',
  });

  it('agrees with the corners: a tile pixel lands where its ground point lands', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -30, max: 30, noNaN: true }),
        fc.double({ min: 0, max: 400, noNaN: true }),
        fc.double({ min: 0, max: 600, noNaN: true }),
        (angleDeg, u, v) => {
          const a = (angleDeg * Math.PI) / 180;
          const w = 100;
          const h = 150;
          const tl: [number, number] = [632300, 4835100];
          const tr: [number, number] = [tl[0] + w * Math.cos(a), tl[1] + w * Math.sin(a)];
          const bl: [number, number] = [tl[0] + h * Math.sin(a), tl[1] - h * Math.cos(a)];
          const t = tile(tl, tr, bl);
          const win = { minE: 632320, minN: 4834990, side: 90 };
          const viaTile = applyAffine(tileToCanvas(t, win, 600), u, v);
          const [e, n] = tilePixelToWorld(t, u, v);
          const viaWorld = applyAffine(worldToCanvas(win, 600), e, n);
          expect(viaTile[0]).toBeCloseTo(viaWorld[0], 4);
          expect(viaTile[1]).toBeCloseTo(viaWorld[1], 4);
        },
      ),
    );
  });

  it('maps the tile corners to the canvas places of the corner coordinates', () => {
    const t = tile([0, 100], [40, 100], [0, 40]);
    const win = { minE: 0, minN: 0, side: 100 };
    const m = tileToCanvas(t, win, 100);
    expect(applyAffine(m, 0, 0)).toEqual([0, 0]);
    expect(applyAffine(m, 400, 0)).toEqual([40, 0]);
    expect(applyAffine(m, 0, 600)).toEqual([0, 60]);
  });
});

describe('ringsOf', () => {
  it('lists every ring of a MultiPolygon', () => {
    const a = square(0, 0, 1, 1).coordinates;
    const b = square(5, 5, 1, 1).coordinates;
    expect(ringsOf({ type: 'MultiPolygon', coordinates: [a, b] } as never)).toHaveLength(2);
    expect(ringsOf(square(0, 0, 1, 1) as never)).toHaveLength(1);
  });
});
