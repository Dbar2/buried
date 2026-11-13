/**
 * Pixel arithmetic for the Lantern and Show Evidence checks (session 028). Pure: images are RGBA buffers, so
 * vitest can test it (lens.test.ts) with no browser.
 */
export type Rgba = { width: number; height: number; data: ArrayLike<number> };

export type Where = 'inside' | 'rim' | 'outside';

/**
 * Where a pixel is relative to a lens of radius `r` centred on (cx, cy): inside when more than `band` pixels
 * short of the radius, outside when more than `band` beyond it, and the rim between.
 */
export function whereIs(x: number, y: number, cx: number, cy: number, r: number, band: number): Where {
  const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
  if (d < r - band) return 'inside';
  if (d > r + band) return 'outside';
  return 'rim';
}

/** The largest channel difference (red, green, blue) between two pixels of two same-sized images. */
export function channelDiff(a: Rgba, b: Rgba, x: number, y: number): number {
  const i = (a.width * y + x) * 4;
  return Math.max(
    Math.abs((a.data[i] as number) - (b.data[i] as number)),
    Math.abs((a.data[i + 1] as number) - (b.data[i + 1] as number)),
    Math.abs((a.data[i + 2] as number) - (b.data[i + 2] as number)),
  );
}

/**
 * Of the pixels `select` picks, the share (and the count) whose largest channel difference is above `threshold`.
 * The images must be the same size.
 */
export function mismatch(
  a: Rgba,
  b: Rgba,
  select: (x: number, y: number) => boolean,
  threshold: number,
): { share: number; count: number; selected: number } {
  if (a.width !== b.width || a.height !== b.height) throw new Error('the images differ in size');
  let selected = 0;
  let count = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      if (!select(x, y)) continue;
      selected++;
      if (channelDiff(a, b, x, y) > threshold) count++;
    }
  }
  return { share: selected === 0 ? 0 : count / selected, count, selected };
}

/**
 * The picture a lens should make: `outside` everywhere beyond the rim band and `inside` within it; the rim band
 * itself is copied from `outside` and left to the test to measure. Returns RGBA data of the same size.
 */
export function composeLens(outside: Rgba, inside: Rgba, cx: number, cy: number, r: number, band: number): Uint8ClampedArray {
  if (outside.width !== inside.width || outside.height !== inside.height) throw new Error('the images differ in size');
  const out = new Uint8ClampedArray(outside.width * outside.height * 4);
  for (let y = 0; y < outside.height; y++) {
    for (let x = 0; x < outside.width; x++) {
      const from = whereIs(x, y, cx, cy, r, band) === 'inside' ? inside : outside;
      const i = (outside.width * y + x) * 4;
      for (let c = 0; c < 4; c++) out[i + c] = from.data[i + c] as number;
    }
  }
  return out;
}

/**
 * How much of a ring is drawn: of `angles` evenly spaced directions from the centre, the share in which some pixel
 * within `band` of the radius (along the ray) differs from `expected` by more than `threshold`.
 */
export function ringCoverage(
  actual: Rgba,
  expected: Rgba,
  cx: number,
  cy: number,
  r: number,
  band: number,
  angles: number,
  threshold: number,
): number {
  let hit = 0;
  let measured = 0;
  for (let k = 0; k < angles; k++) {
    const angle = (2 * Math.PI * k) / angles;
    let any = false;
    let onCanvas = false;
    for (let d = r - band; d <= r + band; d += 0.5) {
      const x = Math.round(cx + d * Math.cos(angle) - 0.5);
      const y = Math.round(cy + d * Math.sin(angle) - 0.5);
      if (x < 0 || y < 0 || x >= actual.width || y >= actual.height) continue;
      onCanvas = true;
      if (channelDiff(actual, expected, x, y) > threshold) any = true;
    }
    if (!onCanvas) continue;
    measured++;
    if (any) hit++;
  }
  return measured === 0 ? 0 : hit / measured;
}

export type Seg = readonly [readonly [number, number], readonly [number, number]];

/** Distance from a point to a segment, in pixels. */
export function distanceToSegment(x: number, y: number, s: Seg): number {
  const [[ax, ay], [bx, by]] = s;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
  return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
}

/** True when the pixel (its centre) is within `px` of any of the segments: where a drawn outline may lie. */
export function nearAnySegment(x: number, y: number, segments: readonly Seg[], px: number): boolean {
  return segments.some((s) => distanceToSegment(x + 0.5, y + 0.5, s) <= px);
}
