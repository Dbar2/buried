/**
 * The rectangle the Player's default camera pose frames (spec 03 design.md "Initial view"), so the
 * first view shows the reconstructed block rather than the whole plate. Pure. It reads only
 * geometry: no year, date or source rule is involved.
 */
import type { EraFeatureList } from '../evidence';
import type { Drape } from './drapes';

export const INITIAL_VIEW_MARGIN_M = 60;
export const INITIAL_VIEW_MIN_M = 200;
/** Margin around the plates' map areas, as a share of the box's width and height, on each side (session 015). */
export const INITIAL_VIEW_MAP_AREA_MARGIN = 0.15;

/** A polygon ring (or any list of positions) in EPSG:26917 metres, easting first. */
export type Ring = ReadonlyArray<readonly number[]>;

/** A rectangle in EPSG:26917 metres. */
export type Rect = { minE: number; minN: number; maxE: number; maxN: number };

type Box = { minE: number; minN: number; maxE: number; maxN: number };

function emptyBox(): Box {
  return { minE: Infinity, minN: Infinity, maxE: -Infinity, maxN: -Infinity };
}

function isEmpty(box: Box): boolean {
  return !(box.minE <= box.maxE && box.minN <= box.maxN);
}

function extend(box: Box, e: number, n: number): void {
  if (e < box.minE) box.minE = e;
  if (e > box.maxE) box.maxE = e;
  if (n < box.minN) box.minN = n;
  if (n > box.maxN) box.maxN = n;
}

/** Visit every position (a number array of length 2 or more) in a GeoJSON coordinates value. */
function visitPositions(coordinates: unknown, visit: (e: number, n: number) => void): void {
  if (!Array.isArray(coordinates)) return;
  if (coordinates.length >= 2 && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    visit(coordinates[0], coordinates[1]);
    return;
  }
  for (const part of coordinates) visitPositions(part, visit);
}

/**
 * Where the default camera looks.
 *
 * 1. The bounding box of the plates' map areas (`mapAreas`, one ring per plate), grown by
 *    INITIAL_VIEW_MAP_AREA_MARGIN of its width and height on each side. This is the maintainer's
 *    decision of session 015: the opening view frames the mapped ground, centred.
 * 2. With no map area, the bounding box of every Era list entry's geometry, in every era (land use
 *    excluded, as for scene features, because the Player is never sent it), grown by
 *    INITIAL_VIEW_MARGIN_M on each side.
 * 3. With none, the bounding box of every drape's four corners, grown the same way.
 * 4. With none either, the project bounds.
 *
 * The result is widened about its centre to at least INITIAL_VIEW_MIN_M in each direction, then
 * clipped to the project bounds.
 */
export function initialView(
  eraLists: Iterable<EraFeatureList>,
  drapes: Iterable<Drape>,
  bounds: Rect,
  mapAreas: Iterable<Ring> = [],
): Rect {
  const box = emptyBox();
  let marginE = INITIAL_VIEW_MARGIN_M;
  let marginN = INITIAL_VIEW_MARGIN_M;

  for (const ring of mapAreas) {
    for (const p of ring) extend(box, p[0] as number, p[1] as number);
  }
  if (!isEmpty(box)) {
    marginE = (box.maxE - box.minE) * INITIAL_VIEW_MAP_AREA_MARGIN;
    marginN = (box.maxN - box.minN) * INITIAL_VIEW_MAP_AREA_MARGIN;
  }
  if (isEmpty(box)) {
    for (const list of eraLists) {
      for (const entry of list.features) {
        if (entry.kind === 'land_use') continue;
        visitPositions((entry.geometry as { coordinates?: unknown }).coordinates, (e, n) => extend(box, e, n));
      }
    }
  }
  if (isEmpty(box)) {
    for (const drape of drapes) {
      const c = drape.corners;
      for (const p of [c.topLeft, c.topRight, c.bottomRight, c.bottomLeft]) extend(box, p[0], p[1]);
    }
  }
  if (isEmpty(box)) return { ...bounds };

  const grown: Box = {
    minE: box.minE - marginE,
    minN: box.minN - marginN,
    maxE: box.maxE + marginE,
    maxN: box.maxN + marginN,
  };
  const widen = (min: number, max: number): [number, number] => {
    if (max - min >= INITIAL_VIEW_MIN_M) return [min, max];
    const centre = (min + max) / 2;
    return [centre - INITIAL_VIEW_MIN_M / 2, centre + INITIAL_VIEW_MIN_M / 2];
  };
  const [minE, maxE] = widen(grown.minE, grown.maxE);
  const [minN, maxN] = widen(grown.minN, grown.maxN);

  const clipped: Rect = {
    minE: Math.max(minE, bounds.minE),
    minN: Math.max(minN, bounds.minN),
    maxE: Math.min(maxE, bounds.maxE),
    maxN: Math.min(maxN, bounds.maxN),
  };
  // Content wholly outside the bounds leaves nothing to frame: fall back to the bounds.
  if (!(clipped.minE < clipped.maxE) || !(clipped.minN < clipped.maxN)) return { ...bounds };
  return clipped;
}
