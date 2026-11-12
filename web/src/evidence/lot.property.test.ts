/**
 * Properties P7, P8 and P9 (spec 01 design "Correctness properties"; tests 7.2 to 7.4).
 *
 * Every oracle here is exact arithmetic on axis-aligned rectangles with integer-metre corners,
 * which shares no code with JSTS. A lot is a rectangle or an L, an L being two rectangles that
 * share an edge, so areas and distances are sums and minima over rectangles.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { lotRelation } from './lot';
import type { Lot, LotRelation } from './lot';
import { lShapedLotArb } from './testing/arbitraries';
import { E0, N0, rect } from './testing/fixtures';
import type { PolygonalGeometry } from './types.generated';

type Box = { x0: number; y0: number; x1: number; y1: number };

const ring = (b: Box) => rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
const polygon = (b: Box) => ({ type: 'Polygon', coordinates: [ring(b)] }) as PolygonalGeometry;

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

function boxDistance(a: Box, b: Box): number {
  const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
  const dy = Math.max(0, a.y0 - b.y1, b.y0 - a.y1);
  return Math.hypot(dx, dy);
}

/** A lot as the disjoint rectangles it is made of, plus the Lot handed to lotRelation. */
type LotCase = { parts: Box[]; lot: Lot['geometry']; kind: 'rectangle' | 'L' };

const rectangleLotArb: fc.Arbitrary<LotCase> = fc
  .tuple(
    fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 4, max: 160 }),
    fc.integer({ min: 4, max: 160 }),
  )
  .map(([e, n, w, h]) => {
    const b = { x0: E0 + e, y0: N0 + n, x1: E0 + e + w, y1: N0 + n + h };
    return { parts: [b], lot: polygon(b), kind: 'rectangle' as const };
  });

const lShapedCaseArb: fc.Arbitrary<LotCase> = lShapedLotArb.map((r) => {
  const p = (i: number) => r[i] as [number, number];
  // The ring runs (e, n), (e+w, n), (e+w, n+h-cutH), (e+w-cutW, n+h-cutH), (e+w-cutW, n+h), (e, n+h).
  const bottom: Box = { x0: p(0)[0], y0: p(0)[1], x1: p(1)[0], y1: p(2)[1] };
  const top: Box = { x0: p(0)[0], y0: p(2)[1], x1: p(4)[0], y1: p(4)[1] };
  return {
    parts: [bottom, top],
    lot: { type: 'Polygon', coordinates: [r] } as unknown as PolygonalGeometry,
    kind: 'L' as const,
  };
});

const lotCaseArb = fc.oneof(rectangleLotArb, lShapedCaseArb);

function bounds(lot: LotCase): Box {
  return {
    x0: Math.min(...lot.parts.map((p) => p.x0)),
    y0: Math.min(...lot.parts.map((p) => p.y0)),
    x1: Math.max(...lot.parts.map((p) => p.x1)),
    y1: Math.max(...lot.parts.map((p) => p.y1)),
  };
}

/** A feature rectangle placed relative to the lot: mostly over the lot's bounding box, sometimes
 * a little outside it, so that "on" and "near" both come up often. */
