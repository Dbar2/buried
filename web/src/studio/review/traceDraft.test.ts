import { describe, expect, it } from 'vitest';
import type { TracedArea, Vertex } from './areaModel';
import { traceReducer } from './traceDraft';
import type { TraceAction, TraceForm } from './traceDraft';

const run = (...actions: TraceAction[]): TraceForm | null => actions.reduce<TraceForm | null>(traceReducer, null);
const add = (x: number, y: number): TraceAction => ({ type: 'add', vertex: [x, y] });

describe('the trace draft', () => {
  it('does nothing before a trace is started', () => {
    expect(run(add(1, 1))).toBeNull();
  });

  it('collects corners, closes only from four, and then takes no more', () => {
    expect(run({ type: 'start' }, add(0, 0), add(10, 0), add(10, 10), { type: 'close' })?.closed).toBe(false);
    const closed = run({ type: 'start' }, add(0, 0), add(10, 0), add(10, 10), add(0, 10), { type: 'close' }, add(5, 5));
    expect(closed?.closed).toBe(true);
    expect(closed?.ring).toHaveLength(4);
  });

  it('removes the last corner, which reopens a closed outline', () => {
    const s = run({ type: 'start' }, add(0, 0), add(10, 0), add(10, 10), add(0, 10), { type: 'close' }, { type: 'removeLast' });
    expect(s?.closed).toBe(false);
    expect(s?.ring).toEqual([[0, 0], [10, 0], [10, 10]]);
  });

  it('moves a corner and ignores a corner that is not there', () => {
    const s = run({ type: 'start' }, add(0, 0), add(10, 0), { type: 'move', index: 1, vertex: [12, 3] }, { type: 'move', index: 9, vertex: [1, 1] });
    expect(s?.ring).toEqual([[0, 0], [12, 3]]);
  });

  it('cancels', () => {
    expect(run({ type: 'start' }, add(0, 0), { type: 'cancel' })).toBeNull();
  });

  it('opens a saved area for editing with its outline closed and its crop kept', () => {
    const ring: Vertex[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const area: TracedArea = { id: 'area_3', ring, use: 'STABLE', read: { x: 1, y: 2, width: 3, height: 4 }, confidence: 'estimated', reason: 'Faint', at: '2026-11-15T10:00:00-05:00' };
    const s = run({ type: 'edit', area });
    expect(s).toMatchObject({ editingId: 'area_3', closed: true, use: 'STABLE', confidence: 'estimated', reason: 'Faint', read: area.read });
  });
});
