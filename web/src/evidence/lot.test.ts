import { describe, expect, it } from 'vitest';
import { LotInputError, QUADRANT_SEGMENTS, bufferScale, lotRelation } from './lot';
import type { Lot, LotFeature } from './lot';
import { E0, N0, rect } from './testing/fixtures';
import type { FeatureGeometry } from './types.generated';

const poly = (e: number, n: number, w: number, h: number): FeatureGeometry =>
  ({ type: 'Polygon', coordinates: [rect(E0 + e, N0 + n, w, h)] }) as FeatureGeometry;
const line = (...pts: [number, number][]): FeatureGeometry =>
  ({ type: 'LineString', coordinates: pts.map(([e, n]) => [E0 + e, N0 + n]) }) as FeatureGeometry;
const lotOf = (g: FeatureGeometry, positionErrorM = 2): Lot => ({
  geometry: g as Lot['geometry'],
  positionErrorM,
});
const feature = (geometry: FeatureGeometry, positionErrorM = 4.5): LotFeature => ({ geometry, positionErrorM });

// A 100 m x 100 m lot with the City's 2.0 m error and a feature error of 4.5 m gives e = 6.5 m.
const LOT = lotOf(poly(0, 0, 100, 100));

describe('bufferScale (requirement 13.5)', () => {
  it('is 1 / cos(pi / (4 q)) for q = 8 quadrant segments, a little above 1', () => {
    expect(QUADRANT_SEGMENTS).toBe(8);
    expect(bufferScale()).toBeCloseTo(1 / Math.cos(Math.PI / 32), 12);
    expect(bufferScale()).toBeGreaterThan(1);
    expect(bufferScale()).toBeLessThan(1.005);
    expect(bufferScale(16)).toBeLessThan(bufferScale(8));
  });
});

describe('lotRelation: polygons', () => {
  it('a feature well inside the lot is on this lot', () => {
    expect(lotRelation(feature(poly(40, 40, 10, 10)), LOT)).toEqual({ kind: 'on' });
  });

  it('a feature inside the lot but within e of its edge is near, by distance 0 plus e', () => {
    // The lot shrunk by 6.5 m starts at 6.5 m from the edge; this feature ends at 6 m.
    expect(lotRelation(feature(poly(0, 40, 6, 10)), LOT)).toEqual({ kind: 'near', withinM: 7 });
  });

  it('a feature reaching past the shrunk edge by a clear margin is on this lot', () => {
    expect(lotRelation(feature(poly(0, 40, 8, 10)), LOT)).toEqual({ kind: 'on' });
  });

  it('a feature outside the lot is near, within ceil(distance + e) metres', () => {
    expect(lotRelation(feature(poly(120, 40, 10, 10)), LOT)).toEqual({ kind: 'near', withinM: 27 });
    // 20 m + 6.5 m = 26.5 m, rounded up to the next whole metre.
  });

  it('a whole-metre sum is not pushed up a metre', () => {
    // distance 3.5 + e (1.0 + 2.0 = 3.0 would be exact) -> use e = 6.5 and distance 3.5 -> 10.
    expect(lotRelation(feature(poly(103.5, 40, 10, 10)), LOT)).toEqual({ kind: 'near', withinM: 10 });
  });

  it('a feature touching the lot from outside is near, within ceil(e)', () => {
    expect(lotRelation(feature(poly(100, 40, 10, 10)), LOT)).toEqual({ kind: 'near', withinM: 7 });
  });

  it('uses the lot error as well as the feature error', () => {
    const wideEdge = lotOf(poly(0, 0, 100, 100), 10); // e = 14.5 m
    expect(lotRelation(feature(poly(0, 40, 10, 10)), wideEdge)).toEqual({ kind: 'near', withinM: 15 });
    expect(lotRelation(feature(poly(0, 40, 10, 10)), lotOf(poly(0, 0, 100, 100), 0))).toEqual({ kind: 'on' });
  });

  it('nothing is on a lot that is too small for its error (requirement 13.4)', () => {
    const tiny = lotOf(poly(0, 0, 10, 10)); // 10 m wide, e = 6.5 m, so the shrunk lot is empty
    expect(lotRelation(feature(poly(2, 2, 6, 6)), tiny)).toEqual({ kind: 'near', withinM: 7 });
    expect(lotRelation(feature(poly(0, 0, 10, 10)), tiny)).toEqual({ kind: 'near', withinM: 7 });
  });

  it('a feature larger than the lot is on it when the lot has room left after shrinking', () => {
    expect(lotRelation(feature(poly(-20, -20, 140, 140)), LOT)).toEqual({ kind: 'on' });
  });

  it('works on a MultiPolygon lot', () => {
    const two: Lot = {
      geometry: {
        type: 'MultiPolygon',
        coordinates: [[rect(E0, N0, 50, 50)], [rect(E0 + 100, N0, 50, 50)]],
      },
      positionErrorM: 2,
    };
    expect(lotRelation(feature(poly(120, 20, 5, 5)), two)).toEqual({ kind: 'on' });
    expect(lotRelation(feature(poly(70, 20, 5, 5)), two)).toEqual({ kind: 'near', withinM: 27 });
    // 20 m from the nearer part, plus e = 6.5 m, rounded up.
  });

  it('honours a hole in the lot', () => {
    const ring = (x: number, y: number, w: number, h: number) => rect(E0 + x, N0 + y, w, h);
    const holed: Lot = {
      geometry: { type: 'Polygon', coordinates: [ring(0, 0, 200, 200), ring(80, 80, 40, 40)] },
      positionErrorM: 2,
    };
    // The hole is 40 m wide; the feature fills its middle, 10 m from the lot on every side.
    expect(lotRelation(feature(poly(90, 90, 20, 20)), holed)).toEqual({ kind: 'near', withinM: 17 });
    expect(lotRelation(feature(poly(20, 20, 10, 10)), holed)).toEqual({ kind: 'on' });
  });

  it('an L-shaped lot shrinks around its reflex corner by a full radius', () => {
    // L: 100 x 100 with the top-right 50 x 50 cut away. The reflex corner is (50, 50).
    const L: Lot = {
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [E0, N0], [E0 + 100, N0], [E0 + 100, N0 + 50], [E0 + 50, N0 + 50], [E0 + 50, N0 + 100],
          [E0, N0 + 100], [E0, N0],
        ]],
      },
      positionErrorM: 2,
    };
    // The feature 46..48 m lies wholly within 5.7 m of the reflex corner, so inside the disc of
    // radius e = 6.5 m that the shrunk lot loses around it: near, by distance 0 plus e.
    expect(lotRelation(feature(poly(46, 46, 2, 2)), L)).toEqual({ kind: 'near', withinM: 7 });
    // Its far corner at 41..44 m is 8.5 m from the corner, outside that disc, so this one is on.
    expect(lotRelation(feature(poly(41, 41, 3, 3)), L)).toEqual({ kind: 'on' });
    // 20 m from the corner is comfortably on the lot.
    expect(lotRelation(feature(poly(20, 20, 3, 3)), L)).toEqual({ kind: 'on' });
  });

  it('works with real-sized UTM coordinates and fractional metres', () => {
    const e = 632512.317;
    const n = 4835104.882;
    const g = (x: number, y: number, w: number, h: number): FeatureGeometry => ({
      type: 'Polygon',
      coordinates: [rect(x, y, w, h)],
    });
    const lot = lotOf(g(e, n, 24.6, 31.4));
    expect(lotRelation(feature(g(e + 9.1, n + 11.3, 3.2, 4.4), 1.0), lot)).toEqual({ kind: 'on' });
    expect(lotRelation(feature(g(e + 40, n + 11.3, 3.2, 4.4), 1.0), lot)).toEqual({
      kind: 'near',
      withinM: 19, // 15.4 m gap + e (1.0 + 2.0) = 18.4
    });
  });
});

