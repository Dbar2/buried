import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_REGION_SIDE_M, defaultRegion, drawStep, regionProblem } from './region';

describe('the extraction region', () => {
  const crop = { x: 435, y: 800, width: 5132, height: 5798 };
  const pixelSizeM = 0.05919982119286117;

  it('refuses a plate-sized region, which is over 300 m, and says how big it is', () => {
    expect(regionProblem(crop, pixelSizeM)).toMatch(/343 m on a side.*300 m/);
  });

  it('the default region is inside the crop, centred, and under the limit', () => {
    const region = defaultRegion(crop, pixelSizeM);
    expect(regionProblem(region, pixelSizeM)).toBeNull();
    expect(region.x).toBeGreaterThanOrEqual(crop.x);
    expect(region.y).toBeGreaterThanOrEqual(crop.y);
    expect(region.x + region.width).toBeLessThanOrEqual(crop.x + crop.width);
    expect(region.y + region.height).toBeLessThanOrEqual(crop.y + crop.height);
    expect(Math.abs(region.x + region.width / 2 - (crop.x + crop.width / 2))).toBeLessThanOrEqual(1);
  });

  it('property: a default region is always inside the crop and never over the limit', () => {
    fc.assert(
      fc.property(
        fc.record({ x: fc.nat(2000), y: fc.nat(2000), width: fc.integer({ min: 10, max: 9000 }), height: fc.integer({ min: 10, max: 9000 }) }),
        fc.double({ min: 0.02, max: 0.3, noNaN: true }),
        (c, size) => {
          const r = defaultRegion(c, size);
          expect(r.x).toBeGreaterThanOrEqual(c.x);
          expect(r.y).toBeGreaterThanOrEqual(c.y);
          expect(r.x + r.width).toBeLessThanOrEqual(c.x + c.width);
          expect(r.y + r.height).toBeLessThanOrEqual(c.y + c.height);
          expect(Math.max(r.width, r.height) * size).toBeLessThanOrEqual(MAX_REGION_SIDE_M);
        },
      ),
    );
  });

  it('draws on in at most 2 seconds at 40 ms a tick', () => {
    for (const n of [1, 49, 50, 51, 170, 400, 5000]) {
      const ticks = Math.ceil(n / drawStep(n));
      expect(ticks * 40).toBeLessThanOrEqual(2000);
    }
  });
});
