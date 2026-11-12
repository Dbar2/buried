import { describe, expect, it } from 'vitest';
import { eraOrder, eraRefs } from './eraOrder';
import { ERA_1911, ERA_1935, ERA_1947, ERA_TODAY } from '../evidence/testing/fixtures';

describe('eraOrder (requirement 8.1)', () => {
  it('puts Today at depth 0 and the earliest era last, whatever order the project lists them in', () => {
    const order = eraOrder([ERA_1911, ERA_1935, ERA_1947, ERA_TODAY]);
    expect(order.map((e) => [e.id, e.index])).toEqual([
      ['today', 0],
      ['1947', 1],
      ['1935', 2],
      ['1911', 3],
    ]);
    expect(eraOrder([ERA_TODAY, ERA_1947, ERA_1935, ERA_1911]).map((e) => e.id)).toEqual(order.map((e) => e.id));
  });

  it('breaks a tie on year_to by year_from, then by id', () => {
    const a = { id: 'a', label: 'A', year_from: 1900, year_to: 1914 };
    const b = { id: 'b', label: 'B', year_from: 1911, year_to: 1914 };
    const c = { id: 'c', label: 'C', year_from: 1911, year_to: 1914 };
    expect(eraOrder([a, c, b]).map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the label and years for the Shell', () => {
    const [today] = eraOrder([ERA_1911, ERA_TODAY]);
    expect(today).toEqual({ id: 'today', index: 0, label: 'Today', yearFrom: 2026, yearTo: 2026 });
  });

  it('sends the Player only ids and indexes, never years', () => {
    const refs = eraRefs(eraOrder([ERA_1911, ERA_TODAY]));
    expect(refs).toEqual([
      { id: 'today', index: 0 },
      { id: '1911', index: 1 },
    ]);
    for (const ref of refs) expect(Object.keys(ref).sort()).toEqual(['id', 'index']);
  });
});
