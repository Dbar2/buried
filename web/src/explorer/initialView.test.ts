import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { featuresForEra } from '../evidence';
import type { EraFeatureList } from '../evidence';
import { ERA_1911, P1911, makeCollection, makeFeature, obs, showcaseSources } from '../evidence/testing/fixtures';
import type { Drape } from './drapes';
import { INITIAL_VIEW_MARGIN_M, INITIAL_VIEW_MIN_M, initialView } from './initialView';

const sources = showcaseSources();
const origin = () => [obs(P1911, true, 'clear', 'origin')];
const BOUNDS = { minE: 631900, minN: 4834400, maxE: 633200, maxN: 4835600 };

function listOf(...placements: { at: [number, number]; size?: [number, number]; kind?: 'building' | 'water' | 'land_use' }[]): EraFeatureList {
  const features = placements.map((p, i) => makeFeature(P1911, origin(), { seq: i + 1, at: p.at, size: p.size ?? [10, 8], kind: p.kind }));
  return featuresForEra([makeCollection(P1911, features)], sources, ERA_1911);
}

function drapeAt(e0: number, n0: number, e1: number, n1: number): Drape {
  return {
    sourceId: 'fip_v3_1911_229',
    url: '/data/tiles/fip_v3_1911_229.jpg',
    corners: { topLeft: [e0, n1], topRight: [e1, n1], bottomRight: [e1, n0], bottomLeft: [e0, n0] },
    widthPx: 100,
    heightPx: 100,
  };
}

describe('initialView (design.md "Initial view")', () => {
  it('frames one feature with the margin, widened to the minimum', () => {
    const view = initialView([listOf({ at: [632500, 4835000], size: [10, 8] })], [], BOUNDS);
    // 10 x 8 m grown by 60 m each side is 130 x 128 m, so both directions widen to 200 m about the centre.
    expect(view.maxE - view.minE).toBeCloseTo(INITIAL_VIEW_MIN_M, 6);
    expect(view.maxN - view.minN).toBeCloseTo(INITIAL_VIEW_MIN_M, 6);
    expect((view.minE + view.maxE) / 2).toBeCloseTo(632505, 6);
    expect((view.minN + view.maxN) / 2).toBeCloseTo(4835004, 6);
  });

  it('takes the union of the features of several eras', () => {
    const a = listOf({ at: [632000, 4834800], size: [100, 100] });
    const b = listOf({ at: [632600, 4835300], size: [100, 100] });
    const view = initialView([a, b], [], BOUNDS);
    expect(view.minE).toBe(632000 - INITIAL_VIEW_MARGIN_M);
    expect(view.maxE).toBe(632700 + INITIAL_VIEW_MARGIN_M);
    expect(view.minN).toBe(4834800 - INITIAL_VIEW_MARGIN_M);
    expect(view.maxN).toBe(4835400 + INITIAL_VIEW_MARGIN_M);
  });

  it('ignores land use, which the Player is never sent', () => {
    const view = initialView(
      [listOf({ at: [632500, 4835000], size: [100, 100] }, { at: [633000, 4835500], size: [100, 100], kind: 'land_use' })],
      [],
      BOUNDS,
    );
    expect(view.maxE).toBe(632600 + INITIAL_VIEW_MARGIN_M);
  });

  it('with no features frames the drape corners', () => {
    const view = initialView([], [drapeAt(632000, 4834600, 632800, 4835300)], BOUNDS);
    expect(view).toEqual({
      minE: 632000 - INITIAL_VIEW_MARGIN_M,
      minN: 4834600 - INITIAL_VIEW_MARGIN_M,
      maxE: 632800 + INITIAL_VIEW_MARGIN_M,
      maxN: 4835300 + INITIAL_VIEW_MARGIN_M,
    });
  });

  it('frames the plates\' map areas with 15 per cent of their size on each side, centred', () => {
    const ring = [
      [632312, 4835087],
      [632596, 4835177],
      [632644, 4834832],
      [632416, 4834760],
      [632312, 4835087],
    ];
    // Features and drapes are ignored when a map area exists.
    const view = initialView([listOf({ at: [632000, 4834500], size: [10, 10] })], [drapeAt(632000, 4834500, 633000, 4835500)], BOUNDS, [ring]);
    const w = 632644 - 632312;
    const h = 4835177 - 4834760;
    expect(view.minE).toBeCloseTo(632312 - 0.15 * w, 6);
    expect(view.maxE).toBeCloseTo(632644 + 0.15 * w, 6);
    expect(view.minN).toBeCloseTo(4834760 - 0.15 * h, 6);
    expect(view.maxN).toBeCloseTo(4835177 + 0.15 * h, 6);
    expect((view.minE + view.maxE) / 2).toBeCloseTo((632312 + 632644) / 2, 6);
  });

  it('with an empty Era list and no drapes frames the project bounds', () => {
    const empty = featuresForEra([], sources, ERA_1911);
    expect(initialView([empty], [], BOUNDS)).toEqual(BOUNDS);
  });

  it('with nothing at all frames the project bounds', () => {
    expect(initialView([], [], BOUNDS)).toEqual(BOUNDS);
  });

  it('clips a frame that reaches past the project bounds', () => {
    const view = initialView([listOf({ at: [631910, 4834410], size: [10, 10] })], [], BOUNDS);
    expect(view.minE).toBe(BOUNDS.minE);
    expect(view.minN).toBe(BOUNDS.minN);
    expect(view.maxE).toBeGreaterThan(631910);
  });

  it('falls back to the bounds when the content lies wholly outside them', () => {
    const view = initialView([listOf({ at: [640000, 4840000], size: [10, 10] })], [], BOUNDS);
    expect(view).toEqual(BOUNDS);
  });

  it('always returns a non-empty rectangle inside the bounds (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 631000, max: 634000 }), fc.integer({ min: 4834000, max: 4836000 })), { maxLength: 5 }),
        fc.array(fc.tuple(fc.integer({ min: 631000, max: 634000 }), fc.integer({ min: 4834000, max: 4836000 })), { maxLength: 2 }),
        (points, drapePoints) => {
          const list = listOf(...points.map((at) => ({ at: at as [number, number] })));
          const drapes = drapePoints.map(([e, n]) => drapeAt(e, n, e + 300, n + 300));
          const view = initialView([list], drapes, BOUNDS);
          return (
            view.minE < view.maxE &&
            view.minN < view.maxN &&
            view.minE >= BOUNDS.minE &&
            view.maxE <= BOUNDS.maxE &&
            view.minN >= BOUNDS.minN &&
            view.maxN <= BOUNDS.maxN
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
