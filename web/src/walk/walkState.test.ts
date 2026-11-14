import { describe, expect, it } from 'vitest';
import { INITIAL_WALK_STATE, HINT_FADES_AFTER_M, hintVisible, introButtonEnabled, introButtonLabel, promptVisible, walkPhase, walkReducer } from './walkState';
import type { WalkEvent, WalkState } from './walkState';

const run = (...events: WalkEvent[]): WalkState => events.reduce(walkReducer, INITIAL_WALK_STATE);

const entered = (): WalkState => run({ type: 'playerReady' }, { type: 'enter' }, { type: 'built' }, { type: 'lock', locked: true });

describe('the intro', () => {
  it('starts on the intro and says "Lighting the lamp" while the Player loads', () => {
    expect(walkPhase(INITIAL_WALK_STATE)).toBe('intro');
    expect(introButtonLabel(INITIAL_WALK_STATE)).toBe('Lighting the lamp');
    expect(introButtonEnabled(INITIAL_WALK_STATE)).toBe(false);
  });

  it('offers "Step inside" once the Player is ready', () => {
    const ready = run({ type: 'playerReady' });
    expect(introButtonLabel(ready)).toBe('Step inside');
    expect(introButtonEnabled(ready)).toBe(true);
  });

  it('goes back to "Lighting the lamp" while the corner is being built, and stays on the intro until it is', () => {
    const pressed = run({ type: 'playerReady' }, { type: 'enter' });
    expect(walkPhase(pressed)).toBe('intro');
    expect(introButtonLabel(pressed)).toBe('Lighting the lamp');
    expect(introButtonEnabled(pressed)).toBe(false);
  });
});

describe('walking, exhibit and paused', () => {
  it('walks once the corner is built and the pointer is locked', () => {
    expect(walkPhase(entered())).toBe('walking');
  });

  it('is paused when the pointer is released with no exhibit open', () => {
    expect(walkPhase(walkReducer(entered(), { type: 'lock', locked: false }))).toBe('paused');
  });

  it('shows the exhibit when a plaque is opened, even though the pointer was released for it', () => {
    const open = [{ type: 'exhibit', slug: 'overall-factory' }, { type: 'lock', locked: false }] as const;
    const state = open.reduce<WalkState>(walkReducer, entered());
    expect(walkPhase(state)).toBe('exhibit');
    expect(state.exhibit).toBe('overall-factory');
  });

  it('returns to walking when the exhibit closes and the pointer is locked again', () => {
    const open = run({ type: 'playerReady' }, { type: 'enter' }, { type: 'built' }, { type: 'exhibit', slug: 'bank' });
    const closed = [{ type: 'closeExhibit' }, { type: 'lock', locked: true }] as const;
    expect(walkPhase(closed.reduce<WalkState>(walkReducer, open))).toBe('walking');
  });

  it('is unavailable when the Player cannot run, whatever else is true', () => {
    const state = walkReducer(entered(), { type: 'unavailable', reason: 'no build' });
    expect(walkPhase(state)).toBe('unavailable');
    expect(state.unavailable).toBe('no build');
  });
});

describe('the hint and the prompt', () => {
  it('shows the hint at first and fades it after the first few steps', () => {
    let state = entered();
    state = walkReducer(state, { type: 'pose', pose: { east: 0, north: 0, yawDeg: 0 } });
    expect(hintVisible(state)).toBe(true);
    for (let i = 1; i <= 8; i += 1) state = walkReducer(state, { type: 'pose', pose: { east: i, north: 0, yawDeg: 0 } });
    expect(state.walkedM).toBeGreaterThan(HINT_FADES_AFTER_M);
    expect(hintVisible(state)).toBe(false);
  });

  it('does not count a teleport as walking', () => {
    let state = entered();
    state = walkReducer(state, { type: 'pose', pose: { east: 0, north: 0, yawDeg: 0 } });
    state = walkReducer(state, { type: 'pose', pose: { east: 100, north: 100, yawDeg: 0 } });
    expect(state.walkedM).toBe(0);
  });

  it('shows the plaque prompt only while walking and near one', () => {
    const near = walkReducer(entered(), { type: 'near', slug: 'bank' });
    expect(promptVisible(near)).toBe(true);
    expect(promptVisible(walkReducer(near, { type: 'near', slug: null }))).toBe(false);
    expect(promptVisible(walkReducer(near, { type: 'lock', locked: false }))).toBe(false);
  });

  it('clears the prompt when an exhibit opens', () => {
    const state = walkReducer(walkReducer(entered(), { type: 'near', slug: 'bank' }), { type: 'exhibit', slug: 'bank' });
    expect(state.nearPlaque).toBeNull();
  });
});
