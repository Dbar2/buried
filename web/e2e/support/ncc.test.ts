import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bestOffset, mean, ncc, nccMasked, stdDev, window } from './ncc';
import type { Image } from './ncc';

/** A smooth-ish deterministic texture, not periodic inside the sizes used here. */
function texture(width: number, height: number, seed = 1): Image {
  const data = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = 128 + 60 * Math.sin(x * 0.37 + seed) * Math.cos(y * 0.23 + seed * 2) + 40 * Math.sin((x + 2 * y) * 0.11 + seed);
    }
  }
  return { width, height, data };
}

describe('ncc', () => {
  it('is 1 for identical arrays and -1 for an inverted copy', () => {
    const a = [1, 5, 2, 9, 4];
    expect(ncc(a, a)).toBeCloseTo(1, 12);
    expect(ncc(a, a.map((v) => 10 - v))).toBeCloseTo(-1, 12);
  });

  it('is unchanged by a gain and an offset in brightness (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 255, noNaN: true }), { minLength: 8, maxLength: 40 }),
        fc.double({ min: 0.1, max: 4, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        (a, gain, offset) => {
          if (stdDev(a) < 1e-3) return true; // a flat array has no correlation to speak of
          const b = a.map((v) => gain * v + offset);
          return Math.abs(ncc(a, b) - 1) < 1e-9;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('is 0 for a flat array, never NaN', () => {
    expect(ncc([3, 3, 3, 3], [1, 2, 3, 4])).toBe(0);
    expect(ncc([1, 2, 3, 4], [7, 7, 7, 7])).toBe(0);
  });

  it('needs equal lengths', () => {
    expect(() => ncc([1, 2], [1, 2, 3])).toThrow();
  });
});

describe('mean and stdDev', () => {
  it('compute the population statistics', () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 12);
  });
});

describe('bestOffset', () => {
  const n = 32;
  const screen = texture(120, 120);
  const x0 = 40;
  const y0 = 44;
  const expected = window(screen, x0, y0, n);

  it('finds a peak of 1 at offset 0, 0 when the patch is where it should be', () => {
    const peak = bestOffset(expected, screen, x0, y0, n, 8);
    expect(peak.dx).toBe(0);
    expect(peak.dy).toBe(0);
    expect(peak.value).toBeCloseTo(1, 9);
    expect(peak.atZero).toBeCloseTo(1, 9);
  });

  it('finds the offset when the screenshot is shifted (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: -8, max: 8 }), fc.integer({ min: -8, max: 8 }), (sx, sy) => {
        // The content in the screenshot sits sx, sy pixels away from where the expected patch is cut.
        const shifted = window(screen, x0 + sx, y0 + sy, n);
        const peak = bestOffset(shifted, screen, x0, y0, n, 8);
        return peak.dx === sx && peak.dy === sy && peak.value > 0.999999;
      }),
      { numRuns: 60 },
    );
  });

  it('survives a change of gain and offset and mild noise with a high peak at zero', () => {
    const noisy: Image = {
      width: screen.width,
      height: screen.height,
      data: Array.from(screen.data as Float64Array, (v, i) => 0.6 * v + 30 + 2 * Math.sin(i * 12.9898)),
    };
    const peak = bestOffset(expected, noisy, x0, y0, n, 8);
    expect([peak.dx, peak.dy]).toEqual([0, 0]);
    expect(peak.value).toBeGreaterThan(0.99);
  });

  it('gives a low peak when the screenshot shows something else', () => {
    // Deterministic pseudo-random noise: no offset of it resembles the smooth texture.
    let state = 12345;
    const noise = new Float64Array(120 * 120).map(() => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    });
    const other: Image = { width: 120, height: 120, data: noise };
    expect(bestOffset(expected, other, x0, y0, n, 8).value).toBeLessThan(0.3);
  });

  it('refuses a window outside the image', () => {
    expect(() => bestOffset(expected, screen, 2, 2, n, 8)).toThrow();
  });
});

describe('nccMasked', () => {
  it('ignores the entries that are not kept', () => {
    const a = [1, 2, 3, 4, 5, 6];
    const b = [2, 4, 6, 8, 100, -50]; // the last two disagree completely
    expect(nccMasked(a, b, [true, true, true, true, false, false])).toBeCloseTo(1, 12);
    expect(nccMasked(a, b, [true, true, true, true, true, true])).toBeLessThan(0.5);
  });

  it('is 0 with fewer than two kept entries or with no variation', () => {
    expect(nccMasked([1, 2], [3, 4], [true, false])).toBe(0);
    expect(nccMasked([1, 1, 1], [1, 2, 3], [true, true, true])).toBe(0);
  });

  it('refuses arrays of different lengths', () => {
    expect(() => nccMasked([1], [1, 2], [true])).toThrow();
  });
});
