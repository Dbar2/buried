/**
 * "On this lot" versus "near this lot" (spec 01 requirement 13, evidence.md "On this lot vs near
 * this lot"). Pure maths in EPSG:26917 metres with JSTS, because Turf's buffers and distances
 * assume degrees.
 *
 *   e       = feature position error + lot position error
 *   shrunk  = the lot shrunk inward by e
 *   on      = the feature meets `shrunk` with positive area (polygons) or length (lines), so it
 *             still touches the lot however its error is resolved
 *   near    = anything else, within ceil(distance(feature, lot) + e) whole metres
 *
 * Nothing here decides which lot a feature belongs to or words the result; the Report does that
 * from `LotRelation`.
 */
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js';
import 'jsts/org/locationtech/jts/monkey.js';
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js';
import type { FeatureGeometry, PolygonalGeometry } from './types.generated';

/** A lot: a polygon in EPSG:26917 metres with its own position error (at least 0). */
export type Lot = { geometry: PolygonalGeometry; positionErrorM: number };

/** What `lotRelation` needs of a feature. An `EraFeature` fits. */
export type LotFeature = { geometry: FeatureGeometry; positionErrorM: number };

/** `near.withinM` is a whole number of metres. */
export type LotRelation = { kind: 'on' } | { kind: 'near'; withinM: number };

/** Thrown for a geometry or error value that cannot be used. The caller decides the message. */
export class LotInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LotInputError';
  }
}

/** JSTS' number of segments per quarter circle in a buffer. Its default; stated because the
 * distance scaling below depends on it. */
export const QUADRANT_SEGMENTS = 8;

/**
 * With round joins JSTS replaces each arc by chords that sit inside the true arc. For an inward
 * buffer the arcs appear at the lot's reflex corners, and chords inside the arc leave the shrunk
 * lot slightly too large there. Scaling the distance by k = 1 / cos(π / (4q)) pushes the chord
 * midpoints out to the true circle, so the computed shrunk lot is never larger than the exact one
 * (requirement 13.5). Straight edges move by k × e, which only makes "on this lot" harder to reach.
 */
export function bufferScale(quadrantSegments: number = QUADRANT_SEGMENTS): number {
  return 1 / Math.cos(Math.PI / (4 * quadrantSegments));
}

type Position = readonly number[];

/** The minimal JSTS geometry surface used here (the shipped typings omit the patched methods). */
interface JtsGeometry {
  isEmpty(): boolean;
  isValid(): boolean;
  getArea(): number;
  getLength(): number;
  intersection(other: JtsGeometry): JtsGeometry;
  distance(other: JtsGeometry): number;
  buffer(distance: number, quadrantSegments?: number): JtsGeometry;
}

function eachPosition(coordinates: unknown, visit: (p: Position) => void): void {
  if (Array.isArray(coordinates) && typeof coordinates[0] === 'number') {
    visit(coordinates as Position);
  } else if (Array.isArray(coordinates)) {
    for (const part of coordinates) eachPosition(part, visit);
  }
}

function shift(coordinates: unknown, dx: number, dy: number): unknown {
  if (Array.isArray(coordinates) && typeof coordinates[0] === 'number') {
    return [(coordinates[0] as number) - dx, (coordinates[1] as number) - dy];
  }
  return (coordinates as unknown[]).map((part) => shift(part, dx, dy));
}

/**
 * Subtracting a whole-metre offset keeps the geometry exact for integer-metre input and keeps
 * JTS away from the 1e-9 resolution of coordinates near 4.8e6 (UTM northings in Toronto).
 */
function localOffset(lot: PolygonalGeometry): [number, number] {
  let minE = Infinity;
  let minN = Infinity;
  eachPosition(lot.coordinates, (p) => {
    minE = Math.min(minE, p[0] as number);
    minN = Math.min(minN, p[1] as number);
  });
  return [Math.floor(minE), Math.floor(minN)];
}

function toJts(geometry: FeatureGeometry, dx: number, dy: number, what: string): JtsGeometry {
  const moved = { type: geometry.type, coordinates: shift(geometry.coordinates, dx, dy) };
  const g = new GeoJSONReader(new GeometryFactory()).read(moved) as unknown as JtsGeometry;
  if (g.isEmpty()) throw new LotInputError(`${what} geometry is empty`);
  if (!g.isValid()) throw new LotInputError(`${what} geometry is not valid`);
  return g;
}

/**
 * Whether `feature` is on `lot` or near it, per requirement 13. Throws `LotInputError` for an
 * empty or invalid geometry, a feature error that is not a positive number, or a lot error that
 * is negative or not a number.
 */
export function lotRelation(feature: LotFeature, lot: Lot): LotRelation {
  if (!Number.isFinite(feature.positionErrorM) || feature.positionErrorM <= 0) {
    throw new LotInputError(`feature position error must be a positive number, got ${feature.positionErrorM}`);
  }
  if (!Number.isFinite(lot.positionErrorM) || lot.positionErrorM < 0) {
    throw new LotInputError(`lot position error must be zero or more, got ${lot.positionErrorM}`);
  }
  const e = feature.positionErrorM + lot.positionErrorM;

  const [dx, dy] = localOffset(lot.geometry);
  const lotGeometry = toJts(lot.geometry, dx, dy, 'lot');
  const featureGeometry = toJts(feature.geometry, dx, dy, 'feature');

  const shrunk = lotGeometry.buffer(-e * bufferScale(), QUADRANT_SEGMENTS);
  if (!shrunk.isEmpty()) {
    const common = featureGeometry.intersection(shrunk);
    const isLine = feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString';
    const overlap = isLine ? common.getLength() : common.getArea();
    if (overlap > 0) return { kind: 'on' };
  }
  // Plain ceil, no rounding of float noise: the answer is never below distance + e, and a value
  // like 3.0000000000000004 reads one metre more, which is the safe side.
  const withinM = Math.ceil(featureGeometry.distance(lotGeometry) + e);
  return { kind: 'near', withinM };
}
