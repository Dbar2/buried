/**
 * [PBT] E7 (spec 03 task 3.2, requirement 10.3): the depth stays in range and lands on eras.
 *
 * Any sequence of key steps, era jumps, wheel events, drags, releases and clock ticks leaves the
 * depth inside [0, count - 1] at every moment, and once a tween has run its full duration the depth is
 * exactly the integer era it was heading for.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_WHEEL,
  MAX_TRANSITION_MS,
  advance,
  dragTo,
  erasToKeep,
  goToEra,
  initialDepthState,
  releaseDrag,
  settledEra,
  stepEra,
  tweenAt,
  tweenDuration,
  wheelNotches,
} from './depth';
import type { DepthState, WheelAccumulator } from './depth';

type Op =
  | { kind: 'step'; delta: number }
  | { kind: 'go'; index: number }
  | { kind: 'wheel'; deltaY: number; deltaMode: number }
  | { kind: 'drag'; depth: number }
  | { kind: 'release' }
  | { kind: 'tick' };

const op: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ kind: fc.constant('step' as const), delta: fc.integer({ min: -6, max: 6 }) }),
  fc.record({ kind: fc.constant('go' as const), index: fc.integer({ min: -3, max: 9 }) }),
  fc.record({ kind: fc.constant('wheel' as const), deltaY: fc.integer({ min: -400, max: 400 }), deltaMode: fc.constantFrom(0, 1, 2) }),
  fc.record({ kind: fc.constant('drag' as const), depth: fc.double({ min: -3, max: 9, noNaN: true }) }),
  fc.record({ kind: fc.constant('release' as const) }),
  fc.record({ kind: fc.constant('tick' as const) }),
);

const script = fc.array(fc.tuple(op, fc.integer({ min: 0, max: 1200 })), { minLength: 1, maxLength: 60 });

describe('E7 depth stays in range and lands on eras', () => {
  it('stays in [0, count - 1] under any inputs, and a finished tween is exactly an integer era', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), fc.integer({ min: 0, max: 7 }), script, (count, start, steps) => {
        let state: DepthState = initialDepthState(Math.min(start, count - 1));
        let wheel: WheelAccumulator = EMPTY_WHEEL;
        let now = 0;
        for (const [action, wait] of steps) {
          now += wait;
          state = advance(state, now);
          switch (action.kind) {
            case 'step':
              state = stepEra(state, action.delta, now, count);
              break;
            case 'go':
              state = goToEra(state, action.index, now, count);
              break;
            case 'wheel': {
              const r = wheelNotches(wheel, action.deltaY, action.deltaMode, now);
              wheel = r.accumulator;
              if (r.notches !== 0) state = stepEra(state, r.notches, now, count);
              break;
            }
            case 'drag':
              state = dragTo(state, action.depth, count);
              break;
            case 'release':
              state = releaseDrag(state, now, count);
              break;
            case 'tick':
              break;
          }
          expect(state.depth).toBeGreaterThanOrEqual(0);
          expect(state.depth).toBeLessThanOrEqual(count - 1);
          expect(Number.isInteger(state.target)).toBe(true);
          expect(state.target).toBeGreaterThanOrEqual(0);
          expect(state.target).toBeLessThanOrEqual(count - 1);
        }
        // Let everything finish: a drag still held ends, then the tween runs out.
        state = releaseDrag(state, now, count);
        state = advance(state, now + MAX_TRANSITION_MS + 1);
        expect(Number.isInteger(state.depth)).toBe(true);
        expect(state.depth).toBe(state.target);
        expect(settledEra(state)).toBe(state.target);
      }),
      { numRuns: 300 },
    );
  });

  it('a tween never leaves the span between its ends, never goes backwards, and lasts 600 to 900 ms', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 7, noNaN: true }),
        fc.integer({ min: 0, max: 7 }),
        fc.array(fc.integer({ min: 0, max: 2000 }), { minLength: 2, maxLength: 20 }),
        (from, to, times) => {
          const duration = tweenDuration(from, to);
          expect(duration).toBeGreaterThanOrEqual(600);
          expect(duration).toBeLessThanOrEqual(900);
          const tween = { from, to, start: 0, duration };
          const low = Math.min(from, to);
          const high = Math.max(from, to);
          let last = from;
          for (const t of [...times].sort((a, b) => a - b)) {
            const d = tweenAt(tween, t);
            expect(d).toBeGreaterThanOrEqual(low);
            expect(d).toBeLessThanOrEqual(high);
            // monotone toward the target
            expect(Math.abs(d - to)).toBeLessThanOrEqual(Math.abs(last - to) + 1e-12);
            last = d;
          }
          expect(tweenAt(tween, duration)).toBe(to);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('keeps only eras that exist, and always the two around the depth', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.double({ min: 0, max: 7, noNaN: true }),
        fc.option(fc.integer({ min: -2, max: 10 }), { nil: null }),
        fc.array(fc.integer({ min: -2, max: 10 }), { maxLength: 4 }),
        (count, depth, lantern, water) => {
          const kept = erasToKeep(depth, count, lantern, water);
          for (const i of kept) {
            expect(i).toBeGreaterThanOrEqual(0);
            expect(i).toBeLessThan(count);
          }
          const d = Math.min(depth, count - 1);
          expect(kept).toContain(Math.floor(d));
          expect(kept).toContain(Math.ceil(d));
          expect(new Set(kept).size).toBe(kept.length);
        },
      ),
      { numRuns: 200 },
    );
  });
});
