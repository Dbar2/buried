import { describe, expect, it } from 'vitest';
import { buildDecisionsV2, cleanUse, initialReview, nextUndecided, reviewCounts, reviewOrder, reviewReducer } from './reviewModel';
import type { ReviewAction, ReviewState } from './reviewModel';
import { makeProposal, makeProposals } from './testing';

const AT = '2026-11-13T01:00:00Z';
const run = (state: ReviewState, ...actions: ReviewAction[]) => actions.reduce(reviewReducer, state);

describe('the review order', () => {
  it('goes top to bottom, then left to right', () => {
    const a = makeProposal(1, { x: 500, y: 0, width: 10, height: 10 });
    const b = makeProposal(2, { x: 0, y: 0, width: 10, height: 10 });
    const c = makeProposal(3, { x: 0, y: 900, width: 10, height: 10 });
    expect(reviewOrder([c, a, b])).toEqual([b.id, a.id, c.id]);
  });
});

describe('accepting and rejecting', () => {
  const proposals = makeProposals(5);
  const start = initialReview(proposals);

  it('starts on the first proposal with nothing decided', () => {
    expect(start.current).toBe(start.order[0]);
    expect(reviewCounts(start)).toEqual({ accepted: 0, rejected: 0, undecided: 5 });
  });

  it('records the decision and moves to the next undecided proposal', () => {
    const next = run(start, { type: 'accept', at: AT });
    expect(next.decisions[start.order[0] as string]).toBe('accept');
    expect(next.current).toBe(start.order[1]);
    expect(reviewCounts(next)).toEqual({ accepted: 1, rejected: 0, undecided: 4 });
  });

  it('skips decided proposals when moving on, and wraps', () => {
    const state = run(start, { type: 'select', id: start.order[1] as string }, { type: 'reject', at: AT }, { type: 'select', id: start.order[4] as string });
    expect(nextUndecided(state, start.order[0] as string)).toBe(start.order[2]);
    expect(nextUndecided(state, start.order[4] as string)).toBe(start.order[0]);
  });

  it('stays on the last proposal when everything is decided', () => {
    let state = start;
    for (let i = 0; i < 5; i++) state = run(state, { type: 'accept', at: AT });
    expect(reviewCounts(state)).toEqual({ accepted: 5, rejected: 0, undecided: 0 });
    expect(state.current).toBe(start.order[4]);
  });

  it('lets a person change their mind', () => {
    const state = run(start, { type: 'accept', at: AT }, { type: 'select', id: start.order[0] as string }, { type: 'reject', at: AT });
    expect(reviewCounts(state)).toEqual({ accepted: 0, rejected: 1, undecided: 4 });
  });

  it('ignores a repeated decision and an unknown id', () => {
    const once = run(start, { type: 'accept', at: AT });
    const again = run(once, { type: 'select', id: start.order[0] as string }, { type: 'accept', at: AT });
    expect(again.past).toHaveLength(once.past.length);
    expect(run(start, { type: 'select', id: 'nope' }).current).toBe(start.current);
  });

  it('undoes and redoes, and a new action clears redo', () => {
    const decided = run(start, { type: 'accept', at: AT }, { type: 'reject', at: AT });
    const undone = run(decided, { type: 'undo' });
    expect(reviewCounts(undone)).toEqual({ accepted: 1, rejected: 0, undecided: 4 });
    expect(undone.current).toBe(start.order[1]);
    expect(run(undone, { type: 'redo' }).decisions).toEqual(decided.decisions);
    expect(run(undone, { type: 'accept', at: AT }).future).toHaveLength(0);
    expect(run(start, { type: 'undo' })).toBe(start);
  });

  it('walks next and previous with wrap', () => {
    expect(run(start, { type: 'previous' }).current).toBe(start.order[4]);
    expect(run(start, { type: 'next' }).current).toBe(start.order[1]);
  });
});

describe('the two lettering fields', () => {
  const proposals = makeProposals(2);
  const start = initialReview(proposals);

  it('keeps storeys only as a whole number of at least 1', () => {
    expect(run(start, { type: 'setStoreys', value: 3 }).attributes[start.order[0] as string]).toEqual({ storeys: 3 });
    expect(run(start, { type: 'setStoreys', value: 0 }).attributes).toEqual({});
    expect(run(start, { type: 'setStoreys', value: 2.5 }).attributes).toEqual({});
    expect(run(start, { type: 'setStoreys', value: 3 }, { type: 'setStoreys', value: undefined }).attributes).toEqual({});
  });

  it('trims the use and treats empty as not set', () => {
    expect(cleanUse('  Dwelling   house ')).toBe('Dwelling house');
    expect(cleanUse('   ')).toBeUndefined();
    const state = run(start, { type: 'setUse', value: ' Stores ' });
    expect(state.attributes[start.order[0] as string]).toEqual({ use: 'Stores' });
  });

  it('undoes an attribute change', () => {
    const state = run(start, { type: 'setStoreys', value: 2 }, { type: 'undo' });
    expect(state.attributes).toEqual({});
  });
});

describe('the decisions file v2', () => {
  const proposals = makeProposals(4);
  const start = initialReview(proposals);

  it('writes accepts with the crops their lettering was read from, rejects, and the reviewed area', () => {
    const state = run(
      start,
      { type: 'setStoreys', value: 2 },
      { type: 'setUse', value: 'Stores' },
      { type: 'accept', at: AT },
      { type: 'reject', at: '2026-11-13T01:00:05Z' },
    );
    const file = buildDecisionsV2(state, proposals, 'fip_v3_1911_229', 'Test reviewer', [
      { pixel_polygon: [[0, 0], [100, 0], [100, 100]], at: AT },
    ]);
    expect(file.version).toBe(2);
    expect(file.source).toBe('fip_v3_1911_229');
    expect(file.decisions).toHaveLength(2);
    const [accept, reject] = file.decisions;
    expect(accept).toMatchObject({ type: 'accept', confirmed_by: 'Test reviewer', confirmed_at: AT, attributes: { storeys: 2, use: 'Stores' } });
    expect((accept as { attribute_reads: unknown[] }).attribute_reads).toHaveLength(2);
    expect(reject).toMatchObject({ type: 'reject', confirmed_at: '2026-11-13T01:00:05Z' });
    expect(file.reviewed_areas).toEqual([{ pixel_polygon: [[0, 0], [100, 0], [100, 100]], confirmed_by: 'Test reviewer', confirmed_at: AT }]);
  });

  it('never writes a material or a confidence of its own', () => {
    const state = run(start, { type: 'accept', at: AT });
    const text = JSON.stringify(buildDecisionsV2(state, proposals, 'fip_v3_1911_229', 'R', []));
    expect(text).not.toMatch(/material|confidence|tone/);
  });

  it('leaves out undecided proposals and attributes on rejected ones', () => {
    const state = run(start, { type: 'setStoreys', value: 2 }, { type: 'reject', at: AT });
    const file = buildDecisionsV2(state, proposals, 'fip_v3_1911_229', 'R', []);
    expect(file.decisions).toEqual([{ type: 'reject', proposal_id: start.order[0], confirmed_by: 'R', confirmed_at: AT }]);
  });
});
