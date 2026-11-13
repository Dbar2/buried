/**
 * Small JSTS helpers for the Report's lot maths, in EPSG:26917 metres. Coordinates near 4.8e6 are
 * shifted by a whole-metre offset before JTS sees them, as `lotRelation` does, so JTS' tolerance is
 * not spent on the large numbers.
 */
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js';
import 'jsts/org/locationtech/jts/monkey.js';
import type { FeatureGeometry } from '../evidence';

export interface Jts {
  isEmpty(): boolean;
  getArea(): number;
  intersection(other: Jts): Jts;
  union(other: Jts): Jts;
  covers(other: Jts): boolean;
  intersects(other: Jts): boolean;
  distance(other: Jts): number;
  buffer(distance: number, quadrantSegments?: number): Jts;
}

export type Offset = readonly [number, number];

function eachPosition(coordinates: unknown, visit: (p: readonly number[]) => void): void {
  if (Array.isArray(coordinates) && typeof coordinates[0] === 'number') visit(coordinates as number[]);
  else if (Array.isArray(coordinates)) for (const part of coordinates) eachPosition(part, visit);
}

function shift(coordinates: unknown, dx: number, dy: number): unknown {
  if (Array.isArray(coordinates) && typeof coordinates[0] === 'number') return [(coordinates[0] as number) - dx, (coordinates[1] as number) - dy];
  return (coordinates as unknown[]).map((part) => shift(part, dx, dy));
}

export function offsetOf(geometry: Pick<FeatureGeometry, 'coordinates'>): Offset {
  let minE = Infinity;
  let minN = Infinity;
  eachPosition(geometry.coordinates, (p) => {
    minE = Math.min(minE, p[0] as number);
    minN = Math.min(minN, p[1] as number);
  });
  return [Math.floor(minE), Math.floor(minN)];
}

export function toJts(geometry: { type: string; coordinates: unknown }, offset: Offset): Jts {
  const moved = { type: geometry.type, coordinates: shift(geometry.coordinates, offset[0], offset[1]) };
  return new GeoJSONReader(new GeometryFactory()).read(moved) as unknown as Jts;
}

/** The empty geometry's union identity: the union of several geometries, or null for none. */
export function unionAll(parts: readonly Jts[]): Jts | null {
  let out: Jts | null = null;
  for (const part of parts) out = out === null ? part : out.union(part);
  return out;
}

export const ROUND_SEGMENTS = 8;
