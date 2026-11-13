import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DRAFT_STATUS, isReviewed, reviewStatusLine } from './review';
import { findBannedWords } from './text';

describe('reviewStatusLine', () => {
  it('names the reviewer and the day for a reviewed feature', () => {
    expect(reviewStatusLine({ state: 'reviewed', by: 'A. Reader', on: '2026-11-14' })).toBe('Status: reviewed by A. Reader, 2026-11-14');
    expect(isReviewed({ state: 'reviewed', by: 'A. Reader', on: '2026-11-14' })).toBe(true);
  });

  it('calls both kinds of draft a draft', () => {
    expect(reviewStatusLine({ state: 'draft_rule' })).toBe('Status: draft, not yet reviewed');
    expect(reviewStatusLine({ state: 'draft_hand' })).toBe(DRAFT_STATUS);
    expect(isReviewed({ state: 'draft_hand' })).toBe(false);
  });

  it('reads a reviewed state with no person or no day as a draft, and a missing state too', () => {
    expect(reviewStatusLine({ state: 'reviewed' })).toBe(DRAFT_STATUS);
    expect(reviewStatusLine({ state: 'reviewed', by: 'A. Reader' })).toBe(DRAFT_STATUS);
    expect(reviewStatusLine({ state: 'reviewed', on: '2026-11-14' })).toBe(DRAFT_STATUS);
    expect(reviewStatusLine(undefined)).toBe(DRAFT_STATUS);
  });

  it('does not reproduce a name with a banned word', () => {
    const line = reviewStatusLine({ state: 'reviewed', by: 'Clean Team', on: '2026-11-14' });
    expect(findBannedWords(line)).toEqual([]);
    expect(line).not.toContain('Clean Team');
  });

  // P3: for any draft feature, the status text has no "Confirmed" and says "draft, not yet reviewed".
  it('P3: a draft never reads as confirmed or reviewed, whatever else the record holds', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('draft_rule', 'draft_hand') as fc.Arbitrary<'draft_rule' | 'draft_hand'>,
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.string(), { nil: undefined }),
        (state, by, on) => {
          const line = reviewStatusLine({ state, by, on });
          expect(line).not.toMatch(/confirmed/i);
          expect(line).toContain('draft, not yet reviewed');
          expect(line).not.toMatch(/reviewed by/i);
        },
      ),
    );
  });

  it('P3: no status line says "Confirmed", reviewed or not (the label is the record\'s, never the name\'s)', () => {
    const plain = fc.string().filter((s) => !/confirmed/i.test(s));
    fc.assert(
      fc.property(fc.constantFrom('reviewed', 'draft_rule', 'draft_hand') as fc.Arbitrary<'reviewed' | 'draft_rule' | 'draft_hand'>, fc.option(plain, { nil: undefined }), fc.option(plain, { nil: undefined }), (state, by, on) => {
        expect(reviewStatusLine({ state, by, on })).not.toMatch(/\bconfirmed\b/i);
      }),
    );
  });
});
