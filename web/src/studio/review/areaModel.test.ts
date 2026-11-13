import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { studioValidator } from '../service/schema';
import { MESSAGES, areaLabel, areaProblems, bannedWarning, ringInside, ringProblem, traceDecision } from './areaModel';
import type { AreaContext, TracedArea, Vertex } from './areaModel';
import { buildDecisionsV2, initialReview, reviewReducer } from './reviewModel';
import { makeProposals } from './testing';

const MAP: Vertex[] = [
  [0, 0],
  [1000, 0],
  [1000, 1000],
  [0, 1000],
];
const PLATE = { x: 0, y: 0, width: 1000, height: 1000 };
const CTX: AreaContext = { mapAreaPx: MAP, plate: PLATE };
const AT = '2026-11-15T10:00:00-05:00';
const SOURCE = 'fip_v3_1911_229';

const square = (x: number, y: number, side: number): Vertex[] => [
  [x, y],
  [x + side, y],
  [x + side, y + side],
  [x, y + side],
];

const area = (over: Partial<TracedArea> = {}): TracedArea => ({
  id: 'area_1',
  ring: square(100, 100, 300),
  use: 'COAL & WOOD YARD',
  read: { x: 120, y: 140, width: 80, height: 20 },
  confidence: 'documented',
  reason: '',
  at: AT,
  ...over,
});

describe('the outline', () => {
  it('accepts a simple polygon of four or more corners', () => {
    expect(ringProblem(square(0, 0, 10))).toBeNull();
    expect(ringProblem([[0, 0], [10, 0], [10, 10], [5, 4], [0, 10]])).toBeNull();
  });

  it('refuses fewer than four corners, as the Service does', () => {
    expect(ringProblem([[0, 0], [10, 0], [10, 10]])).toMatch(/at least 4/);
  });

  it('refuses a repeated corner, a crossing, a spike and a corner off the pixel grid', () => {
    expect(ringProblem([[0, 0], [10, 0], [10, 10], [10, 10]])).toMatch(/same place/);
    expect(ringProblem([[0, 0], [10, 10], [10, 0], [0, 10]])).toMatch(/crosses itself/);
    expect(ringProblem([[0, 0], [10, 0], [20, 0], [5, 0]])).not.toBeNull();
    expect(ringProblem([[0, 0], [10, 0], [10, 10.5], [0, 10]])).toMatch(/whole/);
    expect(ringProblem([[-1, 0], [10, 0], [10, 10], [0, 10]])).toMatch(/non-negative/);
  });

  it('refuses a ring with no area', () => {
    expect(ringProblem([[0, 0], [5, 0], [10, 0], [15, 0]])).not.toBeNull();
  });
});

describe('inside the map area', () => {
  const lShape: Vertex[] = [
    [0, 0],
    [100, 0],
    [100, 40],
    [40, 40],
    [40, 100],
    [0, 100],
  ];
  it('accepts an outline inside, and one that touches the edge', () => {
    expect(ringInside(square(10, 10, 20), lShape)).toBe(true);
    expect(ringInside(square(0, 0, 40), lShape)).toBe(true);
  });
  it('refuses one that leaves it, including across a notch where every corner is inside', () => {
    expect(ringInside(square(90, 10, 30), lShape)).toBe(false);
    expect(ringInside([[10, 10], [90, 10], [90, 90], [10, 90]], lShape)).toBe(false);
  });
});

describe('what stops an area being saved', () => {
  it('passes a complete area', () => {
    expect(areaProblems(area(), CTX)).toEqual([]);
  });
  it('names a missing use, a missing crop and an outline outside the map area', () => {
    expect(areaProblems(area({ use: '  ' }), CTX)).toContain(MESSAGES.noUse);
    expect(areaProblems(area({ read: null }), CTX)).toContain(MESSAGES.noRead);
    expect(areaProblems(area({ ring: square(900, 900, 200) }), CTX)).toContain(MESSAGES.outsideMap);
    expect(areaProblems(area({ read: { x: 990, y: 0, width: 50, height: 10 } }), CTX)).toContain(MESSAGES.readOffPlate);
  });
  it('asks for a reason when the confidence is lowered', () => {
    expect(areaProblems(area({ confidence: 'estimated' }), CTX)).toContain(MESSAGES.noReason);
    expect(areaProblems(area({ confidence: 'estimated', reason: 'The lettering is faint' }), CTX)).toEqual([]);
  });
});

describe('a banned word in the lettering', () => {
  it('warns and does not block', () => {
    expect(bannedWarning('CLEAN WORKS')).toMatch(/Report does not print/);
    expect(areaProblems(area({ use: 'CLEAN WORKS' }), CTX)).toEqual([]);
    expect(bannedWarning('COAL & WOOD YARD')).toBeNull();
    expect(areaLabel({ use: 'CLEAN WORKS' })).not.toMatch(/clean/i);
    expect(areaLabel({ use: 'COAL & WOOD YARD' })).toBe('COAL & WOOD YARD');
  });
});

