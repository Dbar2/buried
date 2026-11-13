/**
 * The Block page's load states (spec 06 design "Load states", requirements 2.2 to 2.4), a pure reducer.
 *
 *   still -press-> waiting -ready-> raising -raised-> raised
 *   still -ready-> ready -press-> raising
 *   any state -failed-> flat; still or waiting -timeout (20 s after first paint)-> flat
 *
 * A press is never lost: `pressed` is set by the first press and never cleared, so a press that arrives
 * before the Player is ready plays when it is, and a press that meets a failure is kept for the Flat
 * sheet, which plays the raise itself (`flatShouldRaise`).
 */

export type RaisePhase = 'still' | 'waiting' | 'ready' | 'raising' | 'raised' | 'flat';

export type RaiseState = { readonly phase: RaisePhase; readonly pressed: boolean };

export type RaiseEvent = 'press' | 'ready' | 'raised' | 'failed' | 'timeout';

export const RAISE_LABEL = 'Raise the past';
export const WAITING_LABEL = 'Lighting the lamp';

/** The Player must be ready this long after first paint, or the Flat sheet takes over (requirement 2.4). */
export const PLAYER_TIMEOUT_MS = 20_000;

export const initialRaiseState: RaiseState = { phase: 'still', pressed: false };

export function raiseReducer(state: RaiseState, event: RaiseEvent): RaiseState {
  switch (event) {
    case 'press':
      if (state.phase === 'still') return { phase: 'waiting', pressed: true };
      if (state.phase === 'ready') return { phase: 'raising', pressed: true };
      return state.pressed ? state : { phase: state.phase, pressed: true };
    case 'ready':
      if (state.phase === 'still') return { phase: 'ready', pressed: false };
      if (state.phase === 'waiting') return { phase: 'raising', pressed: true };
      return state;
    case 'raised':
      return state.phase === 'raising' ? { phase: 'raised', pressed: true } : state;
    case 'failed':
      return { phase: 'flat', pressed: state.pressed };
    case 'timeout':
      return state.phase === 'still' || state.phase === 'waiting' ? { phase: 'flat', pressed: state.pressed } : state;
  }
}

/** The button's label: only `waiting` reads "Lighting the lamp". */
export function raiseLabel(state: RaiseState): string {
  return state.phase === 'waiting' ? WAITING_LABEL : RAISE_LABEL;
}

/** True on the one transition that sends the raise message to the Player. */
export function sendsRaise(prev: RaiseState, next: RaiseState): boolean {
  return prev.phase !== 'raising' && next.phase === 'raising';
}

/** On the Flat sheet, a press (before or after the failure) draws the outlines on. */
export function flatShouldRaise(state: RaiseState): boolean {
  return state.phase === 'flat' && state.pressed;
}
