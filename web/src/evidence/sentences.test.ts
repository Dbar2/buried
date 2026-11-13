import { describe, expect, it } from 'vitest';
import { checkSentence } from './sentences';

const pack = (p: Partial<{ numbers: string[]; ids: string[]; verbatim: string[] }>) => ({ numbers: [], ids: [], verbatim: [], ...p });

describe('checkSentence', () => {
  it('passes a sentence whose numbers and ids are all in the pack', () => {
    expect(
      checkSentence('A building is drawn near this lot (within 7 m) on fip_v3_1911_229 (1911–1914).', pack({ numbers: ['7', '1911', '1914'], ids: ['fip_v3_1911_229'] })),
    ).toEqual({ ok: true });
  });

  it('fails on a number the pack does not hold, including decimals', () => {
    const result = checkSentence('Positioned within about 4.0 m.', pack({ numbers: ['4'] }));
    expect(result.ok).toBe(false);
    expect(checkSentence('Positioned within about 4.0 m.', pack({ numbers: ['4.0'] }))).toEqual({ ok: true });
  });

  it('fails on an id the pack does not hold, and an id does not count as numbers', () => {
    expect(checkSentence('Seen on fip_v3_1935_229.', pack({ ids: ['fip_v3_1911_229'] })).ok).toBe(false);
    expect(checkSentence('Seen on fip_v3_1935_229.', pack({ ids: ['fip_v3_1935_229'] }))).toEqual({ ok: true });
  });

  it('fails on a banned word, case-insensitively, but allows "safety"', () => {
    expect(checkSentence('This lot is Safe.', pack({})).ok).toBe(false);
    expect(checkSentence('Ask about safety.', pack({}))).toEqual({ ok: true });
  });

  it('ignores digits inside a verbatim string, but not a banned word inside one', () => {
    expect(checkSentence("'Stores 2nd floor' is recorded.", pack({ verbatim: ['Stores 2nd floor'] }))).toEqual({ ok: true });
    const bad = checkSentence("'Clean room' is recorded.", pack({ verbatim: ['Clean room'] }));
    expect(bad.ok).toBe(false);
  });

  it('removes the longest verbatim string first', () => {
    expect(checkSentence('See https://example.org/a1 and https://example.org/a12', pack({ verbatim: ['https://example.org/a1', 'https://example.org/a12'] }))).toEqual({ ok: true });
  });
});
