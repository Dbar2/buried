import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bandScrollTop } from './scrollBand';

const base = { containerTop: 100, containerHeight: 400, scrollHeight: 2000, scrollTop: 0, bandHeight: 120 };

describe('bandScrollTop', () => {
  it('does not move when the band is fully in view', () => {
    expect(bandScrollTop({ ...base, bandTop: 150 })).toBeNull();
  });

  it('does not move a report column that does not scroll (the narrow layout)', () => {
    expect(bandScrollTop({ ...base, scrollHeight: 400, bandTop: 900 })).toBeNull();
  });

  it('centres a band that is below the view', () => {
    // 1000 below the container top, 400 tall container, 120 tall band: centre it.
    expect(bandScrollTop({ ...base, bandTop: 1100 })).toBe(1000 - (400 - 120) / 2);
  });

  it('never scrolls past either end', () => {
    expect(bandScrollTop({ ...base, scrollTop: 300, bandTop: -50 })).toBe(10);
    expect(bandScrollTop({ ...base, scrollTop: 1500, bandTop: 2300 })).toBe(1600);
  });

  it('property: after the move the band is inside the container, and a band already inside stays', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 800 }),
        fc.integer({ min: 20, max: 300 }),
        fc.integer({ min: 0, max: 5000 }),
        fc.integer({ min: 0, max: 5000 }),
        (containerHeight, bandHeight, extra, offset) => {
          fc.pre(bandHeight <= containerHeight);
          const scrollHeight = containerHeight + extra;
          const scrollTop = Math.min(offset, extra);
          // The band sits somewhere in the scrollable content.
          const contentTop = Math.min(offset * 7, scrollHeight - bandHeight);
          const box = { containerTop: 50, containerHeight, scrollHeight, scrollTop, bandTop: 50 + contentTop - scrollTop, bandHeight };
          const top = bandScrollTop(box);
          const visible = (t: number) => contentTop - t >= 0 && contentTop - t + bandHeight <= containerHeight;
          if (top === null) {
            expect(visible(scrollTop) || extra <= 1 || Math.abs(Math.min(Math.max(contentTop - (containerHeight - bandHeight) / 2, 0), extra) - scrollTop) < 1).toBe(true);
          } else {
            expect(top).toBeGreaterThanOrEqual(0);
            expect(top).toBeLessThanOrEqual(extra);
            expect(visible(top)).toBe(true);
          }
        },
      ),
    );
  });
});
