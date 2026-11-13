/**
 * WCAG 2 contrast of the palette pairs design.md "Palette tokens" lists, each against its floor
 * (spec 06 task W1). Values are read from tokens.css, so the test has no second copy. A pair that
 * fails is reported, not fixed here: changing a token is the maintainer's call.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');

const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token --${name} not found in tokens.css`);
  return m[1] as string;
};

function luminance(hex: string): number {
  const channel = (i: number): number => {
    const s = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

export function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** [foreground, background, floor, design.md's stated ratio, use] */
const PAIRS: ReadonlyArray<readonly [string, string, number, number, string]> = [
  ['parchment', 'soot', 4.5, 13.3, 'body text on the dark theme'],
  ['parchment', 'haze', 4.5, 11.4, 'header and phone backing'],
  ['parchment-dim', 'soot', 4.5, 6.9, 'secondary text'],
  ['ink', 'parchment', 4.5, 11.7, 'card and tag text'],
  ['ink-soft', 'parchment', 4.5, 5.7, 'card secondary text'],
  ['ink', 'lantern', 4.5, 7.1, "the primary button's label"],
  ['lantern', 'soot', 3, 8.1, 'focus rings and selected tag outline on soot'],
  ['rule', 'parchment', 3, 3.5, 'control outlines on the card'],
  ['copper', 'soot', 3, 4.4, 'hairlines and marks only'],
];

describe('palette contrast (design.md "Contrast pairs")', () => {
  for (const [fg, bg, floor, stated, use] of PAIRS) {
    it(`--${fg} on --${bg} (${use}): at least ${floor}:1`, () => {
      const r = ratio(token(fg), token(bg));
      console.log(`${fg} on ${bg}: ${r.toFixed(2)} : 1 (design.md says ${stated})`);
      expect(r).toBeGreaterThanOrEqual(floor);
      // The design's own figure is to one decimal; a token that drifts from it should be noticed.
      expect(Math.abs(r - stated)).toBeLessThan(0.15);
    });
  }

  it('the two pairs design.md forbids really do fail, so nobody relies on them', () => {
    expect(ratio(token('lantern'), token('parchment'))).toBeLessThan(3);
    expect(ratio(token('copper'), token('parchment'))).toBeLessThan(3.1);
  });
});
