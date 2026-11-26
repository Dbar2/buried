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
  ['lantern', 'ink', 3, 7.1, "the lot outline's stroke against its ink casing"],
  ['rule', 'parchment', 3, 3.5, 'control outlines on the card'],
  ['copper', 'soot', 3, 4.4, 'hairlines and marks only'],
  ['stamp', 'parchment', 4.5, 5.5, "the rubber stamp's text and border on the record sheet"],
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

describe('the lot check styles use no pair design.md forbids (spec 08 task 7)', () => {
  const lotcheck = readFileSync(fileURLToPath(new URL('./lotcheck.css', import.meta.url)), 'utf8');
  const night = readFileSync(fileURLToPath(new URL('./night.css', import.meta.url)), 'utf8');
  const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const noComments = strip(lotcheck);
  const nightNoComments = strip(night);
  const rulesOf = (css: string) => [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ selector: (m[1] as string).trim().replace(/\s+/g, ' '), body: m[2] as string }));
  const allRules = [...rulesOf(noComments), ...rulesOf(nightNoComments)];
  const uses = (token: string) => allRules.filter((r) => r.body.includes(`var(--${token})`)).map((r) => r.selector);

  it('never sets text in --lantern or --copper', () => {
    // `color:` only: borders, backgrounds, strokes and fills are not text.
    for (const css of [noComments, nightNoComments]) {
      const bad = [...css.matchAll(/(?:^|[;{\s])color:\s*var\(--(lantern|copper|stamp)\)/g)].map((m) => m[0].trim());
      // --stamp is text on the stamp, on parchment only.
      expect(bad.filter((b) => !b.includes('--stamp'))).toEqual([]);
    }
  });

  it('draws the lot outline as a 3 px lantern stroke inside a 5 px ink casing (4 px inside 6 px in the compare frame)', () => {
    expect(noComments).toMatch(/\.lc-outline-casing\s*\{[^}]*stroke:\s*var\(--ink\)[^}]*stroke-width:\s*5px/);
    expect(noComments).toMatch(/\.lc-outline\s*\{[^}]*stroke:\s*var\(--lantern\)[^}]*stroke-width:\s*3px/);
    expect(noComments).toMatch(/\.lc-frame \.lc-outline-casing\s*\{[^}]*stroke-width:\s*6px/);
    expect(noComments).toMatch(/\.lc-frame \.lc-outline\s*\{[^}]*stroke-width:\s*4px/);
  });

  it('uses lantern only where design.md lists it, and copper only for the divider grip and the registration crosses', () => {
    // Session 053: the lit lots, the light and the pool on the Landing, the lantern's glow, the focus ring and the field's focus border on soot, the mark.
    expect([...new Set(uses('lantern'))].sort()).toEqual(
      ['.dg-brand .mark', '.dg-glow', '.lc-button', '.lc-dot', '.lc-field:focus', '.lc-lantern-pool', '.lc-light', '.lc-lot-fill', '.lc-lot-line', '.lc-outline', '.lc-pool', '.lotcheck-page .wordmark .mark', '.lotcheck-scroll :focus-visible'].sort(),
    );
    expect(uses('copper').sort()).toEqual(['.lc-grip', '.lotcheck-scroll .lc-cross::before, .lotcheck-scroll .lc-cross::after']);
  });

  it('uses --stamp for the rubber stamp and nothing else', () => {
    expect(uses('stamp')).toEqual(['.lc-stamp']);
  });

  it('puts the focus ring on soot in lantern and on paper in ink', () => {
    expect(nightNoComments).toMatch(/\.lotcheck-scroll :focus-visible\s*\{[^}]*outline:\s*2px solid var\(--lantern\)/);
    expect(nightNoComments).toMatch(/\.lc-on-paper :focus-visible,\s*\.lc-suggest :focus-visible\s*\{[^}]*outline-color:\s*var\(--ink\)/);
    expect(noComments).toMatch(/\.lotcheck-scroll :focus-visible\s*\{[^}]*outline:\s*2px solid var\(--ink\)/);
  });

  it('has no raw hex colour', () => {
    expect(noComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(nightNoComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('animates only transform and opacity (the keyframes name no other property)', () => {
    const frames = [...nightNoComments.matchAll(/@keyframes\s+[\w-]+\s*\{((?:[^{}]*\{[^}]*\})*)\s*\}/g)].map((m) => m[1] as string);
    expect(frames.length).toBeGreaterThan(8);
    for (const body of frames) {
      const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1] as string);
      for (const p of props) expect(['opacity', 'transform'], p).toContain(p);
    }
  });
});
