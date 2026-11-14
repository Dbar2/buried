/**
 * The walk page's state (spec 07 requirement 7.1): intro, walking, exhibit, paused. A pure reducer over what the Player
 * reports; the page draws whatever `walkPhase` says. Nothing here sends a message.
 */

export type WalkPhase = 'intro' | 'walking' | 'exhibit' | 'paused' | 'unavailable';

export type WalkPose = { east: number; north: number; yawDeg: number };

export type WalkState = {
  /** The Player has reported `ready`: the button can be pressed. */
  playerReady: boolean;
  /** "Step inside" was pressed. */
  entered: boolean;
  /** `walk/ready`: the corner is built. */
  built: boolean;
  /** `walk/pointerLock`. */
  locked: boolean;
  /** `walk/nearPlaque`. */
  nearPlaque: string | null;
  /** `walk/exhibit`, until the panel is closed. */
  exhibit: string | null;
  pose: WalkPose | null;
  /** Metres walked since entering: the hint fades once this passes `HINT_FADES_AFTER_M`. */
  walkedM: number;
  /** Why the walk cannot be shown, or null. */
  unavailable: string | null;
};

export const INITIAL_WALK_STATE: WalkState = {
  playerReady: false,
  entered: false,
  built: false,
  locked: false,
  nearPlaque: null,
  exhibit: null,
  pose: null,
  walkedM: 0,
  unavailable: null,
};

export type WalkEvent =
  | { type: 'playerReady' }
  | { type: 'enter' }
  | { type: 'built' }
  | { type: 'lock'; locked: boolean }
  | { type: 'near'; slug: string | null }
  | { type: 'exhibit'; slug: string }
  | { type: 'closeExhibit' }
  | { type: 'pose'; pose: WalkPose }
  | { type: 'unavailable'; reason: string };

/** The hint "W A S D to walk..." fades after the first few steps. */
export const HINT_FADES_AFTER_M = 5;

/** A jump this long between two reports is a teleport, not walking. */
const MAX_STEP_M = 30;

export function walkReducer(state: WalkState, event: WalkEvent): WalkState {
  switch (event.type) {
    case 'playerReady':
      return { ...state, playerReady: true };
    case 'enter':
      return { ...state, entered: true };
    case 'built':
      return { ...state, built: true };
    case 'lock':
      return { ...state, locked: event.locked };
    case 'near':
      return { ...state, nearPlaque: event.slug };
    case 'exhibit':
      return { ...state, exhibit: event.slug, nearPlaque: null };
    case 'closeExhibit':
      return { ...state, exhibit: null };
    case 'pose': {
      const previous = state.pose;
      let walked = state.walkedM;
      if (previous) {
        const step = Math.hypot(event.pose.east - previous.east, event.pose.north - previous.north);
        if (step <= MAX_STEP_M) walked += step;
      }
      return { ...state, pose: event.pose, walkedM: walked };
    }
    case 'unavailable':
      return { ...state, unavailable: event.reason };
  }
}

export function walkPhase(state: WalkState): WalkPhase {
  if (state.unavailable !== null) return 'unavailable';
  if (!state.entered || !state.built) return 'intro';
  if (state.exhibit !== null) return 'exhibit';
  return state.locked ? 'walking' : 'paused';
}

/** The intro button: "Lighting the lamp" while the Player loads or the corner is being built, else "Step inside". */
export function introButtonLabel(state: WalkState): string {
  return state.playerReady && !state.entered ? 'Step inside' : 'Lighting the lamp';
}

export function introButtonEnabled(state: WalkState): boolean {
  return state.playerReady && !state.entered && state.unavailable === null;
}

export function hintVisible(state: WalkState): boolean {
  return walkPhase(state) === 'walking' && state.walkedM < HINT_FADES_AFTER_M;
}

export const PLAQUE_PROMPT = 'Read the plaque: click or E';
export const WALK_HINT = 'W A S D to walk. Mouse to look. Esc to pause.';

export function promptVisible(state: WalkState): boolean {
  return walkPhase(state) === 'walking' && state.nearPlaque !== null;
}
