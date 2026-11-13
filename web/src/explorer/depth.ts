/**
 * Dig: the Shell owns the depth (requirement 10.1). Pure functions, no DOM and no clock of their own:
 * every function that depends on time takes `now` in milliseconds, so the property tests (E7) can run
 * any sequence of inputs.
 *
 * Depth `d` is a number in [0, count - 1]. 0 is Today, an integer is an era, a fraction is a
 * transition between two eras (design.md "Depth").
 */

/** Time per era step, design.md "Depth". */
export const ERA_TRANSITION_MS = 750;
/** Requirement 10.3: a transition takes between these two durations. */
export const MIN_TRANSITION_MS = 600;
export const MAX_TRANSITION_MS = 900;
/** One notch of the wheel, in normalised pixels. */
export const WHEEL_NOTCH_PX = 100;
/** A wheel gesture that pauses this long starts again from zero. */
export const WHEEL_IDLE_MS = 250;

export type Tween = { from: number; to: number; start: number; duration: number };

export type DepthState = {
  /** The depth now: what the Player is told. */
  depth: number;
  /** The era index the depth is heading for (equal to `depth` at rest). */
  target: number;
  tween: Tween | null;
  /** The gauge is being dragged: the depth follows the pointer. */
  dragging: boolean;
};

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high);

/** The era indexes are 0 .. count - 1. With no eras the only depth is 0. */
export function clampDepth(depth: number, count: number): number {
  if (!Number.isFinite(depth)) return 0;
  return clamp(depth, 0, Math.max(count - 1, 0));
}

/** The era a depth is nearest to; halfway rounds toward the deeper era. */
export function nearestEra(depth: number, count: number): number {
  return Math.round(clampDepth(depth, count));
}

export function easeInOutCubic(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** 750 ms per era step, never under 600 ms or over 900 ms in total (requirement 10.3). */
export function tweenDuration(from: number, to: number): number {
  return clamp(ERA_TRANSITION_MS * Math.abs(to - from), MIN_TRANSITION_MS, MAX_TRANSITION_MS);
}

/** The depth of a tween at `now`: eased, never outside [from, to], and exactly `to` once it has run. */
export function tweenAt(tween: Tween, now: number): number {
  const t = (now - tween.start) / tween.duration;
  if (!(t < 1)) return tween.to;
  if (!(t > 0)) return tween.from;
  const value = tween.from + (tween.to - tween.from) * easeInOutCubic(t);
  return clamp(value, Math.min(tween.from, tween.to), Math.max(tween.from, tween.to));
}

export function initialDepthState(index = 0): DepthState {
  return { depth: index, target: index, tween: null, dragging: false };
}

/** True when the depth is exactly an era and nothing is moving it. */
export function settledEra(state: DepthState): number | null {
  return state.tween === null && !state.dragging && Number.isInteger(state.depth) ? state.depth : null;
}

/** Start moving to era `index` (clamped to the eras) from wherever the depth is now. */
export function goToEra(state: DepthState, index: number, now: number, count: number): DepthState {
  const target = nearestEra(index, count);
  if (state.tween === null && !state.dragging && state.depth === target) return { ...state, target };
  const from = clampDepth(state.depth, count);
  if (from === target) return { depth: target, target, tween: null, dragging: false };
  return {
    depth: from,
    target,
    tween: { from, to: target, start: now, duration: tweenDuration(from, target) },
    dragging: false,
  };
}

/** Move the target by whole eras, counted from where the depth is heading (so quick presses add up). */
export function stepEra(state: DepthState, delta: number, now: number, count: number): DepthState {
  return goToEra(state, state.target + Math.trunc(delta), now, count);
}

/** The gauge is dragged: the depth follows the pointer at once, with no tween. */
export function dragTo(state: DepthState, depth: number, count: number): DepthState {
  const d = clampDepth(depth, count);
  return { depth: d, target: nearestEra(d, count), tween: null, dragging: true };
}

/** The drag ends: tween to the nearest era. */
export function releaseDrag(state: DepthState, now: number, count: number): DepthState {
  if (!state.dragging) return state;
  return goToEra({ ...state, dragging: false }, nearestEra(state.depth, count), now, count);
}

/** Advance a running tween to `now`. At the end the depth is exactly the target era. */
export function advance(state: DepthState, now: number): DepthState {
  const tween = state.tween;
  if (tween === null) return state;
  const depth = tweenAt(tween, now);
  if (depth === tween.to) return { depth: tween.to, target: tween.to, tween: null, dragging: false };
  return { ...state, depth };
}

/** Wheel input normalised to pixels. `deltaMode` is the DOM's: 0 pixels, 1 lines, 2 pages. */
export function normaliseWheelDelta(deltaY: number, deltaMode: number): number {
  if (!Number.isFinite(deltaY)) return 0;
  if (deltaMode === 1) return deltaY * 40;
  if (deltaMode === 2) return deltaY * 800;
  return deltaY;
}

export type WheelAccumulator = { pixels: number; lastAt: number };

export const EMPTY_WHEEL: WheelAccumulator = { pixels: 0, lastAt: Number.NEGATIVE_INFINITY };

/**
 * One wheel event. Each 100 px is one notch: a mouse wheel moves one era per click, and a trackpad's
 * small deltas add up until they reach 100. Positive `deltaY` (scrolling down) is deeper. The notches
 * returned are whole numbers; the remainder stays in the accumulator until the gesture pauses.
 */
export function wheelNotches(
  accumulator: WheelAccumulator,
  deltaY: number,
  deltaMode: number,
  now: number,
): { notches: number; accumulator: WheelAccumulator } {
  const carried = now - accumulator.lastAt > WHEEL_IDLE_MS ? 0 : accumulator.pixels;
  const total = carried + normaliseWheelDelta(deltaY, deltaMode);
  const notches = Math.trunc(total / WHEEL_NOTCH_PX);
  return { notches, accumulator: { pixels: total - notches * WHEEL_NOTCH_PX, lastAt: now } };
}

/** True for a wheel event that Dig takes: no Ctrl, Cmd or Shift (those zoom; requirement 16.5). */
export function wheelIsDig(modifiers: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): boolean {
  return !modifiers.ctrlKey && !modifiers.metaKey && !modifiers.shiftKey;
}

/**
 * Which eras the Shell keeps loaded (design.md "Depth"): the ones either side of the depth, the one
 * below and the one above the floor, the Lantern era and the water eras, inside 0 .. count - 1.
 */
export function erasToKeep(depth: number, count: number, lanternEra: number | null = null, waterEras: readonly number[] = []): number[] {
  const d = clampDepth(depth, count);
  const low = Math.floor(d);
  const wanted = [low, Math.ceil(d), low - 1, low + 1, ...(lanternEra === null ? [] : [lanternEra]), ...waterEras];
  return [...new Set(wanted.filter((i) => Number.isInteger(i) && i >= 0 && i < count))].sort((a, b) => a - b);
}

/**
 * The depth a pointer at `y` means on the gauge, from the vertical centres of the first and last
 * stops. Between the stops it is linear; beyond them it stops at the ends.
 */
export function depthFromPointerY(y: number, firstCentre: number, lastCentre: number, count: number): number {
  if (count <= 1 || !(lastCentre > firstCentre)) return 0;
  return clampDepth(((y - firstCentre) / (lastCentre - firstCentre)) * (count - 1), count);
}
