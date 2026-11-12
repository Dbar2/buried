/**
 * The rectangle the Player's default camera pose frames (spec 03 design.md "Initial view"), so the
 * first view shows the reconstructed block rather than the whole plate. Pure. It reads only
 * geometry: no year, date or source rule is involved.
 */
import type { EraFeatureList } from '../evidence';
import type { Drape } from './drapes';

export const INITIAL_VIEW_MARGIN_M = 60;
export const INITIAL_VIEW_MIN_M = 200;

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
 * 1. The bounding box of every Era list entry's geometry, in every era (land use excluded, as for
 *    scene features, because the Player is never sent it).
 * 2. With none, the bounding box of every drape's four corners.
 * 3. With none either, the project bounds.
 * 4. Grown by INITIAL_VIEW_MARGIN_M on each side, widened about its centre to at least
 *    INITIAL_VIEW_MIN_M in each direction, then clipped to the project bounds.
 */
export function initialView(eraLists: Iterable<EraFeatureList>, drapes: Iterable<Drape>, bounds: Rect): Rect {
  const box = emptyBox();
  for (const list of eraLists) {
    for (const entry of list.features) {
      if (entry.kind === 'land_use') continue;
      visitPositions((entry.geometry as { coordinates?: unknown }).coordinates, (e, n) => extend(box, e, n));
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
    minE: box.minE - INITIAL_VIEW_MARGIN_M,
    minN: box.minN - INITIAL_VIEW_MARGIN_M,
    maxE: box.maxE + INITIAL_VIEW_MARGIN_M,
    maxN: box.maxN + INITIAL_VIEW_MARGIN_M,
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
