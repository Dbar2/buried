import { describe, expect, it } from 'vitest';
import { channelDiff, composeLens, distanceToSegment, mismatch, nearAnySegment, ringCoverage, whereIs } from './lens';
import type { Rgba } from './lens';

function image(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fill(x, y);
      data.set([r, g, b, 255], (width * y + x) * 4);
    }
  }
  return { width, height, data };
}

describe('where a pixel is', () => {
  it('is inside, on the rim or outside by its distance from the centre', () => {
    expect(whereIs(50, 50, 50.5, 50.5, 20, 4)).toBe('inside');
    expect(whereIs(70, 50, 50.5, 50.5, 20, 4)).toBe('rim');
    expect(whereIs(80, 50, 50.5, 50.5, 20, 4)).toBe('outside');
  });
});

describe('comparing two pictures', () => {
  const dark = image(40, 40, () => [10, 10, 10]);
  const light = image(40, 40, () => [200, 200, 200]);

  it('finds no mismatch between a picture and itself', () => {
    expect(mismatch(dark, dark, () => true, 0)).toEqual({ share: 0, count: 0, selected: 1600 });
  });

  it('counts the selected pixels that differ by more than the threshold', () => {
    const left = (x: number): boolean => x < 10;
    expect(mismatch(dark, light, (x) => left(x), 100)).toEqual({ share: 1, count: 400, selected: 400 });
    expect(mismatch(dark, light, (x) => left(x), 190)).toEqual({ share: 0, count: 0, selected: 400 });
    expect(channelDiff(dark, light, 3, 3)).toBe(190);
  });

  it('refuses images of different sizes', () => {
    expect(() => mismatch(dark, image(10, 10, () => [0, 0, 0]), () => true, 1)).toThrow();
  });
});

describe('a lens made from two pictures', () => {
  const outside = image(100, 100, () => [20, 20, 20]);
  const inside = image(100, 100, () => [220, 220, 220]);
  const composed = composeLens(outside, inside, 50, 50, 30, 4);
  const picture: Rgba = { width: 100, height: 100, data: composed };

  it('is the inside picture within the rim band and the outside picture beyond it', () => {
    expect(channelDiff(picture, inside, 50, 50)).toBe(0);
    expect(channelDiff(picture, outside, 95, 95)).toBe(0);
    expect(mismatch(picture, inside, (x, y) => whereIs(x, y, 50, 50, 30, 4) === 'inside', 0).count).toBe(0);
    expect(mismatch(picture, outside, (x, y) => whereIs(x, y, 50, 50, 30, 4) === 'outside', 0).count).toBe(0);
  });

  it('has a ring covered only where a picture draws one', () => {
    expect(ringCoverage(picture, picture, 50, 50, 30, 4, 90, 25)).toBe(0);
    const withRing = new Uint8ClampedArray(composed);
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        if (Math.abs(Math.hypot(x + 0.5 - 50, y + 0.5 - 50) - 30) < 1) withRing.set([255, 255, 255, 255], (100 * y + x) * 4);
      }
    }
    expect(ringCoverage({ width: 100, height: 100, data: withRing }, picture, 50, 50, 30, 4, 90, 25)).toBe(1);
  });
});

describe('segments', () => {
  const s = [[0, 0], [10, 0]] as const;

  it('measures the distance to a segment, to its end when the foot is beyond it', () => {
    expect(distanceToSegment(5, 3, s)).toBe(3);
    expect(distanceToSegment(13, 4, s)).toBe(5);
    expect(distanceToSegment(2, 2, [[1, 1], [1, 1]])).toBeCloseTo(Math.SQRT2, 12);
  });

  it('says whether a pixel is near any of them', () => {
    expect(nearAnySegment(5, 2, [s], 3)).toBe(true);
    expect(nearAnySegment(5, 9, [s], 3)).toBe(false);
    expect(nearAnySegment(5, 0, [], 3)).toBe(false);
  });
});
