import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { positionPhrase } from './position';

describe('positionPhrase (requirements 20.3 and 20.4)', () => {
  it.each([
    [2.0, 'Positioned within about 2.0 m'],
    [2.3, 'Positioned within about 2.3 m'],
    [4.5, 'Positioned within about 4.5 m'],
    [12, 'Positioned within about 12.0 m'],
    [0.1, 'Positioned within about 0.1 m'],
  ])('%s gives %s', (m, text) => {
    expect(positionPhrase(m)).toBe(text);
  });

  it('shows stored multiples of 0.1 m as stored, despite float noise', () => {
    expect(positionPhrase(4.3 + 1e-12)).toBe('Positioned within about 4.3 m');
    expect(positionPhrase(0.1 + 0.2)).toBe('Positioned within about 0.3 m');
  });

  it('never understates a value that is not a multiple of 0.1 m: it rounds up', () => {
    expect(positionPhrase(4.31)).toBe('Positioned within about 4.4 m');
    expect(positionPhrase(4.49)).toBe('Positioned within about 4.5 m');
  });

  it('refuses zero, negative and non-finite values', () => {
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) expect(() => positionPhrase(bad)).toThrowError(RangeError);
  });

  it('never words the error as a bound or a guarantee, and never understates it', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 5000, noNaN: true }), (m) => {
        const text = positionPhrase(m);
        expect(text).toMatch(/^Positioned within about \d+\.\d m$/);
        expect(text).not.toMatch(/±|exactly|guaranteed/i);
        const shown = Number(text.replace(/[^\d.]/g, ''));
        expect(shown).toBeGreaterThanOrEqual(m - 1e-9);
        expect(shown).toBeLessThan(m + 0.1 + 1e-9);
      }),
      { numRuns: 500 },
    );
  });
});
