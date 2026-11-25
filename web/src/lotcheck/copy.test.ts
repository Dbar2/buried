import { describe, expect, it } from 'vitest';
import { checkSentence, findBannedWords } from '../evidence';
import type { SourceRegistry } from '../evidence';
import { makeSource, P1911, P1935 } from '../evidence/testing/fixtures';
import { ALL_FIXED_COPY, coverageSentences, coverageText, plansSlot } from './copy';

describe('lot check copy', () => {
  it('has no banned word in any fixed string', () => {
    for (const text of ALL_FIXED_COPY) expect(findBannedWords(text), text).toEqual([]);
  });

  it('writes the coverage line from the registry, with its years in the fact pack', () => {
    const registry: SourceRegistry = {
      schema_version: '1.1.0',
      sources: [
        makeSource(P1935, 1931, 1935),
        makeSource(P1911, 1911, 1914),
        makeSource('fip_v3_1911_232', 1911, 1914),
        makeSource('aerial_1947_x', 1947, 1947, { type: 'aerial_photograph' }),
      ],
    };
    expect(coverageText(registry)).toBe('Covered so far: one block of Toronto. Plans of 1911-14 and 1931-35.');
    for (const s of coverageSentences(registry)) expect(checkSentence(s.text, s.pack)).toEqual({ ok: true });
  });

  it('names plans by their plain years, once each', () => {
    const a = makeSource(P1911, 1911, 1914);
    const b = makeSource(P1935, 1931, 1935);
    expect(plansSlot([a, b], true).text).toBe('The 1911 and 1931-35 plans');
    expect(plansSlot([a, a]).text).toBe('the 1911 plan');
  });
});
