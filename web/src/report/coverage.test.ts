import { describe, expect, it } from 'vitest';
import type { FeatureCollection, PolygonalGeometry } from '../evidence';
import { aerialCoversLot, lotCoverage, plateCoverages } from './coverage';
import { LOT_POSITION_ERROR_M } from './lotError';
import { LAND_USE_RADIUS_M, STRUCTURE_RADIUS_M, WATER_RADIUS_M } from './radii';
import { AERIAL, E0, LOT_GEOMETRY, N0, P1911, P1935, aerialSidecar, makeCollection, mappedOnly, plateCollection, rect, registry } from './testing/fixtures';

const square = (x0: number, y0: number, x1: number, y1: number): PolygonalGeometry => ({ type: 'Polygon', coordinates: [rect(x0, y0, x1 - x0, y1 - y0)] });

/** A plate that maps the lot and reviews exactly `reviewed`. */
function plate(reviewed: PolygonalGeometry | null, covers?: Array<'building' | 'water' | 'land_use'>): FeatureCollection {
  const c = makeCollection(P1911, []);
  c.mapped_area = { geometry: square(E0 - 500, N0 - 500, E0 + 500, N0 + 500), method: 'map_area' } as FeatureCollection['mapped_area'];
  if (reviewed) c.reviewed_areas = [{ geometry: reviewed, method: 'person', ...(covers ? { covers } : {}) }] as FeatureCollection['reviewed_areas'];
  return c;
}

describe('lot coverage, one test per row of the table', () => {
  it('not_read: the plate has no evidence file', () => {
    expect(lotCoverage(LOT_GEOMETRY, undefined, 10)).toBe('not_read');
  });

  it('not_mapped: the lot does not meet the mapped area, or the file states none', () => {
    const away = makeCollection(P1911, []);
    away.mapped_area = { geometry: square(E0 + 1000, N0 + 1000, E0 + 1100, N0 + 1100), method: 'map_area' } as FeatureCollection['mapped_area'];
    expect(lotCoverage(LOT_GEOMETRY, away, 10)).toBe('not_mapped');
    expect(lotCoverage(LOT_GEOMETRY, makeCollection(P1911, []), 10)).toBe('not_mapped');
    // Touching along an edge is not positive area.
    const touching = makeCollection(P1911, []);
    touching.mapped_area = { geometry: square(E0 + 20, N0, E0 + 100, N0 + 30), method: 'map_area' } as FeatureCollection['mapped_area'];
    expect(lotCoverage(LOT_GEOMETRY, touching, 10)).toBe('not_mapped');
  });

  it('mapped: the plate shows the lot but nothing is reviewed, or the reviewed area is too small', () => {
    expect(lotCoverage(LOT_GEOMETRY, plate(null), 10)).toBe('mapped');
    expect(lotCoverage(LOT_GEOMETRY, plate(square(E0, N0, E0 + 20, N0 + 30)), 10)).toBe('mapped');
  });

  it('reviewed: the lot grown by the radius lies inside the reviewed areas', () => {
    expect(lotCoverage(LOT_GEOMETRY, plate(square(E0 - 20, N0 - 20, E0 + 40, N0 + 50)), 10)).toBe('reviewed');
  });

  it('allows 0.01 m: an area short by 0.005 m is reviewed, short by 0.05 m is not', () => {
    const r = STRUCTURE_RADIUS_M;
    expect(lotCoverage(LOT_GEOMETRY, plate(square(E0 - r + 0.005, N0 - r, E0 + 20 + r, N0 + 30 + r)), r)).toBe('reviewed');
    expect(lotCoverage(LOT_GEOMETRY, plate(square(E0 - r + 0.05, N0 - r, E0 + 20 + r, N0 + 30 + r)), r)).toBe('mapped');
  });

  it('works at exactly each radius and one centimetre inside each', () => {
    for (const r of [STRUCTURE_RADIUS_M, LAND_USE_RADIUS_M, WATER_RADIUS_M]) {
      expect(lotCoverage(LOT_GEOMETRY, plate(square(E0 - r, N0 - r, E0 + 20 + r, N0 + 30 + r)), r), `exactly ${r}`).toBe('reviewed');
      expect(lotCoverage(LOT_GEOMETRY, plate(square(E0 - r + 0.2, N0 - r + 0.2, E0 + 20 + r - 0.2, N0 + 30 + r - 0.2)), r), `0.2 m short at ${r}`).toBe('mapped');
    }
  });

  it('counts a reviewed area only for the kinds it covers: buildings when covers is absent', () => {
    const area = square(E0 - 200, N0 - 200, E0 + 200, N0 + 200);
    expect(lotCoverage(LOT_GEOMETRY, plate(area), 100, 'building')).toBe('reviewed');
    expect(lotCoverage(LOT_GEOMETRY, plate(area), 100, 'water')).toBe('mapped');
    expect(lotCoverage(LOT_GEOMETRY, plate(area, ['building', 'water']), 100, 'water')).toBe('reviewed');
    expect(lotCoverage(LOT_GEOMETRY, plate(area, ['building', 'water']), 100, 'land_use')).toBe('mapped');
  });

  it('adds the lot error to nothing: coverage is a statement about the lot as drawn', () => {
    expect(LOT_POSITION_ERROR_M).toBe(2.0);
  });
});

describe('plate coverages and aerials', () => {
  it('lists every plate source in id order, whether or not it has a file', () => {
    const rows = plateCoverages(LOT_GEOMETRY, registry().sources, [plateCollection(P1935, [])], 10);
    expect(rows.map((r) => [r.source.id, r.coverage])).toEqual([
      [P1911, 'not_read'],
      [P1935, 'reviewed'],
    ]);
    expect(plateCoverages(LOT_GEOMETRY, registry().sources, [mappedOnly(P1911, [])], 10)[0]!.coverage).toBe('mapped');
  });

  it('leaves out an aerial and a source whose rights are not confirmed', () => {
    const sources = registry().sources.map((s) => (s.id === P1935 ? { ...s, attribution_status: 'to_be_confirmed' as const } : s));
    expect(plateCoverages(LOT_GEOMETRY, sources, [], 10).map((r) => r.source.id)).toEqual([P1911]);
  });

  it('an aerial covers the lot when its corners enclose it with positive area', () => {
    expect(aerialCoversLot(LOT_GEOMETRY, aerialSidecar())).toBe(true);
    const away = { corners: { top_left: [E0 + 500, N0 + 600], top_right: [E0 + 700, N0 + 600], bottom_right: [E0 + 700, N0 + 500], bottom_left: [E0 + 500, N0 + 500] } };
    expect(aerialCoversLot(LOT_GEOMETRY, away as never)).toBe(false);
    expect(AERIAL).toContain('aerial_1947');
  });
});
