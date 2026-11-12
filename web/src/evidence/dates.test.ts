import { describe, expect, it } from 'vitest';
import { datePhrases, summariseDates } from './dates';
import type { Dated, DateSummary } from './dates';
import { indexSources } from './sources';
import { AERIAL, P1911, P1935, makeFeature, makeSource, obs, showcaseSources } from './testing/fixtures';

const sources = showcaseSources();

function dated(summary: DateSummary): Dated {
  if (summary.kind !== 'dated') throw new Error('expected a dated summary');
  return summary;
}

describe('summariseDates: the cases in design.md', () => {
  it('a feature seen only on the 1911 plate: built by 1914, last seen 1911', () => {
    const s = dated(summariseDates(makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')]), sources));
    expect(s.builtBy).toBe(1914);
    expect(s.lastSeen).toBe(1911);
    expect(s.window).toEqual({ from: 1911, to: 1914 });
    expect(s.notYetBuiltAt).toBeNull();
    expect(s.goneBy).toBeNull();
    expect(datePhrases(s)).toEqual(['Built by 1914', 'Last seen 1911']);
  });

  it('a feature seen only on the 1935 plate (1931 to 1935): built by 1935, last seen 1931', () => {
    const s = summariseDates(makeFeature(P1935, [obs(P1935, true, 'clear', 'origin')]), sources);
    expect(datePhrases(s)).toEqual(['Built by 1935', 'Last seen 1931']);
  });

  it('1911 and 1935 plates, nothing later: window 1911 to 1935, last seen 1931', () => {
    const f = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true)]);
    const s = dated(summariseDates(f, sources));
    expect(s.window).toEqual({ from: 1911, to: 1935 });
    expect(s.builtBy).toBe(1914);
    expect(s.lastSeen).toBe(1931);
    expect(datePhrases(s)).toEqual(['Built by 1914', 'Last seen 1931']);
  });

  it('1911 and 1935 plates with a clear 1947 absence: gone by 1947', () => {
    const f = makeFeature(P1911, [
      obs(P1911, true, 'clear', 'origin'),
      obs(P1935, true),
      obs(AERIAL, false, 'clear'),
    ]);
    const s = dated(summariseDates(f, sources));
    expect(s.goneBy).toBe(1947);
    expect(s.afterAbsences).toHaveLength(1);
    expect(datePhrases(s)).toEqual(['Built by 1914', 'Gone by 1947']);
  });

  it('the same with an obscured 1947 observation: only "Last seen 1931"', () => {
    const f = makeFeature(P1911, [
      obs(P1911, true, 'clear', 'origin'),
      obs(P1935, true),
      obs(AERIAL, false, 'obscured'),
    ]);
    const s = dated(summariseDates(f, sources));
    expect(s.goneBy).toBeNull();
    expect(s.notCounted.map((r) => r.source)).toEqual([AERIAL]);
    expect(datePhrases(s)).toEqual(['Built by 1914', 'Last seen 1931']);
  });

  it('a not-covered 1947 observation never closes the window either', () => {
    const f = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(AERIAL, false, 'not_covered')]);
    expect(dated(summariseDates(f, sources)).goneBy).toBeNull();
  });

  it('a clear absence before the first presence gives "Not yet built at"', () => {
    const f = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin'), obs(P1911, false)]);
    const s = dated(summariseDates(f, sources));
    expect(s.notYetBuiltAt).toBe(1911);
    expect(s.beforeAbsences).toHaveLength(1);
    expect(datePhrases(s)).toEqual(['Not yet built at 1911', 'Built by 1935', 'Last seen 1931']);
  });

  it('a clear absence overlapping the window is a conflict and changes no date', () => {
    const overlap = makeSource('fip_v3_1912_900', 1912, 1913);
    const index = indexSources({
      schema_version: '1.0.0',
      sources: [makeSource(P1911, 1911, 1914), makeSource(P1935, 1935, 1935), overlap],
    });
    const base = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true)]);
    const clash = makeFeature(P1911, [
      obs(P1911, true, 'clear', 'origin'),
      obs(P1935, true),
      obs(overlap.id, false),
    ]);
    const a = dated(summariseDates(base, index));
    const b = dated(summariseDates(clash, index));
    expect(b.conflicts.map((r) => r.source)).toEqual([overlap.id]);
    expect([b.builtBy, b.lastSeen, b.window]).toEqual([a.builtBy, a.lastSeen, a.window]);
    expect(b.goneBy).toBeNull();
    expect(b.notYetBuiltAt).toBeNull();
  });

  it('no clear presence gives "no presence", no window and no phrases', () => {
    const f = makeFeature(P1911, [obs(P1911, true, 'obscured', 'origin'), obs(AERIAL, false)]);
    const s = summariseDates(f, sources);
    expect(s.kind).toBe('no_presence');
    expect(s.kind === 'no_presence' && s.checked).toHaveLength(2);
    expect(datePhrases(s)).toEqual([]);
  });

  it('never produces "Built in"', () => {
    const f = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(AERIAL, false)]);
    for (const phrase of datePhrases(summariseDates(f, sources))) {
      expect(phrase.toLowerCase()).not.toContain('built in');
    }
  });

  it('does not depend on the order of observations', () => {
    const list = [obs(P1911, true, 'clear', 'origin'), obs(P1935, true), obs(AERIAL, false)];
    const a = summariseDates(makeFeature(P1911, list), sources);
    const b = summariseDates(makeFeature(P1911, [...list].reverse()), sources);
    expect(b).toEqual(a);
  });
});