describe('lotRelation: lines (water features)', () => {
  it('a line well inside the lot is on this lot', () => {
    expect(lotRelation(feature(line([20, 50], [80, 50])), LOT)).toEqual({ kind: 'on' });
  });

  it('a line along the edge of the lot is near', () => {
    expect(lotRelation(feature(line([0, 10], [0, 90])), LOT)).toEqual({ kind: 'near', withinM: 7 });
  });

  it('a line that crosses into the shrunk lot is on this lot', () => {
    expect(lotRelation(feature(line([-30, 50], [50, 50])), LOT)).toEqual({ kind: 'on' });
  });

  it('a line that only touches the shrunk lot at a point is near', () => {
    // It ends before the shrunk edge.
    expect(lotRelation(feature(line([-30, 50], [5, 50])), LOT)).toEqual({ kind: 'near', withinM: 7 });
  });

  it('a MultiLineString counts its total length inside', () => {
    const g: FeatureGeometry = {
      type: 'MultiLineString',
      coordinates: [
        [[E0 - 40, N0 + 20], [E0 - 20, N0 + 20]],
        [[E0 + 40, N0 + 40], [E0 + 60, N0 + 40]],
      ],
    };
    expect(lotRelation(feature(g), LOT)).toEqual({ kind: 'on' });
  });
});

describe('lotRelation: inputs that cannot be used', () => {
  it('rejects a feature error that is not positive', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => lotRelation(feature(poly(40, 40, 10, 10), bad), LOT)).toThrowError(LotInputError);
    }
  });

  it('rejects a lot error that is negative or not a number', () => {
    for (const bad of [-0.1, Number.NaN]) {
      expect(() => lotRelation(feature(poly(40, 40, 10, 10)), lotOf(poly(0, 0, 100, 100), bad))).toThrowError(
        LotInputError,
      );
    }
  });

  it('rejects an invalid lot (a bow tie)', () => {
    const bowTie = lotOf({
      type: 'Polygon',
      coordinates: [[[E0, N0], [E0 + 100, N0 + 100], [E0 + 100, N0], [E0, N0 + 100], [E0, N0]]],
    });
    expect(() => lotRelation(feature(poly(40, 40, 10, 10)), bowTie)).toThrowError(/not valid/);
  });

  it('rejects an invalid feature geometry', () => {
    const bowTie: FeatureGeometry = {
      type: 'Polygon',
      coordinates: [[[E0, N0], [E0 + 10, N0 + 10], [E0 + 10, N0], [E0, N0 + 10], [E0, N0]]],
    };
    expect(() => lotRelation(feature(bowTie), LOT)).toThrowError(LotInputError);
  });
});
