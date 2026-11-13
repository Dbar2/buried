import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  fitView,
  intersectRects,
  plateToTile,
  pointInPolygon,
  polygonCentroid,
  rectFromDrag,
  toPlate,
  toScreen,
  visibleRect,
  zoomAt,
} from './plateView';

const viewArb = fc.record({ k: fc.double({ min: 0.05, max: 6, noNaN: true }), tx: fc.double({ min: -5000, max: 5000, noNaN: true }), ty: fc.double({ min: -5000, max: 5000, noNaN: true }) });
const pointArb = fc.record({ x: fc.double({ min: -9000, max: 9000, noNaN: true }), y: fc.double({ min: -9000, max: 9000, noNaN: true }) });

describe('view maths', () => {
  it('maps a point to the screen and back', () => {
    fc.assert(
      fc.property(viewArb, pointArb, (view, p) => {
        const back = toPlate(view, toScreen(view, p));
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }),
    );
  });

  it('zooming keeps the plate point under the pointer where it is', () => {
    fc.assert(
      fc.property(viewArb, pointArb, fc.double({ min: 0.5, max: 2, noNaN: true }), (view, at, factor) => {
        const before = toPlate(view, at);
        const after = toPlate(zoomAt(view, at, factor), at);
        expect(after.x).toBeCloseTo(before.x, 5);
        expect(after.y).toBeCloseTo(before.y, 5);
      }),
    );
  });

  it('fits a rectangle inside the viewport, centred', () => {
    const rect = { x: 435, y: 800, width: 5132, height: 5798 };
    const viewport = { width: 900, height: 700 };
    const view = fitView(viewport, rect, 20);
    const corner = toScreen(view, { x: rect.x, y: rect.y });
    const far = toScreen(view, { x: rect.x + rect.width, y: rect.y + rect.height });
    expect(corner.x).toBeGreaterThanOrEqual(19.99);
    expect(corner.y).toBeGreaterThanOrEqual(19.99);
    expect(far.x).toBeLessThanOrEqual(880.01);
    expect(far.y).toBeLessThanOrEqual(680.01);
    expect((corner.x + far.x) / 2).toBeCloseTo(450, 6);
    expect((corner.y + far.y) / 2).toBeCloseTo(350, 6);
  });

  it('reports the visible rectangle', () => {
    const view = { k: 0.5, tx: 100, ty: 50 };
    expect(visibleRect(view, { width: 400, height: 300 })).toEqual({ x: -200, y: -100, width: 800, height: 600 });
  });
});

describe('rectangles', () => {
  it('intersects to whole pixels or nothing', () => {
    expect(intersectRects({ x: 0, y: 0, width: 10, height: 10 }, { x: 5.4, y: 2, width: 20, height: 3 })).toEqual({ x: 6, y: 2, width: 4, height: 3 });
    expect(intersectRects({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 5, height: 5 })).toBeNull();
  });

  it('a drag in any direction gives the same rectangle, inside the allowed area', () => {
    const within = { x: 100, y: 100, width: 1000, height: 1000 };
    const a = { x: 50, y: 300 };
    const b = { x: 400, y: 200 };
    expect(rectFromDrag(a, b, within)).toEqual(rectFromDrag(b, a, within));
    expect(rectFromDrag(a, b, within)).toEqual({ x: 100, y: 200, width: 300, height: 100 });
    expect(rectFromDrag({ x: 0, y: 0 }, { x: 50, y: 50 }, within)).toBeNull();
  });
});

describe('plate pixels and the tile', () => {
  it('puts the crop origin at the tile origin and its far corner at the tile size', () => {
    const crop = { x: 435, y: 800, width: 5132, height: 5798 };
    const tile = { width: 3626, height: 4096 };
    expect(plateToTile({ x: 435, y: 800 }, crop, tile)).toEqual({ x: 0, y: 0 });
    const far = plateToTile({ x: 435 + 5132, y: 800 + 5798 }, crop, tile);
    expect(far.x).toBeCloseTo(3626, 9);
    expect(far.y).toBeCloseTo(4096, 9);
  });
});

describe('polygons', () => {
  const square: Array<[number, number]> = [[0, 0], [10, 0], [10, 10], [0, 10]];
  it('finds the inside of a polygon', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });
  it('finds the centroid', () => {
    expect(polygonCentroid(square)).toEqual({ x: 5, y: 5 });
    expect(polygonCentroid([[0, 0], [6, 0], [0, 6]])).toEqual({ x: 2, y: 2 });
  });
});
