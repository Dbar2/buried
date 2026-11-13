/**
 * WCAG contrast of the Report tokens (spec 05 task 5.4). Reads the values from tokens.css, so the
 * test has no second copy. Body text needs 4.5:1; rules and UI outlines 3:1. If a pair fails, report
 * it; do not change a token without the maintainer.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8');
const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`token ${name} not found`);
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

describe('Report token contrast on --report-paper', () => {
  const paper = token('report-paper');
  it('--report-ink is body text: at least 4.5:1', () => {
    const r = ratio(token('report-ink'), paper);
    console.log(`report-ink on report-paper ${r.toFixed(2)} : 1`);
    expect(r).toBeGreaterThanOrEqual(4.5);
  });
  it('--report-ink-soft is secondary text: at least 4.5:1', () => {
    const r = ratio(token('report-ink-soft'), paper);
    console.log(`report-ink-soft on report-paper ${r.toFixed(2)} : 1`);
    expect(r).toBeGreaterThanOrEqual(4.5);
  });
  it('--report-rule is a rule and an outline: at least 3:1', () => {
    const r = ratio(token('report-rule'), paper);
    console.log(`report-rule on report-paper ${r.toFixed(2)} : 1`);
    expect(r).toBeGreaterThanOrEqual(3);
  });
  it('the paper is not the dark theme: no fog, lantern or water in the Report', () => {
    expect(luminance(paper)).toBeGreaterThan(0.9);
  });
});
