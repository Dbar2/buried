/**
 * The picture core sample's crops (product.md "The core sample is made of pictures"): a square of
 * ground around the lot, lot bounds plus a margin, cut from an era's untouched tile with the tile's
 * sidecar transform. Everything here is pure maths in EPSG:26917 metres, so it can be tested. The
 * canvas drawing is in CropCanvas.tsx and only applies the matrices computed here.
 *
 * The tile's four corners are exact (spec 02 tile sidecar): pixel (u, v) of the tile image sits at
 * `top_left + u * (top_right - top_left) / width + v * (bottom_left - top_left) / height`.
 */
import type { PolygonalGeometry, TileSidecar } from '../evidence';

export const CROP_MARGIN_M = 25;

export type Pt = readonly [number, number];
/** The six numbers of a canvas `setTransform(a, b, c, d, e, f)`: x' = a x + c y + e, y' = b x + d y + f. */
export type Affine = readonly [number, number, number, number, number, number];

/** A square window on the ground, south-west corner and side, in metres. */
export type CropWindow = { minE: number; minN: number; side: number };

/** The parts of a sidecar a crop needs. */
export type TileRef = {
  sourceId: string;
  image: string;
  widthPx: number;
  heightPx: number;
  topLeft: Pt;
  topRight: Pt;
  bottomLeft: Pt;
  attributionLine: string;
};

export type CropShapes = { lot: Pt[][]; buildings: Pt[][][]; lots: Pt[][][] };

export type Crop =
  | { kind: 'tile'; window: CropWindow; tile: TileRef; lot: Pt[][] }
  | { kind: 'vector'; window: CropWindow; shapes: CropShapes }
  | { kind: 'none'; text: string };

function eachPoint(coordinates: unknown, visit: (e: number, n: number) => void): void {
  if (Array.isArray(coordinates) && typeof coordinates[0] === 'number') visit(coordinates[0] as number, coordinates[1] as number);
  else if (Array.isArray(coordinates)) for (const part of coordinates) eachPoint(part, visit);
}

export function boundsOf(geometry: { coordinates: unknown }): { minE: number; minN: number; maxE: number; maxN: number } {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;
  eachPoint(geometry.coordinates, (e, n) => {
    minE = Math.min(minE, e);
    minN = Math.min(minN, n);
    maxE = Math.max(maxE, e);
    maxN = Math.max(maxN, n);
  });
  return { minE, minN, maxE, maxN };
}

/** The square window: the lot's bounds grown by `marginM` on every side, then made square about its centre. */
export function cropWindow(lot: { coordinates: unknown }, marginM = CROP_MARGIN_M): CropWindow {
  const b = boundsOf(lot);
  const side = Math.max(b.maxE - b.minE, b.maxN - b.minN) + 2 * marginM;
  const cE = (b.minE + b.maxE) / 2;
  const cN = (b.minN + b.maxN) / 2;
  return { minE: cE - side / 2, minN: cN - side / 2, side };
}

/** The rings of a Polygon or MultiPolygon, as a flat list of rings (outer first within each polygon). */
export function ringsOf(geometry: PolygonalGeometry): Pt[][] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return (polygons as unknown as number[][][][]).flatMap((polygon) => polygon.map((ring) => ring.map((p) => [p[0] as number, p[1] as number] as Pt)));
}

export const tileRef = (t: TileSidecar): TileRef => ({
  sourceId: t.source,
  image: t.image,
  widthPx: t.width_px,
  heightPx: t.height_px,
  topLeft: [t.corners.top_left[0] as number, t.corners.top_left[1] as number],
  topRight: [t.corners.top_right[0] as number, t.corners.top_right[1] as number],
  bottomLeft: [t.corners.bottom_left[0] as number, t.corners.bottom_left[1] as number],
  attributionLine: t.attribution_line,
});

/** Ground coordinates of a tile pixel. */
export function tilePixelToWorld(tile: TileRef, u: number, v: number): Pt {
  const ux = (tile.topRight[0] - tile.topLeft[0]) / tile.widthPx;
  const un = (tile.topRight[1] - tile.topLeft[1]) / tile.widthPx;
  const vx = (tile.bottomLeft[0] - tile.topLeft[0]) / tile.heightPx;
  const vn = (tile.bottomLeft[1] - tile.topLeft[1]) / tile.heightPx;
  return [tile.topLeft[0] + u * ux + v * vx, tile.topLeft[1] + u * un + v * vn];
}

/** Ground (E, N) to canvas pixels for a square canvas of `sizePx`: north is up, one pixel per `side / sizePx` metres. */
export function worldToCanvas(window: CropWindow, sizePx: number): Affine {
  const s = sizePx / window.side;
  return [s, 0, 0, -s, -window.minE * s, (window.minN + window.side) * s];
}

/** Tile image pixels to canvas pixels: the matrix to give `setTransform` before `drawImage(image, 0, 0)`. */
export function tileToCanvas(tile: TileRef, window: CropWindow, sizePx: number): Affine {
  const s = sizePx / window.side;
  const top = window.minN + window.side;
  const ux = (tile.topRight[0] - tile.topLeft[0]) / tile.widthPx;
  const un = (tile.topRight[1] - tile.topLeft[1]) / tile.widthPx;
  const vx = (tile.bottomLeft[0] - tile.topLeft[0]) / tile.heightPx;
  const vn = (tile.bottomLeft[1] - tile.topLeft[1]) / tile.heightPx;
  return [s * ux, -s * un, s * vx, -s * vn, s * (tile.topLeft[0] - window.minE), s * (top - tile.topLeft[1])];
}

export function applyAffine(m: Affine, x: number, y: number): Pt {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Whether two axis-aligned boxes overlap with positive area. */
export function boxesOverlap(a: ReturnType<typeof boundsOf>, b: ReturnType<typeof boundsOf>): boolean {
  return a.minE < b.maxE && b.minE < a.maxE && a.minN < b.maxN && b.minN < a.maxN;
}

/** The window as a box. */
export const windowBox = (w: CropWindow) => ({ minE: w.minE, minN: w.minN, maxE: w.minE + w.side, maxN: w.minN + w.side });
