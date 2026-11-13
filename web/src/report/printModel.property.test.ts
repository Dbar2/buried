import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PRINT_FINDINGS_PER_GROUP, moreFindingsText, printSplit } from './printModel';

describe('R12 print limits hide nothing silently', () => {
  it('shows the first min(n, limit) findings in order and counts the rest', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { maxLength: 30 }), (items) => {
        const { shown, hiddenCount } = printSplit(items);
        expect(shown).toEqual(items.slice(0, Math.min(items.length, PRINT_FINDINGS_PER_GROUP)));
        expect(hiddenCount).toBe(Math.max(0, items.length - PRINT_FINDINGS_PER_GROUP));
        expect(shown.length + hiddenCount).toBe(items.length);
        // The line saying so exists exactly when something is hidden, and carries the count.
        if (hiddenCount > 0) expect(moreFindingsText(hiddenCount)).toMatch(new RegExp(`^${hiddenCount === 1 ? '1 more finding' : `${hiddenCount} more findings`} `));
      }),
      { numRuns: 200 },
    );
  });

  it('is two findings per group', () => {
    expect(PRINT_FINDINGS_PER_GROUP).toBe(2);
  });
});
