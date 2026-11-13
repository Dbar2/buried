/** S7 for this slice: the review reducer keeps one decision per proposal, and undo is exact. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildDecisionsV2, initialReview, reviewCounts, reviewReducer } from './reviewModel';
import type { ReviewAction, ReviewState } from './reviewModel';
import { makeProposals } from './testing';

const AT = '2026-11-13T01:00:00Z';
const proposals = makeProposals(8);
const start = initialReview(proposals);

const actionArb: fc.Arbitrary<ReviewAction> = fc.oneof(
  fc.constant<ReviewAction>({ type: 'accept', at: AT }),
  fc.constant<ReviewAction>({ type: 'reject', at: AT }),
  fc.constant<ReviewAction>({ type: 'next' }),
  fc.constant<ReviewAction>({ type: 'previous' }),
  fc.constant<ReviewAction>({ type: 'undo' }),
  fc.constant<ReviewAction>({ type: 'redo' }),
  fc.integer({ min: -2, max: 12 }).map<ReviewAction>((value) => ({ type: 'setStoreys', value })),
  fc.string({ maxLength: 12 }).map<ReviewAction>((value) => ({ type: 'setUse', value })),
  fc.integer({ min: 0, max: 9 }).map<ReviewAction>((i) => ({ type: 'select', id: start.order[i] ?? 'unknown_id' })),
);
const actionsArb = fc.array(actionArb, { maxLength: 60 });
const play = (actions: ReviewAction[]): ReviewState => actions.reduce(reviewReducer, start);

describe('property S7: one decision per proposal', () => {
  it('every decision is on a known proposal, and the counts add up', () => {
    fc.assert(
      fc.property(actionsArb, (actions) => {
        const state = play(actions);
        const known = new Set(state.order);
        expect(Object.keys(state.decisions).every((id) => known.has(id))).toBe(true);
        expect(Object.keys(state.attributes).every((id) => known.has(id))).toBe(true);
        const c = reviewCounts(state);
        expect(c.accepted + c.rejected + c.undecided).toBe(state.order.length);
        expect(state.current === null || known.has(state.current)).toBe(true);
      }),
    );
  });

  it('the decisions file has each proposal at most once, and only decided ones', () => {
    fc.assert(
      fc.property(actionsArb, (actions) => {
        const state = play(actions);
        const file = buildDecisionsV2(state, proposals, 'fip_v3_1911_229', 'R', []);
        const ids = file.decisions.map((d) => ('proposal_id' in d ? d.proposal_id : ''));
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.length).toBe(Object.keys(state.decisions).length);
      }),
    );
  });

  it('an accepted proposal in the file carries storeys only when a whole number of at least 1 was set', () => {
    fc.assert(
      fc.property(actionsArb, (actions) => {
        const file = buildDecisionsV2(play(actions), proposals, 'fip_v3_1911_229', 'R', []);
        for (const d of file.decisions) {
          if (d.type !== 'accept' || !d.attributes?.storeys) continue;
          expect(Number.isInteger(d.attributes.storeys) && d.attributes.storeys >= 1).toBe(true);
        }
      }),
    );
  });

  it('undo after a decision restores the earlier decisions exactly', () => {
    fc.assert(
      fc.property(actionsArb, fc.constantFrom<'accept' | 'reject'>('accept', 'reject'), (actions, kind) => {
        const before = play(actions);
        const after = reviewReducer(before, { type: kind, at: AT });
        if (after === before) return; // nothing was decided (already that decision)
        const undone = reviewReducer(after, { type: 'undo' });
        expect(undone.decisions).toEqual(before.decisions);
        expect(undone.attributes).toEqual(before.attributes);
        expect(undone.current).toBe(before.current);
      }),
    );
  });
});
