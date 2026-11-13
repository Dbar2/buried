/**
 * Pixel arithmetic for the land-use area check (session 034). Pure, so vitest tests it (areaPixels.test.ts) with no
 * browser. An area is checked as the difference between two pictures of one view, taken with and without it
 * (`?areas=0`): inside the area the difference is the hatching, outside it there is none.
 */
export type Rgba = { width: number; height: number; data: ArrayLike<number> };
export type P = readonly [number, number];

/** Rec. 709 luma of a pixel's sRGB values (0 to 255): what a greyscale screenshot would hold. */
export function luma(img: Rgba, x: number, y: number): number {
  const i = (img.width * y + x) * 4;
  return 0.2126 * (img.data[i] as number) + 0.7152 * (img.data[i + 1] as number) + 0.0722 * (img.data[i + 2] as number);
}

export function insidePolygon(p: P, ring: readonly P[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as P;
    const [xj, yj] = ring[j] as P;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function centroid(ring: readonly P[]): P {
  return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
}

/** The ring scaled about its centroid. */
export function scaled(ring: readonly P[], factor: number): P[] {
  const [cx, cy] = centroid(ring);
  return ring.map((p): P => [cx + (p[0] - cx) * factor, cy + (p[1] - cy) * factor]);
}

export function boundsOf(ring: readonly P[]): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: Math.min(...ring.map((p) => p[0])),
    minY: Math.min(...ring.map((p) => p[1])),
    maxX: Math.max(...ring.map((p) => p[0])),
    maxY: Math.max(...ring.map((p) => p[1])),
  };
}

/**
 * How often a signal swings between clearly high and clearly low about its mean: the count of changes between "more
 * than `amplitude` above the mean" and "more than `amplitude` below it", which ignores wobble smaller than that.
 * Stripes with N periods across a row give about 2N.
 */
export function swings(values: readonly number[], amplitude: number): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  let state = 0;
  let count = 0;
  for (const v of values) {
    const next = v - mean > amplitude ? 1 : v - mean < -amplitude ? -1 : state;
    if (state !== 0 && next !== state) count++;
    state = next;
  }
  return count;
}

export type AreaMeasure = {
  /** Pixels in the inner region (the area shrunk about its centre, so its outline and the tracing error are left out). */
  insidePixels: number;
  /** Share of them whose largest channel difference between the two pictures is above the threshold. */
  insideChanged: number;
  /** Mean swings per row of the luma difference inside the area: the hatching, read in greyscale. */
  swingsPerRow: number;
  rows: number;
  /** Pixels away from the area (outside its box grown by `margin`) and the share of them that differ. */
  outsidePixels: number;
  outsideChanged: number;
};

/**
 * Compares the picture with the area (`with`) and without it (`without`) of the same view. `ring` is the area's outline
 * on the screen. The inner region is `ring` shrunk to `shrink` of its size; everything farther than `margin` pixels
 * from the ring's box is "outside". `threshold` is the channel difference that counts as a change, `amplitude` the
 * luma swing that counts as a stripe edge.
 */
export function measureArea(
  withArea: Rgba,
  without: Rgba,
  ring: readonly P[],
  options: { shrink: number; margin: number; threshold: number; amplitude: number; minRowPixels: number },
): AreaMeasure {
  if (withArea.width !== without.width || withArea.height !== without.height) throw new Error('the pictures differ in size');
  const inner = scaled(ring, options.shrink);
  const box = boundsOf(ring);
  let insidePixels = 0;
  let insideChanged = 0;
  let outsidePixels = 0;
  let outsideChanged = 0;
  let swingTotal = 0;
  let rows = 0;
  for (let y = 0; y < withArea.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < withArea.width; x++) {
      const i = (withArea.width * y + x) * 4;
      const diff = Math.max(
        Math.abs((withArea.data[i] as number) - (without.data[i] as number)),
        Math.abs((withArea.data[i + 1] as number) - (without.data[i + 1] as number)),
        Math.abs((withArea.data[i + 2] as number) - (without.data[i + 2] as number)),
      );
      if (insidePolygon([x + 0.5, y + 0.5], inner)) {
        insidePixels++;
        if (diff > options.threshold) insideChanged++;
        row.push(luma(withArea, x, y) - luma(without, x, y));
      } else if (x < box.minX - options.margin || x > box.maxX + options.margin || y < box.minY - options.margin || y > box.maxY + options.margin) {
        outsidePixels++;
        if (diff > options.threshold) outsideChanged++;
      }
    }
    if (row.length >= options.minRowPixels) {
      swingTotal += swings(row, options.amplitude);
      rows++;
    }
  }
  return {
    insidePixels,
    insideChanged: insidePixels === 0 ? 0 : insideChanged / insidePixels,
    swingsPerRow: rows === 0 ? 0 : swingTotal / rows,
    rows,
    outsidePixels,
    outsideChanged: outsidePixels === 0 ? 0 : outsideChanged / outsidePixels,
  };
}
