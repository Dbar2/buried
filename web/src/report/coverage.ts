/**
 * Lot coverage (spec 05 design "Lot coverage"): what each plate source says about a lot at a radius.
 *
 *   not_read    the plate has no evidence file                          (not_covered)
 *   not_mapped  the lot does not meet the plate's mapped area            (not_covered)
 *   reviewed    the lot grown by r lies inside the reviewed areas        (clear)
 *   mapped      the plate shows the lot, but not every building checked  (not_covered)
 *
 * All in EPSG:26917 metres with JSTS. The reviewed areas are grown by 0.01 m before the test, the
 * same tolerance as spec 01 requirement 19.4. A reviewed area counts only for the kinds it covers
 * (`reviewedAreaCovers`): buildings when `covers` is absent.
 */
import { reviewedAreaCovers } from '../evidence';
import type { CoverageKind, FeatureCollection, PolygonalGeometry, Source, TileSidecar } from '../evidence';
import { ROUND_SEGMENTS, offsetOf, toJts, unionAll } from './geom';

export type LotCoverage = 'not_read' | 'not_mapped' | 'reviewed' | 'mapped';

export const COVERAGE_WORDING: Record<LotCoverage, string> = {
  not_read: 'not read into Buried yet',
  not_mapped: 'does not show this lot',
  reviewed: 'checked here',
  mapped: 'shows this lot, not fully checked here',
};

/** `clear` only for `reviewed`; every other coverage lists the record as not covered. */
export function coverageVisibility(coverage: LotCoverage): 'clear' | 'not_covered' {
  return coverage === 'reviewed' ? 'clear' : 'not_covered';
}

export const REVIEW_TOLERANCE_M = 0.01;

/** Plate sources: registered plans and historical maps with confirmed rights and a start year. */
export function isPlateSource(source: Source): boolean {
  return (
    (source.type === 'fire_insurance_plan' || source.type === 'historical_map') &&
    source.attribution_status === 'confirmed' &&
    source.year_from !== null
  );
}

export function lotCoverage(
  lot: PolygonalGeometry,
  collection: FeatureCollection | undefined,
  radiusM: number,
  kind: CoverageKind = 'building',
): LotCoverage {
  if (collection === undefined) return 'not_read';
  const offset = offsetOf(lot);
  const lotGeometry = toJts(lot, offset);

  if (collection.mapped_area === undefined) return 'not_mapped';
  const mapped = toJts(collection.mapped_area.geometry, offset);
  if (!(lotGeometry.intersection(mapped).getArea() > 0)) return 'not_mapped';

  const areas = (collection.reviewed_areas ?? []).filter((a) => reviewedAreaCovers(a).includes(kind));
  const union = unionAll(areas.map((a) => toJts(a.geometry, offset)));
  if (union === null) return 'mapped';
  const grown = lotGeometry.buffer(radiusM, ROUND_SEGMENTS);
  return union.buffer(REVIEW_TOLERANCE_M, ROUND_SEGMENTS).covers(grown) ? 'reviewed' : 'mapped';
}

export type PlateCoverage = { source: Source; coverage: LotCoverage };

/** One entry per plate source, in id order. `collections` are matched to sources by origin source. */
export function plateCoverages(
  lot: PolygonalGeometry,
  sources: readonly Source[],
  collections: readonly FeatureCollection[],
  radiusM: number,
  kind: CoverageKind = 'building',
): PlateCoverage[] {
  const byOrigin = new Map<string, FeatureCollection>();
  for (const c of collections) byOrigin.set(c.origin_source, c);
  return sources
    .filter(isPlateSource)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((source) => ({ source, coverage: lotCoverage(lot, byOrigin.get(source.id), radiusM, kind) }));
}

/** An aerial covers the lot when its sidecar's four corners, as a polygon, meet the lot with positive area. */
export function aerialCoversLot(lot: PolygonalGeometry, sidecar: Pick<TileSidecar, 'corners'>): boolean {
  const c = sidecar.corners;
  const ring = [c.top_left, c.top_right, c.bottom_right, c.bottom_left, c.top_left].map((p) => [p[0], p[1]]);
  const offset = offsetOf(lot);
  try {
    return toJts({ type: 'Polygon', coordinates: [ring] }, offset).intersection(toJts(lot, offset)).getArea() > 0;
  } catch {
    return false;
  }
}
