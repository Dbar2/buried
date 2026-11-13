/**
 * Spec 06 requirement 10 and property P4: a core-sample row for plan X names the plan an outline was
 * first read from (Y, not X) only inside "First drawn on the <Y> plan; drawn again on the <X> plan.",
 * and only when plan X shows the outline clearly.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { clearPresenceSourceIds, FIRST_DRAWN_ON, firstDrawnText, outlineAttribution } from './rowWording';
import type { RowPlan } from './rowWording';
import { plainSourceName } from './plainWords';
import { findBannedWords } from './text';
import type { Feature } from './types.generated';

const plan1911: RowPlan = { id: 'fip_v3_1911_229', type: 'fire_insurance_plan', year_from: 1911, year_to: 1914 };
const plan1911b: RowPlan = { id: 'fip_v3_1911_232', type: 'fire_insurance_plan', year_from: 1911, year_to: 1914 };
const plan1935: RowPlan = { id: 'fip_v3_1935_229', type: 'fire_insurance_plan', year_from: 1931, year_to: 1935 };
const photo1947: RowPlan = { id: 'aerial_1947_s0012_fl1947_it0018h', type: 'aerial_photograph', year_from: 1947, year_to: 1947 };

/** Plans with names that differ from each other: an edition year and a span, so `plainSourceName` differs. */
const planArb: fc.Arbitrary<RowPlan> = fc
  .tuple(fc.integer({ min: 1880, max: 1990 }), fc.integer({ min: 0, max: 5 }), fc.integer({ min: 1, max: 999 }), fc.constantFrom('fire_insurance_plan', 'aerial_photograph', 'historical_map'))
  .map(([from, span, sheet, type]) => ({
    id: `fip_v3_${from}_${sheet}`,
    type: type as RowPlan['type'],
    year_from: from,
    year_to: from + span,
  }));

describe('firstDrawnText', () => {
  it('words it as the design gives it', () => {
    expect(firstDrawnText(plan1911, plan1935)).toBe('First drawn on the 1911 plan; drawn again on the 1931-35 plan.');
    expect(firstDrawnText(plan1935, photo1947)).toBe('First drawn on the 1931-35 plan; drawn again on the 1947 photograph.');
  });

  it('P4: names the first plan only inside "First drawn on"', () => {
    fc.assert(
      fc.property(planArb, planArb, (y, x) => {
        fc.pre(plainSourceName(y) !== plainSourceName(x));
        const text = firstDrawnText(y, x);
        expect(text.startsWith(FIRST_DRAWN_ON)).toBe(true);
        const yName = plainSourceName(y);
        // Take the "First drawn on <Y>" phrase out: Y's name does not appear again.
        const rest = text.replace(`${FIRST_DRAWN_ON} ${yName}`, '');
        expect(rest).not.toContain(yName);
        // Plan X is named once, after "drawn again on".
        expect(text.endsWith(`drawn again on ${plainSourceName(x)}.`)).toBe(true);
        expect(findBannedWords(text)).toEqual([]);
        expect(text).not.toMatch(/_|fip|aerial_/);
      }),
    );
  });
});

describe('outlineAttribution', () => {
  it('says "read here" when the outline was first read from the row\'s own plan', () => {
    expect(outlineAttribution({ origin: plan1911, rowPlans: [plan1911, plan1911b], clearOn: new Set([plan1911.id]) })).toEqual({ kind: 'read_here', plan: plan1911 });
    // Another sheet of the same edition is the same plan.
    expect(outlineAttribution({ origin: plan1911b, rowPlans: [plan1911], clearOn: new Set([plan1911.id]) }).kind).toBe('read_here');
  });

  it('says "drawn again" only with a clear presence on the row\'s plan', () => {
    expect(outlineAttribution({ origin: plan1911, rowPlans: [plan1935], clearOn: new Set([plan1911.id, plan1935.id]) })).toEqual({
      kind: 'drawn_again',
      first: plan1911,
      again: plan1935,
    });
    expect(outlineAttribution({ origin: plan1911, rowPlans: [plan1935], clearOn: new Set([plan1911.id]) }).kind).toBe('not_shown');
    expect(outlineAttribution({ origin: plan1911, rowPlans: [plan1935], clearOn: new Set() }).kind).toBe('not_shown');
  });

  it('says nothing when the origin is not known', () => {
    expect(outlineAttribution({ origin: undefined, rowPlans: [plan1935], clearOn: new Set([plan1935.id]) }).kind).toBe('not_shown');
  });

  it('P4: for any row plan X and origin Y that differ in name, the origin is named only in the "First drawn on" sentence, and only with a clear presence on X', () => {
    fc.assert(
      fc.property(planArb, planArb, fc.boolean(), (y, x, clearOnX) => {
        fc.pre(plainSourceName(y) !== plainSourceName(x));
        const result = outlineAttribution({ origin: y, rowPlans: [x], clearOn: new Set(clearOnX ? [y.id, x.id] : [y.id]) });
        if (!clearOnX) {
          expect(result).toEqual({ kind: 'not_shown' });
          return;
        }
        expect(result).toEqual({ kind: 'drawn_again', first: y, again: x });
        if (result.kind !== 'drawn_again') return;
        const text = firstDrawnText(result.first, result.again);
        expect(text.replace(`${FIRST_DRAWN_ON} ${plainSourceName(y)}`, '')).not.toContain(plainSourceName(y));
      }),
    );
  });
});

describe('clearPresenceSourceIds', () => {
  const member = (observations: Array<{ source: string; present: boolean; visibility: string }>): Pick<Feature, 'properties'> =>
    ({ properties: { observations } }) as unknown as Pick<Feature, 'properties'>;

  it('counts present and clear observations of every member, and nothing else', () => {
    const ids = clearPresenceSourceIds([
      member([
        { source: 'a', present: true, visibility: 'clear' },
        { source: 'b', present: true, visibility: 'obscured' },
        { source: 'c', present: false, visibility: 'clear' },
        { source: 'd', present: true, visibility: 'not_covered' },
      ]),
      member([{ source: 'e', present: true, visibility: 'clear' }]),
    ]);
    expect([...ids].sort()).toEqual(['a', 'e']);
  });
});