function featureNear(lot: LotCase): fc.Arbitrary<Box> {
  const b = bounds(lot);
  return fc
    .tuple(
      fc.integer({ min: 1, max: 50 }),
      fc.integer({ min: 1, max: 50 }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      fc.constantFrom(0, 0, 0, 25),
    )
    .map(([w, h, u, v, margin]) => {
      const x0 = Math.round(b.x0 - margin + u * (b.x1 - b.x0 + 2 * margin - w));
      const y0 = Math.round(b.y0 - margin + v * (b.y1 - b.y0 + 2 * margin - h));
      return { x0, y0, x1: x0 + w, y1: y0 + h };
    });
}

/** A lot, a feature placed near it, and the two position errors. */
const placedArb = lotCaseArb.chain((lot) =>
  fc.tuple(
    fc.constant(lot),
    featureNear(lot),
    fc.oneof(
      fc.integer({ min: 1, max: 30 }).map((t) => t / 10),
      fc.integer({ min: 1, max: 80 }).map((t) => t / 10),
    ),
    fc.constantFrom(0, 0.5, 2, 2, 2, 5),
  ),
);

/** A feature rectangle anywhere around the origin region (used where the lot is a rectangle). */
const featureBoxArb: fc.Arbitrary<Box> = fc
  .tuple(
    fc.integer({ min: -40, max: 220 }),
    fc.integer({ min: -40, max: 220 }),
    fc.integer({ min: 1, max: 50 }),
    fc.integer({ min: 1, max: 50 }),
  )
  .map(([e, n, w, h]) => ({ x0: E0 + e, y0: N0 + n, x1: E0 + e + w, y1: N0 + n + h }));

const featureErrorArb = fc.integer({ min: 1, max: 80 }).map((t) => t / 10); // 0.1 .. 8.0 m
const lotErrorArb = fc.constantFrom(0, 0.5, 2, 2, 2, 5);

function relationOf(f: Box, errorM: number, lot: LotCase, lotErrorM: number): LotRelation {
  return lotRelation(
    { geometry: polygon(f), positionErrorM: errorM },
    { geometry: lot.lot, positionErrorM: lotErrorM },
  );
}

describe('P7: "on this lot" survives any displacement within the error', () => {
  it('holds for rectangles and L-shaped lots (reflex corners included)', () => {
    let onCount = 0;
    fc.assert(
      fc.property(
        placedArb,
        fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.boolean(),
        ([lot, f, errorM, lotErrorM], angle, fraction, atBoundary) => {
          const result = relationOf(f, errorM, lot, lotErrorM);
          if (result.kind !== 'on') return;
          onCount += 1;
          const e = errorM + lotErrorM;
          const r = atBoundary ? e : e * fraction; // |t| <= e, the boundary included
          const t = { x: r * Math.cos(angle), y: r * Math.sin(angle) };
          const moved: Box = { x0: f.x0 + t.x, y0: f.y0 + t.y, x1: f.x1 + t.x, y1: f.y1 + t.y };
          const area = lot.parts.reduce((sum, part) => sum + overlapArea(moved, part), 0);
          expect(area).toBeGreaterThan(0);
        },
      ),
      { numRuns: 1000 },
    );
    // The property is not vacuous: plenty of generated cases came out "on".
    expect(onCount).toBeGreaterThan(100);
  });

  it('holds for the displacement that moves the feature straight toward the lot edge', () => {
    // A rectangle lot 100 x 100, e = 6.5 m: a feature sitting just inside the shrunk lot must stay
    // on the lot when pushed 6.5 m outward in each axis direction.
    const lot: LotCase = {
      parts: [{ x0: E0, y0: N0, x1: E0 + 100, y1: N0 + 100 }],
      lot: polygon({ x0: E0, y0: N0, x1: E0 + 100, y1: N0 + 100 }),
      kind: 'rectangle',
    };
    const f: Box = { x0: E0 + 7, y0: N0 + 40, x1: E0 + 20, y1: N0 + 50 };
    expect(relationOf(f, 4.5, lot, 2).kind).toBe('on');
    for (const t of [
      { x: -6.5, y: 0 },
      { x: 6.5, y: 0 },
      { x: 0, y: -6.5 },
      { x: 0, y: 6.5 },
    ]) {
      const moved: Box = { x0: f.x0 + t.x, y0: f.y0 + t.y, x1: f.x1 + t.x, y1: f.y1 + t.y };
      expect(overlapArea(moved, lot.parts[0] as Box)).toBeGreaterThan(0);
    }
  });
});

describe('P8: "on this lot" never appears when the overlap is smaller than the error', () => {
  it('a rectangle that misses the lot inset by e on every side is never "on"', () => {
    fc.assert(
      fc.property(
        rectangleLotArb,
        featureBoxArb,
        featureErrorArb,
        lotErrorArb,
        (lot, f, errorM, lotErrorM) => {
          const e = errorM + lotErrorM;
          const b = lot.parts[0] as Box;
          const inset: Box = { x0: b.x0 + e, y0: b.y0 + e, x1: b.x1 - e, y1: b.y1 - e };
          const insetIsEmpty = inset.x1 <= inset.x0 || inset.y1 <= inset.y0;
          const touches = !insetIsEmpty && overlapArea(f, inset) > 0;
          if (touches) return;
          expect(relationOf(f, errorM, lot, lotErrorM).kind).toBe('near');
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('a feature that does not intersect the lot at all is never "on", for any lot shape', () => {
    fc.assert(
      fc.property(placedArb, ([lot, f, errorM, lotErrorM]) => {
        if (lot.parts.some((part) => overlapArea(f, part) > 0 || boxDistance(f, part) === 0)) return;
        expect(relationOf(f, errorM, lot, lotErrorM).kind).toBe('near');
      }),
      { numRuns: 500 },
    );
  });

  it('a lot no wider than 2e has nothing on it, however the feature sits', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 30 }),
        featureErrorArb,
        lotErrorArb,
        (w, h, errorM, lotErrorM) => {
          const e = errorM + lotErrorM;
          fc.pre(w <= 2 * e || h <= 2 * e);
          const b: Box = { x0: E0, y0: N0, x1: E0 + w, y1: N0 + h };
          const lot: LotCase = { parts: [b], lot: polygon(b), kind: 'rectangle' };
          // The feature fills the whole lot, the best case for "on".
          expect(relationOf(b, errorM, lot, lotErrorM).kind).toBe('near');
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('P9: the "near" distance is an integer within one metre above distance plus error', () => {
  it('holds for rectangles and L-shaped lots', () => {
    let nearCount = 0;
    fc.assert(
      fc.property(placedArb, ([lot, f, errorM, lotErrorM]) => {
        const result = relationOf(f, errorM, lot, lotErrorM);
        if (result.kind !== 'near') return;
        nearCount += 1;
        const d = Math.min(...lot.parts.map((part) => boxDistance(f, part)));
        const e = errorM + lotErrorM;
        expect(Number.isInteger(result.withinM)).toBe(true);
        expect(result.withinM).toBeGreaterThanOrEqual(d + e - 1e-9);
        expect(result.withinM).toBeLessThan(d + e + 1 + 1e-9);
      }),
      { numRuns: 1000 },
    );
    expect(nearCount).toBeGreaterThan(100);
  });
});
