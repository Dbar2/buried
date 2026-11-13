import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeSheetTransform, pixelToWorld, ringCentrePx, ringsToPath, worldToPixel } from './sheetTransform';
import type { Pt, TileCorners } from './sheetTransform';

/** A tile's corners from a rotated, scaled placement of a width by height pixel image. */
function cornersOf(e: number, n: number, size: number, angle: number, w: number, h: number): TileCorners {
  const right: Pt = [Math.cos(angle) * w * size, Math.sin(angle) * w * size];
  const down: Pt = [Math.sin(angle) * h * size, -Math.cos(angle) * h * size];
  return {
    top_left: [e, n],
    top_right: [e + right[0], n + right[1]],
    bottom_right: [e + right[0] + down[0], n + right[1] + down[1]],
    bottom_left: [e + down[0], n + down[1]],
  };
}

const placement = fc.record({
  e: fc.double({ min: 500_000, max: 700_000, noNaN: true }),
  n: fc.double({ min: 4_700_000, max: 4_900_000, noNaN: true }),
  size: fc.double({ min: 0.02, max: 0.5, noNaN: true }),
  angle: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
  w: fc.integer({ min: 100, max: 6000 }),
  h: fc.integer({ min: 100, max: 6000 }),
});

describe('sheetTransform', () => {
  // P6
  it('P6: round-trips the sidecar corners within 0.5 px', () => {
    fc.assert(
      fc.property(placement, (p) => {
        const corners = cornersOf(p.e, p.n, p.size, p.angle, p.w, p.h);
        const t = makeSheetTransform(corners, p.w, p.h);
        const expected: [Pt, Pt][] = [
          [corners.top_left, [0, 0]],
          [corners.top_right, [p.w, 0]],
          [corners.bottom_right, [p.w, p.h]],
          [corners.bottom_left, [0, p.h]],
        ];
        for (const [world, pixel] of expected) {
          const got = worldToPixel(t, world);
          expect(Math.abs(got[0] - pixel[0])).toBeLessThanOrEqual(0.5);
          expect(Math.abs(got[1] - pixel[1])).toBeLessThanOrEqual(0.5);
          const back = pixelToWorld(t, pixel);
          expect(Math.hypot(back[0] - world[0], back[1] - world[1])).toBeLessThanOrEqual(0.5 * p.size);
        }
      }),
      { numRuns: 500 },
    );
  });

  it('P6: holds for the committed 1911 sheet 229 sidecar, bottom-right corner included', () => {
    const sidecar = JSON.parse(readFileSync(fileURLToPath(new URL('../../../data/tiles/fip_v3_1911_229.json', import.meta.url)), 'utf8'));
    const t = makeSheetTransform(sidecar.corners, sidecar.width_px, sidecar.height_px);
    const pairs: [Pt, Pt][] = [
      [sidecar.corners.top_left, [0, 0]],
      [sidecar.corners.top_right, [sidecar.width_px, 0]],
      [sidecar.corners.bottom_right, [sidecar.width_px, sidecar.height_px]],
      [sidecar.corners.bottom_left, [0, sidecar.height_px]],
    ];
    for (const [world, pixel] of pairs) {
      const got = worldToPixel(t, world);
      expect(Math.abs(got[0] - pixel[0])).toBeLessThanOrEqual(0.5);
      expect(Math.abs(got[1] - pixel[1])).toBeLessThanOrEqual(0.5);
    }
  });

  it('writes a closed path in tile pixels', () => {
    const t = makeSheetTransform(cornersOf(600_000, 4_800_000, 0.1, 0, 1000, 800), 1000, 800);
    const ring: Pt[] = [
      [600_010, 4_799_990],
      [600_020, 4_799_990],
      [600_020, 4_799_980],
    ];
    expect(ringsToPath(t, [ring])).toBe('M100.0 100.0L200.0 100.0L200.0 200.0Z');
    expect(ringsToPath(t, [])).toBe('');
    const centre = ringCentrePx(t, ring)!;
    expect(centre[0]).toBeCloseTo(150, 6);
    expect(centre[1]).toBeCloseTo(150, 6);
    expect(ringCentrePx(t, [])).toBeNull();
  });
});
