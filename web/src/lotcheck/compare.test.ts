import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeSheetTransform, pixelToWorld, worldToPixel } from '../block/sheetTransform';
import type { Pt, TileCorners } from '../block/sheetTransform';
import { compareModel, frameFor } from './compare';
import type { WorldPolygon } from './compare';

// The 1911 tile's own corners (data/tiles/fip_v3_1911_229.json): a tile turned about 17 degrees off north.
const CORNERS: TileCorners = {
  top_left: [632312.268258896, 4835087.454831159],
  top_right: [632596.4688413026, 4835177.21913871],
  bottom_right: [632699.789440777, 4834849.898286615],
  bottom_left: [632415.5888583706, 4834760.1339790635],
};
const TILE = { corners: CORNERS, widthPx: 3626, heightPx: 4096 };

const box = (e: number, n: number, w: number, h: number): WorldPolygon => [
  [
    [e, n],
    [e + w, n],
    [e + w, n + h],
    [e, n + h],
    [e, n],
  ],
];

const parsePath = (d: string): Pt[] =>
  [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])] as Pt);

describe('compareModel', () => {
  const lot = box(632450, 4835000, 8, 24);
  const t = makeSheetTransform(CORNERS, TILE.widthPx, TILE.heightPx);

  it('puts the lot corners where worldToPixel puts them', () => {
    const m = compareModel({ lot, tile: TILE, buildings: [], lots: [] });
    const got = parsePath(m.lotPath);
    const want = lot[0]!.map((p) => worldToPixel(t, p));
    expect(got).toHaveLength(want.length);
    got.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(want[i]![0], 0);
      expect(p[1]).toBeCloseTo(want[i]![1], 0);
      expect(Math.abs(p[0] - want[i]![0])).toBeLessThan(0.06);
      expect(Math.abs(p[1] - want[i]![1])).toBeLessThan(0.06);
    });
  });

  it('frames the lot plus 15 m on each side, at the asked aspect', () => {
    // A lot in the middle of the tile, so no edge is near. The margin is measured on the sheet, along its own axes.
    const mid = box(632500, 4834960, 8, 24);
    const pxPerM = TILE.widthPx / Math.hypot(CORNERS.top_right[0] - CORNERS.top_left[0], CORNERS.top_right[1] - CORNERS.top_left[1]);
    const lotPx = (mid[0] as readonly Pt[]).map((p) => worldToPixel(t, p));
    const xs = lotPx.map((p) => p[0]);
    const ys = lotPx.map((p) => p[1]);
    for (const aspect of [4 / 3, 1]) {
      const m = compareModel({ lot: mid, tile: TILE, buildings: [], lots: [], aspect });
      expect(m.viewBox.width / m.viewBox.height).toBeCloseTo(aspect, 2);
      expect(m.viewBox.x).toBeLessThanOrEqual(Math.min(...xs) - 15 * pxPerM + 0.2);
      expect(m.viewBox.x + m.viewBox.width).toBeGreaterThanOrEqual(Math.max(...xs) + 15 * pxPerM - 0.2);
      expect(m.viewBox.y).toBeLessThanOrEqual(Math.min(...ys) - 15 * pxPerM + 0.2);
      expect(m.viewBox.y + m.viewBox.height).toBeGreaterThanOrEqual(Math.max(...ys) + 15 * pxPerM - 0.2);
    }
  });

  it('keeps the lot centred at a sheet edge and reports the part of the frame the sheet does not cover', () => {
    const [ee, nn] = pixelToWorld(t, [150, 2000]); // 150 px from the tile's left edge
    const edge = box(ee, nn, 10, 20);
    const m = compareModel({ lot: edge, tile: TILE, buildings: [], lots: [], aspect: 4 / 3 });
    const xs = parsePath(m.lotPath).map((p) => p[0]);
    const centre = (Math.min(...xs) + Math.max(...xs)) / 2;
    expect((centre - m.viewBox.x) / m.viewBox.width).toBeCloseTo(0.5, 1);
    expect(m.uncovered).not.toBeNull();
    expect(m.uncovered?.atX).toBeLessThan(50);
    // Mid-tile there is nothing to report.
    const mid = compareModel({ lot: box(632500, 4834960, 8, 24), tile: TILE, buildings: [], lots: [] });
    expect(mid.uncovered).toBeNull();
    expect(mid.mapAreaPath).toBeNull();
  });

  it('tests the frame against the map area when the sidecar has one', () => {
    // A map area that is the left half of the tile only.
    const topMid = pixelToWorld(t, [1813, 0]);
    const botMid = pixelToWorld(t, [1813, 4096]);
    const bl = CORNERS.bottom_left as Pt;
    const tl = CORNERS.top_left as Pt;
    const left: WorldPolygon = [[tl, topMid, botMid, bl, tl]];
    const [ee, nn] = pixelToWorld(t, [1813, 2000]);
    const m = compareModel({ lot: box(ee, nn, 10, 20), tile: { ...TILE, mapArea: left }, buildings: [], lots: [] });
    expect(m.mapAreaPath).toContain('M');
    expect(m.uncovered?.atX).toBeGreaterThan(50);
    expect(m.uncovered?.share).toBeGreaterThan(0.3);
    expect(m.uncovered?.share).toBeLessThan(0.7);
  });

  it("draws only the buildings and lot lines that meet the frame, with the same transform", () => {
    const near = box(632460, 4835010, 10, 10);
    const far = box(632460 + 2000, 4835010, 10, 10);
    const m = compareModel({ lot, tile: TILE, buildings: [near, far], lots: [lot, far] });
    expect(m.presentPaths).toHaveLength(1);
    expect(m.lotLinePaths).toHaveLength(1);
    expect(m.lotLinePaths[0]).toBe(m.lotPath);
  });

  it('is a pure function of its inputs: the same input gives the same model', () => {
    const a = compareModel({ lot, tile: TILE, buildings: [box(632460, 4835010, 10, 10)], lots: [lot] });
    const b = compareModel({ lot, tile: TILE, buildings: [box(632460, 4835010, 10, 10)], lots: [lot] });
    expect(b).toEqual(a);
  });

  it('P5: for any lot on the tile and any aspect, the frame holds the margin box and the outline path is its own', () => {
    fc.assert(
      fc.property(
        fc.record({ e: fc.integer({ min: 0, max: 200 }), n: fc.integer({ min: 0, max: 200 }), w: fc.integer({ min: 4, max: 40 }), h: fc.integer({ min: 4, max: 60 }) }),
        fc.constantFrom(1, 4 / 3),
        fc.integer({ min: 0, max: 100 }),
        (r, aspect, dividerPercent) => {
          const l = box(632400 + r.e, 4834900 + r.n, r.w, r.h);
          const m = compareModel({ lot: l, tile: TILE, buildings: [], lots: [], aspect });
          // The divider is not an input of the model: any divider position leaves the model equal to a fresh build.
          void dividerPercent;
          expect(compareModel({ lot: l, tile: TILE, buildings: [], lots: [], aspect })).toEqual(m);
          const f = frameFor(l, TILE, 15, aspect);
          expect(f.width / f.height).toBeCloseTo(aspect, 6);
          for (const p of parsePath(m.lotPath)) {
            expect(p[0]).toBeGreaterThan(m.viewBox.x);
            expect(p[0]).toBeLessThan(m.viewBox.x + m.viewBox.width);
            expect(p[1]).toBeGreaterThan(m.viewBox.y);
            expect(p[1]).toBeLessThan(m.viewBox.y + m.viewBox.height);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