describe('the trace decision', () => {
  const validate = studioValidator('decisionsV2');
  const file = (a: TracedArea) => buildDecisionsV2({ ...initialReview([]), areas: [a] }, [], SOURCE, 'Test Reviewer', []);

  it('closes the ring and keeps the use as typed, with the crop and the default reason', () => {
    const d = traceDecision(area(), 'Test Reviewer', SOURCE) as { pixel_geometry: { coordinates: number[][][] }; attributes: { use: string }; confidence_reason: string };
    const ring = d.pixel_geometry.coordinates[0] as number[][];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring).toHaveLength(5);
    expect(d.attributes.use).toBe('COAL & WOOD YARD');
    expect(d.confidence_reason).toBe(`Area and use traced by a person from ${SOURCE}`);
  });

  it('passes the Service API Schema', () => {
    expect(validate(file(area())), JSON.stringify(validate.errors)).toBe(true);
  });

  it('is refused for an area without a crop', () => {
    expect(() => traceDecision(area({ read: null }), 'x', SOURCE)).toThrow();
  });
});

describe('saving areas in the review', () => {
  const start = initialReview(makeProposals(2));
  it('saves a good area, replaces it by id, deletes it, and undoes', () => {
    const saved = reviewReducer(start, { type: 'saveArea', area: { ...area(), id: undefined }, context: CTX });
    expect(saved.areas).toHaveLength(1);
    const id = saved.areas[0]?.id as string;
    const edited = reviewReducer(saved, { type: 'saveArea', area: { ...area(), id, use: 'STABLE' }, context: CTX });
    expect(edited.areas.map((a) => a.use)).toEqual(['STABLE']);
    const gone = reviewReducer(edited, { type: 'deleteArea', id });
    expect(gone.areas).toHaveLength(0);
    expect(reviewReducer(gone, { type: 'undo' }).areas).toHaveLength(1);
  });
  it('does not save an area the checks refuse', () => {
    expect(reviewReducer(start, { type: 'saveArea', area: area({ use: '' }), context: CTX })).toBe(start);
    expect(reviewReducer(start, { type: 'saveArea', area: area({ ring: square(900, 900, 200) }), context: CTX })).toBe(start);
  });
  it('never reuses an id after a delete', () => {
    let s = reviewReducer(start, { type: 'saveArea', area: { ...area(), id: undefined }, context: CTX });
    s = reviewReducer(s, { type: 'saveArea', area: { ...area({ use: 'SHOP' }), id: undefined }, context: CTX });
    s = reviewReducer(s, { type: 'deleteArea', id: 'area_1' });
    s = reviewReducer(s, { type: 'saveArea', area: { ...area({ use: 'WORKS' }), id: undefined }, context: CTX });
    expect(s.areas.map((a) => a.id)).toEqual(['area_2', 'area_3']);
  });
});

describe('property: a saved area always passes the Service API Schema and the polygon rules', () => {
  const validate = studioValidator('decisionsV2');
  const rect = fc
    .record({ x: fc.integer({ min: 0, max: 900 }), y: fc.integer({ min: 0, max: 900 }), w: fc.integer({ min: 1, max: 100 }), h: fc.integer({ min: 1, max: 100 }) })
    .map(({ x, y, w, h }): Vertex[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
  const arbitrary = fc.record({
    ring: fc.oneof(rect, fc.array(fc.tuple(fc.integer({ min: -5, max: 1100 }), fc.integer({ min: -5, max: 1100 })), { minLength: 0, maxLength: 7 })),
    use: fc.string({ maxLength: 20 }),
    read: fc.option(fc.record({ x: fc.integer({ min: -5, max: 1000 }), y: fc.integer({ min: -5, max: 1000 }), width: fc.integer({ min: 0, max: 200 }), height: fc.integer({ min: 0, max: 200 }) }), { nil: null }),
    confidence: fc.constantFrom('documented', 'estimated', 'unknown') as fc.Arbitrary<TracedArea['confidence']>,
    reason: fc.string({ maxLength: 12 }),
  });

  it('whatever the reducer keeps validates; whatever it refuses has a named problem', () => {
    fc.assert(
      fc.property(arbitrary, (input) => {
        const candidate = { ...input, ring: input.ring as Vertex[], at: AT };
        const state = reviewReducer(initialReview([]), { type: 'saveArea', area: candidate, context: CTX });
        const problems = areaProblems(candidate, CTX);
        if (problems.length > 0) {
          expect(state.areas).toHaveLength(0);
          return;
        }
        expect(state.areas).toHaveLength(1);
        const file = buildDecisionsV2(state, [], SOURCE, 'Test Reviewer', []);
        expect(validate(file), JSON.stringify(validate.errors)).toBe(true);
        // The ring is closed, whole pixels, inside the map area, and one simple polygon.
        const ring = ((file.decisions[0] as unknown as { pixel_geometry: { coordinates: number[][][] } }).pixel_geometry.coordinates[0] ?? []) as number[][];
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        expect(ring.length - 1).toBeGreaterThanOrEqual(4);
        expect(ringProblem(ring.slice(0, -1) as unknown as Vertex[])).toBeNull();
        expect(ringInside(ring.slice(0, -1) as unknown as Vertex[], MAP)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
