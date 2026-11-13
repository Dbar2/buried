import { describe, expect, it } from 'vitest';
import {
  EMPTY_WHEEL,
  advance,
  clampDepth,
  depthFromPointerY,
  dragTo,
  easeInOutCubic,
  erasToKeep,
  goToEra,
  initialDepthState,
  nearestEra,
  normaliseWheelDelta,
  releaseDrag,
  settledEra,
  stepEra,
  tweenAt,
  tweenDuration,
  wheelIsDig,
  wheelNotches,
} from './depth';

describe('tween (requirement 10.3)', () => {
  it('takes 750 ms for one era and never under 600 or over 900', () => {
    expect(tweenDuration(0, 1)).toBe(750);
    expect(tweenDuration(1, 0)).toBe(750);
    expect(tweenDuration(0, 3)).toBe(900);
    expect(tweenDuration(2.95, 3)).toBe(600);
  });

  it('eases in and out and ends exactly on the target', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
    expect(easeInOutCubic(1)).toBe(1);
    const tween = { from: 1, to: 2, start: 1000, duration: 750 };
    expect(tweenAt(tween, 900)).toBe(1);
    expect(tweenAt(tween, 1000)).toBe(1);
    expect(tweenAt(tween, 1375)).toBeCloseTo(1.5, 12);
    expect(tweenAt(tween, 1750)).toBe(2);
    expect(tweenAt(tween, 99999)).toBe(2);
  });

  it('runs a state from one era to the next and lands on the integer', () => {
    let state = goToEra(initialDepthState(0), 1, 0, 4);
    expect(state.target).toBe(1);
    expect(settledEra(state)).toBeNull();
    state = advance(state, 300);
    expect(state.depth).toBeGreaterThan(0);
    expect(state.depth).toBeLessThan(1);
    expect(settledEra(state)).toBeNull();
    state = advance(state, 750);
    expect(state.depth).toBe(1);
    expect(state.tween).toBeNull();
    expect(settledEra(state)).toBe(1);
  });

  it('retargets from the depth it has reached, and quick presses add up', () => {
    let state = stepEra(initialDepthState(0), 1, 0, 4);
    state = advance(state, 200);
    const mid = state.depth;
    state = stepEra(state, 1, 200, 4);
    expect(state.target).toBe(2);
    expect(state.tween?.from).toBe(mid);
    expect(advance(state, 200 + 900).depth).toBe(2);
  });

  it('stays inside the eras', () => {
    expect(stepEra(initialDepthState(0), -1, 0, 4).target).toBe(0);
    expect(stepEra(initialDepthState(3), 1, 0, 4).target).toBe(3);
    expect(goToEra(initialDepthState(0), 99, 0, 4).target).toBe(3);
    expect(goToEra(initialDepthState(0), 0, 0, 4)).toEqual(initialDepthState(0));
  });
});

describe('drag (design.md "Depth")', () => {
  it('follows the pointer without a tween, then tweens to the nearest era on release', () => {
    let state = dragTo(initialDepthState(0), 1.4, 4);
    expect(state.depth).toBe(1.4);
    expect(state.tween).toBeNull();
    expect(settledEra(state)).toBeNull();
    state = releaseDrag(state, 50, 4);
    expect(state.target).toBe(1);
    expect(state.tween?.from).toBe(1.4);
    expect(advance(state, 50 + 600).depth).toBe(1);
  });

  it('clamps a drag to the ends and ignores a release when nothing is dragged', () => {
    expect(dragTo(initialDepthState(0), -4, 4).depth).toBe(0);
    expect(dragTo(initialDepthState(0), 9, 4).depth).toBe(3);
    const rest = initialDepthState(2);
    expect(releaseDrag(rest, 0, 4)).toBe(rest);
  });

  it('maps a pointer position to a depth between the first and last stop', () => {
    expect(depthFromPointerY(100, 100, 400, 4)).toBe(0);
    expect(depthFromPointerY(250, 100, 400, 4)).toBe(1.5);
    expect(depthFromPointerY(900, 100, 400, 4)).toBe(3);
    expect(depthFromPointerY(0, 100, 400, 4)).toBe(0);
    expect(depthFromPointerY(250, 100, 100, 4)).toBe(0);
    expect(depthFromPointerY(250, 100, 400, 1)).toBe(0);
  });
});

describe('the wheel (requirements 10.2 and 16.5)', () => {
  it('moves one notch for 100 px and carries the remainder', () => {
    let result = wheelNotches(EMPTY_WHEEL, 100, 0, 1000);
    expect(result.notches).toBe(1);
    result = wheelNotches(result.accumulator, -100, 0, 1050);
    expect(result.notches).toBe(-1);
  });

  it('adds up small trackpad deltas until they reach a notch', () => {
    let accumulator = EMPTY_WHEEL;
    let total = 0;
    for (let i = 0; i < 9; i++) {
      const r = wheelNotches(accumulator, 12, 0, 1000 + i * 16);
      accumulator = r.accumulator;
      total += r.notches;
    }
    expect(total).toBe(1);
    expect(accumulator.pixels).toBeCloseTo(8, 9);
  });

  it('forgets a half notch when the gesture pauses', () => {
    const first = wheelNotches(EMPTY_WHEEL, 60, 0, 1000);
    expect(first.notches).toBe(0);
    expect(wheelNotches(first.accumulator, 60, 0, 1000 + 1000).notches).toBe(0);
    expect(wheelNotches(first.accumulator, 60, 0, 1100).notches).toBe(1);
  });

  it('reads lines and pages as pixels, and ignores a non-finite delta', () => {
    expect(normaliseWheelDelta(3, 1)).toBe(120);
    expect(normaliseWheelDelta(1, 2)).toBe(800);
    expect(normaliseWheelDelta(Number.NaN, 0)).toBe(0);
  });

  it('is Dig only without Ctrl, Cmd or Shift', () => {
    expect(wheelIsDig({ ctrlKey: false, metaKey: false, shiftKey: false })).toBe(true);
    expect(wheelIsDig({ ctrlKey: true, metaKey: false, shiftKey: false })).toBe(false);
    expect(wheelIsDig({ ctrlKey: false, metaKey: true, shiftKey: false })).toBe(false);
    expect(wheelIsDig({ ctrlKey: false, metaKey: false, shiftKey: true })).toBe(false);
  });
});

describe('helpers', () => {
  it('clamps and rounds depths', () => {
    expect(clampDepth(-2, 4)).toBe(0);
    expect(clampDepth(7, 4)).toBe(3);
    expect(clampDepth(Number.NaN, 4)).toBe(0);
    expect(clampDepth(2, 0)).toBe(0);
    expect(nearestEra(1.49, 4)).toBe(1);
    expect(nearestEra(1.5, 4)).toBe(2);
  });

  it('keeps the eras around the depth, the Lantern era and the water eras', () => {
    expect(erasToKeep(0, 4)).toEqual([0, 1]);
    expect(erasToKeep(1.5, 4)).toEqual([0, 1, 2]);
    expect(erasToKeep(2, 4)).toEqual([1, 2, 3]);
    expect(erasToKeep(0, 4, 3, [2])).toEqual([0, 1, 2, 3]);
    expect(erasToKeep(0, 4, 9, [-1])).toEqual([0, 1]);
  });
});
