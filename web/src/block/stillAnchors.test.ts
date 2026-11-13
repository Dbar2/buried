import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { anchorInViewport, coverFit, STILL_SIZES, stillKindFor, visibleImageRect } from './stillAnchors';

const size = fc.record({ w: fc.integer({ min: 200, max: 4000 }), h: fc.integer({ min: 200, max: 4000 }) });

describe('stillAnchors', () => {
  it('fits a wide image to a wide box without an offset', () => {
    expect(coverFit({ w: 1600, h: 1000 }, { w: 800, h: 500 })).toEqual({ scale: 0.5, offsetX: 0, offsetY: 0 });
  });

  it('centres the crop: a taller box cuts the sides evenly', () => {
    const fit = coverFit({ w: 1600, h: 1000 }, { w: 500, h: 500 });
    expect(fit.scale).toBe(0.5);
    expect(fit.offsetX).toBe(-150);
    expect(anchorInViewport({ id: 'a', x: 800, y: 500 }, { w: 1600, h: 1000 }, { w: 500, h: 500 })).toEqual({ id: 'a', x: 250, y: 250, onScreen: true });
    expect(anchorInViewport({ id: 'b', x: 10, y: 500 }, { w: 1600, h: 1000 }, { w: 500, h: 500 }).onScreen).toBe(false);
  });

  it('picks the Still nearest the viewport shape', () => {
    expect(stillKindFor({ w: 1440, h: 900 })).toBe('wide');
    expect(stillKindFor({ w: 390, h: 480 })).toBe('tall');
    expect(stillKindFor({ w: 390, h: 844 })).toBe('tall');
    expect(stillKindFor({ w: 1024, h: 768 })).toBe('wide');
    expect(stillKindFor({ w: 0, h: 0 })).toBe('wide');
    expect(STILL_SIZES.tall.h).toBeGreaterThan(STILL_SIZES.tall.w);
  });

  it('property: an anchor inside the visible part of the image lands inside the viewport', () => {
    fc.assert(
      fc.property(size, size, fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true }), (image, box, u, v) => {
        const visible = visibleImageRect(image, box);
        const anchor = { id: 'a', x: visible.x + u * visible.w, y: visible.y + v * visible.h };
        const placed = anchorInViewport(anchor, image, box);
        const slack = 1e-6;
        expect(placed.x).toBeGreaterThanOrEqual(-slack);
        expect(placed.x).toBeLessThanOrEqual(box.w + slack);
        expect(placed.y).toBeGreaterThanOrEqual(-slack);
        expect(placed.y).toBeLessThanOrEqual(box.h + slack);
        if (u > 0.001 && u < 0.999 && v > 0.001 && v < 0.999) expect(placed.onScreen).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  it('property: an anchor outside the visible part is off screen, and the visible part is inside the image', () => {
    fc.assert(
      fc.property(size, size, (image, box) => {
        const visible = visibleImageRect(image, box);
        expect(visible.x).toBeGreaterThanOrEqual(0);
        expect(visible.y).toBeGreaterThanOrEqual(0);
        expect(visible.x + visible.w).toBeLessThanOrEqual(image.w + 1e-6);
        expect(visible.y + visible.h).toBeLessThanOrEqual(image.h + 1e-6);
        // `cover` fills the box: the visible part spans the whole of one image axis.
        expect(visible.w >= image.w - 1e-6 || visible.h >= image.h - 1e-6).toBe(true);
        const left = visible.x - 1;
        if (left >= 0) expect(anchorInViewport({ id: 'a', x: left, y: image.h / 2 }, image, box).onScreen).toBe(false);
      }),
    );
  });
});
