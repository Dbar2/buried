/**
 * The Flat sheet's map from EPSG:26917 metres to tile pixels, from a tile sidecar's corners
 * (`data/tiles/<id>.json`, spec 06 design "Lantern lens, Flat sheet, share"). Pure.
 *
 * A tile is an affine image of its pixels: the top-left, top-right and bottom-left corners fix the
 * transform, and the bottom-right corner is checked against it by the tests. Tile pixel (0, 0) is the
 * top-left corner of the top-left pixel; (width, height) is the bottom-right corner.
 */

export type Pt = readonly [number, number];

export type TileCorners = {
  readonly top_left: Pt;
  readonly top_right: Pt;
  readonly bottom_right: Pt;
  readonly bottom_left: Pt;
};

/** world = origin + px * u + py * v, with u and v the world vectors of one pixel step right and down. */
export type SheetTransform = {
  readonly origin: Pt;
  readonly u: Pt;
  readonly v: Pt;
  readonly widthPx: number;
  readonly heightPx: number;
};

export function makeSheetTransform(corners: TileCorners, widthPx: number, heightPx: number): SheetTransform {
  const [e0, n0] = corners.top_left;
  return {
    origin: [e0, n0],
    u: [(corners.top_right[0] - e0) / widthPx, (corners.top_right[1] - n0) / widthPx],
    v: [(corners.bottom_left[0] - e0) / heightPx, (corners.bottom_left[1] - n0) / heightPx],
    widthPx,
    heightPx,
  };
}

export function pixelToWorld(t: SheetTransform, p: Pt): Pt {
  return [t.origin[0] + p[0] * t.u[0] + p[1] * t.v[0], t.origin[1] + p[0] * t.u[1] + p[1] * t.v[1]];
}

/** World to tile pixels, by the inverse of the 2 by 2 matrix [u v]. Subtracts the origin first, in double precision. */
export function worldToPixel(t: SheetTransform, w: Pt): Pt {
  const dx = w[0] - t.origin[0];
  const dy = w[1] - t.origin[1];
  const det = t.u[0] * t.v[1] - t.v[0] * t.u[1];
  return [(dx * t.v[1] - dy * t.v[0]) / det, (dy * t.u[0] - dx * t.u[1]) / det];
}

/** An SVG path (`M x y L ... Z`) in tile pixels for polygon rings given in world metres. */
export function ringsToPath(t: SheetTransform, rings: readonly (readonly Pt[])[]): string {
  return rings
    .filter((ring) => ring.length >= 2)
    .map((ring) => {
      const points = ring.map((p) => worldToPixel(t, p));
      return `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;
    })
    .join('');
}

/** The tile pixel at the middle of a ring's bounding box: a plain anchor for a footprint on the Flat sheet. */
export function ringCentrePx(t: SheetTransform, ring: readonly Pt[]): Pt | null {
  if (ring.length === 0) return null;
  const points = ring.map((p) => worldToPixel(t, p));
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
