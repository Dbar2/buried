import { describe, expect, it } from 'vitest';
import { EvidenceLoadError } from './load';
import { indexSources, sourceYearsText } from './sources';
import { AERIAL, P1911, P1935, makeSource, showcaseRegistry } from './testing/fixtures';

describe('sourceYearsText (requirement 24.1)', () => {
  it('uses the years label when the source has one', () => {
    const registry = showcaseRegistry();
    const text = (id: string) => sourceYearsText(indexSources(registry).get(id)!);
    expect(text(P1911)).toBe('1911, revised to 1914');
    expect(text(P1935)).toBe('1931, revised to 1935');
  });

  it('gives a range with an en dash when there is no label', () => {
    expect(sourceYearsText(makeSource('fip_v3_1920_001', 1920, 1922))).toBe('1920–1922');
  });

  it('gives a single year for a one-year source', () => {
    expect(sourceYearsText(indexSources(showcaseRegistry()).get(AERIAL)!)).toBe('1947');
  });

  it('gives the end year alone while a present-day layer has no start year', () => {
    const pending = makeSource('present_toronto_intersections_2026', 2026, 2026, {
      type: 'present_day_reference',
      year_from: null,
    });
    expect(sourceYearsText(pending)).toBe('2026');
  });

  it('prefers the label even when it is the only place the wording differs', () => {
    expect(sourceYearsText(makeSource('fip_v3_1911_232', 1911, 1914, { years_label: 'custom 1911 1914' }))).toBe(
      'custom 1911 1914',
    );
  });

  it('is not read by the date logic: the plate years stay 1931 and 1935', () => {
    const p1935 = indexSources(showcaseRegistry()).get(P1935);
    expect([p1935?.year_from, p1935?.year_to]).toEqual([1931, 1935]);
  });
});

describe('indexSources', () => {
  it('throws on a duplicate id', () => {
    const registry = showcaseRegistry();
    registry.sources.push(makeSource(P1911, 1911, 1914));
    expect(() => indexSources(registry)).toThrowError(EvidenceLoadError);
  });
});
