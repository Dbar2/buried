/**
 * Normalised cross-correlation for the drape placement check (spec 03 task 17.4, design.md "Drape
 * placement check"). Pure, no browser and no files, so vitest can test it (ncc.test.ts).
 *
 * NCC is unchanged by a gain and an offset in brightness, so the fog fade, the drape opacity and the
 * blend with the ground do not affect it as long as they are near constant over the patch.
 */

/** Rec. 709 luma of an sRGB colour, 0 to 255. */
export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function mean(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i] as number;
  return sum / values.length;
}

/** The population standard deviation. */
export function stdDev(values: ArrayLike<number>): number {
  const m = mean(values);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const d = (values[i] as number) - m;
    sum += d * d;
  }
  return Math.sqrt(sum / values.length);
}

/** The correlation coefficient of two equal-length arrays, or 0 when either has no variation. */
export function ncc(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error('ncc needs arrays of equal length');
  const ma = mean(a);
  const mb = mean(b);
  let cross = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++) {
    const da = (a[i] as number) - ma;
    const db = (b[i] as number) - mb;
    cross += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va <= 0 || vb <= 0) return 0;
  return cross / Math.sqrt(va * vb);
}

export type Image = { width: number; height: number; data: ArrayLike<number> };

/**
 * The correlation coefficient over the entries where `keep` is true. For a window that holds something the
 * comparison is not about (the ghost's own outline lines drawn over the scan), which is left out. Returns 0
 * when fewer than two entries are kept or either side has no variation.
 */
export function nccMasked(a: ArrayLike<number>, b: ArrayLike<number>, keep: ArrayLike<boolean>): number {
  if (a.length !== b.length || a.length !== keep.length) throw new Error('nccMasked needs arrays of equal length');
  const pickedA: number[] = [];
  const pickedB: number[] = [];
  for (let i = 0; i < a.length; i++) {
    if (!keep[i]) continue;
    pickedA.push(a[i] as number);
    pickedB.push(b[i] as number);
  }
  return pickedA.length < 2 ? 0 : ncc(pickedA, pickedB);
}

/** The n x n window of an image whose top left pixel is (x0, y0), row by row. */
export function window(image: Image, x0: number, y0: number, n: number): Float64Array {
  if (x0 < 0 || y0 < 0 || x0 + n > image.width || y0 + n > image.height) throw new Error('the window is outside the image');
  const out = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) out[j * n + i] = image.data[(y0 + j) * image.width + x0 + i] as number;
  }
  return out;
}

export type Peak = {
  /** Offset of the screenshot window, in pixels, at the best correlation. */
  dx: number;
  dy: number;
  value: number;
  /** The value at offset (0, 0). */
  atZero: number;
};

/**
 * Correlates `expected` (n x n) against the screenshot window whose top left is (x0 + dx, y0 + dy) for
 * every dx, dy in [-search, search], and returns the best.
 */
export function bestOffset(expected: Float64Array, screen: Image, x0: number, y0: number, n: number, search: number): Peak {
  let best: Peak = { dx: 0, dy: 0, value: -Infinity, atZero: 0 };
  for (let dy = -search; dy <= search; dy++) {
    for (let dx = -search; dx <= search; dx++) {
      const value = ncc(expected, window(screen, x0 + dx, y0 + dy, n));
      if (dx === 0 && dy === 0) best = { ...best, atZero: value };
      if (value > best.value) best = { dx, dy, value, atZero: best.atZero };
    }
  }
  return best;
}
