/**
 * The land-use area being traced, before it is saved (spec 04 requirement 24.1), as a pure reducer.
 * Corners are whole plate pixels. Clicking or typing adds them, the outline closes once there are
 * enough, and until it is saved nothing leaves this state. Every action here has a keyboard
 * equivalent in `TracePanel`: this module only holds the state.
 */
import type { Rect } from '../plate/plateView';
import { MIN_CORNERS } from './areaModel';
import type { AreaConfidence, TracedArea, Vertex } from './areaModel';

export type TraceForm = {
  /** The saved area being edited, or null for a new one. */
  editingId: string | null;
  ring: readonly Vertex[];
  closed: boolean;
  use: string;
  read: Rect | null;
  confidence: AreaConfidence;
  reason: string;
};

export type TraceAction =
  | { type: 'start' }
  | { type: 'cancel' }
  | { type: 'edit'; area: TracedArea }
  | { type: 'add'; vertex: Vertex }
  | { type: 'move'; index: number; vertex: Vertex }
  | { type: 'removeLast' }
  | { type: 'removeCorner'; index: number }
  | { type: 'close' }
  | { type: 'reopen' }
  | { type: 'setUse'; value: string }
  | { type: 'setRead'; read: Rect | null }
  | { type: 'setConfidence'; value: AreaConfidence }
  | { type: 'setReason'; value: string };

export const newTrace = (): TraceForm => ({ editingId: null, ring: [], closed: false, use: '', read: null, confidence: 'documented', reason: '' });

export function traceReducer(state: TraceForm | null, action: TraceAction): TraceForm | null {
  if (action.type === 'start') return newTrace();
  if (action.type === 'cancel') return null;
  if (action.type === 'edit') {
    const a = action.area;
    return { editingId: a.id, ring: [...a.ring], closed: true, use: a.use, read: a.read, confidence: a.confidence, reason: a.reason };
  }
  if (state === null) return null;
  switch (action.type) {
    case 'add':
      return state.closed ? state : { ...state, ring: [...state.ring, action.vertex] };
    case 'move':
      return action.index >= 0 && action.index < state.ring.length ? { ...state, ring: state.ring.map((v, i) => (i === action.index ? action.vertex : v)) } : state;
    case 'removeLast':
      // Removing a corner of a closed outline reopens it, so a person can carry on from the last one.
      return state.ring.length === 0 ? state : { ...state, ring: state.ring.slice(0, -1), closed: false };
    case 'removeCorner':
      return action.index >= 0 && action.index < state.ring.length ? { ...state, ring: state.ring.filter((_, i) => i !== action.index), closed: state.closed && state.ring.length - 1 >= MIN_CORNERS } : state;
    case 'close':
      return state.ring.length >= MIN_CORNERS ? { ...state, closed: true } : state;
    case 'reopen':
      return { ...state, closed: false };
    case 'setUse':
      return { ...state, use: action.value };
    case 'setRead':
      return { ...state, read: action.read };
    case 'setConfidence':
      return { ...state, confidence: action.value };
    case 'setReason':
      return { ...state, reason: action.value };
  }
}
