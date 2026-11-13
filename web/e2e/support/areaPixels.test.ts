import { describe, expect, it } from 'vitest';
import { centroid, insidePolygon, measureArea, scaled, swings } from './areaPixels';
import type { P, Rgba } from './areaPixels';

function image(width: number, height: number, tone: (x: number, y: number) => number): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = tone(x, y);
      data.set([v, v, v, 255], (width * y + x) * 4);
    }
  }
  return { width, height, data };
}

const SQUARE: P[] = [
  [20, 20],
  [80, 20],
  [80, 80],
  [20, 80],
];

describe('swings', () => {
  it('counts the changes between clearly high and clearly low about the mean', () => {
    expect(swings([0, 0, 100, 100, 0, 0, 100, 100], 20)).toBe(3);
    expect(swings([50, 51, 49, 50, 52, 48], 20)).toBe(0);
    expect(swings([], 20)).toBe(0);
  });
});

describe('the polygon helpers', () => {
  it('finds inside and outside, the centroid and a shrunk copy', () => {
    expect(insidePolygon([50, 50], SQUARE)).toBe(true);
    expect(insidePolygon([10, 50], SQUARE)).toBe(false);
    expect(centroid(SQUARE)).toEqual([50, 50]);
    expect(scaled(SQUARE, 0.5)).toEqual([
      [35, 35],
      [65, 35],
      [65, 65],
      [35, 65],
    ]);
  });
});

describe('measureArea', () => {
  const base = image(100, 100, () => 128);
  const striped = image(100, 100, (x, y) => (x >= 20 && x < 80 && y >= 20 && y < 80 ? ((x + y) % 10 < 5 ? 40 : 220) : 128));
  const options = { shrink: 0.6, margin: 10, threshold: 8, amplitude: 25, minRowPixels: 10 };

  it('sees diagonal stripes inside the area and nothing outside it', () => {
    const m = measureArea(striped, base, SQUARE, options);
    expect(m.insidePixels).toBeGreaterThan(1000);
    expect(m.insideChanged).toBeGreaterThan(0.9);
    expect(m.swingsPerRow).toBeGreaterThanOrEqual(3);
    expect(m.outsidePixels).toBeGreaterThan(1000);
    expect(m.outsideChanged).toBe(0);
  });

  it('sees nothing when the pictures are the same', () => {
    const m = measureArea(base, base, SQUARE, options);
    expect(m.insideChanged).toBe(0);
    expect(m.swingsPerRow).toBe(0);
    expect(m.outsideChanged).toBe(0);
  });

  it('sees a change outside the area as a change outside', () => {
    const stray = image(100, 100, (x, y) => (x < 8 && y < 8 ? 0 : 128));
    expect(measureArea(stray, base, SQUARE, options).outsideChanged).toBeGreaterThan(0);
  });

  it('refuses pictures of different sizes', () => {
    expect(() => measureArea(base, image(50, 50, () => 0), SQUARE, options)).toThrow();
  });
});
