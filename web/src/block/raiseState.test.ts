import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  flatShouldRaise,
  initialRaiseState,
  raiseLabel,
  raiseReducer,
  RAISE_LABEL,
  sendsRaise,
  WAITING_LABEL,
} from './raiseState';
import type { RaiseEvent, RaiseState } from './raiseState';

const events = fc.array(fc.constantFrom<RaiseEvent>('press', 'ready', 'raised', 'failed', 'timeout'), { maxLength: 30 });

function run(seq: readonly RaiseEvent[]): RaiseState[] {
  const states = [initialRaiseState];
  for (const event of seq) states.push(raiseReducer(states.at(-1)!, event));
  return states;
}

describe('raiseState', () => {
  it('follows the documented paths', () => {
    expect(run(['press', 'ready', 'raised']).map((s) => s.phase)).toEqual(['still', 'waiting', 'raising', 'raised']);
    expect(run(['ready', 'press', 'raised']).map((s) => s.phase)).toEqual(['still', 'ready', 'raising', 'raised']);
    expect(run(['press', 'failed']).at(-1)).toEqual({ phase: 'flat', pressed: true });
    expect(run(['timeout']).at(-1)).toEqual({ phase: 'flat', pressed: false });
  });

  it('ignores a timeout once the Player is ready', () => {
    expect(run(['ready', 'timeout']).at(-1)?.phase).toBe('ready');
    expect(run(['press', 'ready', 'timeout']).at(-1)?.phase).toBe('raising');
  });

  it('keeps a press made on the Flat sheet', () => {
    const flat = run(['timeout', 'press']).at(-1) as RaiseState;
    expect(flat).toEqual({ phase: 'flat', pressed: true });
    expect(flatShouldRaise(flat)).toBe(true);
    expect(flatShouldRaise(initialRaiseState)).toBe(false);
  });

  // P5
  it('P5: never loses a press, and only waiting reads "Lighting the lamp"', () => {
    fc.assert(
      fc.property(events, (seq) => {
        const states = run(seq);
        let pressedSeen = false;
        let raises = 0;
        states.forEach((state, i) => {
          if (i > 0 && seq[i - 1] === 'press') pressedSeen = true;
          // A press is recorded at once and never cleared.
          expect(state.pressed).toBe(pressedSeen);
          if (state.phase === 'still' || state.phase === 'ready') expect(state.pressed).toBe(false);
          if (state.phase === 'waiting') expect(state.pressed).toBe(true);
          // Only waiting reads "Lighting the lamp".
          expect(raiseLabel(state)).toBe(state.phase === 'waiting' ? WAITING_LABEL : RAISE_LABEL);
          if (i > 0 && sendsRaise(states[i - 1]!, state)) raises += 1;
        });
        // One raise message at most.
        expect(raises).toBeLessThanOrEqual(1);
        // A press and a ready, in either order, with no failure, always reach the raise.
        const last = states.at(-1)!;
        const failed = seq.includes('failed') || seq.includes('timeout');
        if (!failed && seq.includes('press') && seq.includes('ready')) {
          expect(['raising', 'raised']).toContain(last.phase);
        }
        // A failure always ends on the Flat sheet, with the press kept.
        if (seq.includes('failed')) {
          expect(last.phase).toBe('flat');
          expect(last.pressed).toBe(seq.includes('press'));
        }
      }),
      { numRuns: 500 },
    );
  });
});
