/**
 * Geometry for the drape placement check (spec 03 task 17.4, design.md "Drape placement check").
 * Pure. Positions are EPSG:26917 metres; "local" means relative to the project origin, subtracted in
 * double precision, with x east and z north as in the Player.
 */
export type Pt = readonly [number, number];
export type Corners = { top_left: Pt; top_right: Pt; bottom_right: Pt; bottom_left: Pt };

/** The ground position of a tile coordinate (px, py), in tile pixels from the top left, by the drape mesh's bilinear rule. */
export function tileToWorld(corners: Corners, widthPx: number, heightPx: number, px: number, py: number): [number, number] {
  const u = px / widthPx;
  const v = py / heightPx;
  const at = (k: 0 | 1): number =>
    (1 - v) * ((1 - u) * corners.top_left[k] + u * corners.top_right[k]) + v * ((1 - u) * corners.bottom_left[k] + u * corners.bottom_right[k]);
  return [at(0), at(1)];
}

/** The inverse of tileToWorld, by Newton's method from the centre. Exact for a parallelogram in one step. */
export function worldToTile(corners: Corners, widthPx: number, heightPx: number, e: number, n: number): [number, number] {
  let u = 0.5;
  let v = 0.5;
  for (let iteration = 0; iteration < 30; iteration++) {
    const [fe, fn] = tileToWorld(corners, 1, 1, u, v);
    const re = fe - e;
    const rn = fn - n;
    const dEdU = (1 - v) * (corners.top_right[0] - corners.top_left[0]) + v * (corners.bottom_right[0] - corners.bottom_left[0]);
    const dNdU = (1 - v) * (corners.top_right[1] - corners.top_left[1]) + v * (corners.bottom_right[1] - corners.bottom_left[1]);
    const dEdV = (1 - u) * (corners.bottom_left[0] - corners.top_left[0]) + u * (corners.bottom_right[0] - corners.top_right[0]);
    const dNdV = (1 - u) * (corners.bottom_left[1] - corners.top_left[1]) + u * (corners.bottom_right[1] - corners.top_right[1]);
    const det = dEdU * dNdV - dEdV * dNdU;
    if (Math.abs(det) < 1e-12) throw new Error('the corners are degenerate');
    const du = (re * dNdV - rn * dEdV) / det;
    const dv = (dEdU * rn - dNdU * re) / det;
    u -= du;
    v -= dv;
    if (Math.abs(du) < 1e-14 && Math.abs(dv) < 1e-14) break;
  }
  return [u * widthPx, v * heightPx];
}

/** A column-major 4 x 4 matrix as the Player reports it (clip_r = m[r] x + m[4 + r] y + m[8 + r] z + m[12 + r]). */
export type Matrix = readonly number[];
export type Canvas = { widthPx: number; heightPx: number };

/** The canvas pixel (y down) of a local ground position at height y. Null when behind the camera. */
export function project(vp: Matrix, canvas: Canvas, x: number, y: number, z: number): [number, number] | null {
  const clip = [0, 1, 2, 3].map((r) => (vp[r] as number) * x + (vp[4 + r] as number) * y + (vp[8 + r] as number) * z + (vp[12 + r] as number));
  const w = clip[3] as number;
  if (w <= 1e-9) return null;
  return [((clip[0] as number) / w * 0.5 + 0.5) * canvas.widthPx, (1 - ((clip[1] as number) / w * 0.5 + 0.5)) * canvas.heightPx];
}

type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

function invert3(m: Mat3): Mat3 {
  const [a, b, c, d, e, f, g, h, i] = m;
  const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(det) < 1e-300) throw new Error('the ground does not project to a plane here');
  const s = 1 / det;
  return [
    (e * i - f * h) * s, (c * h - b * i) * s, (b * f - c * e) * s,
    (f * g - d * i) * s, (a * i - c * g) * s, (c * d - a * f) * s,
    (d * h - e * g) * s, (b * g - a * h) * s, (a * e - b * d) * s,
  ];
}

/**
 * The map from canvas pixels to local ground positions (y = 0): the inverse of the homography that the
 * view-projection induces on the ground plane.
 */
export function groundUnderPixel(vp: Matrix, canvas: Canvas): (sx: number, sy: number) => [number, number] {
  // clip = M [x z 1]: the columns are the matrix's x column, z column and translation column, rows clip.x, clip.y, clip.w.
  const col = (k: number): [number, number, number] => [vp[k] as number, vp[k + 1] as number, vp[k + 3] as number];
  const cx = col(0);
  const cz = col(8);
  const ct = col(12);
  const forward: Mat3 = [cx[0], cz[0], ct[0], cx[1], cz[1], ct[1], cx[2], cz[2], ct[2]];
  const inverse = invert3(forward);
  return (sx, sy) => {
    const ndcX = (sx / canvas.widthPx) * 2 - 1;
    const ndcY = 1 - (sy / canvas.heightPx) * 2;
    const x = inverse[0] * ndcX + inverse[1] * ndcY + inverse[2];
    const z = inverse[3] * ndcX + inverse[4] * ndcY + inverse[5];
    const w = inverse[6] * ndcX + inverse[7] * ndcY + inverse[8];
    return [x / w, z / w];
  };
}

/** Distance from a point to a polygon ring's boundary, positive inside (even-odd) and negative outside. */
export function signedDistance(ring: readonly Pt[], x: number, y: number): number {
  let inside = false;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j] as Pt;
    const b = ring[i] as Pt;
    if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / lengthSq)) : 0;
    best = Math.min(best, Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y));
  }
  return inside ? best : -best;
}

/** A bilinear sample of an image of luminances at a continuous coordinate (pixel centres at +0.5), clamped at the edges. */
export function sampleBilinear(data: ArrayLike<number>, width: number, height: number, x: number, y: number): number {
  const u = x - 0.5;
  const v = y - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const fx = u - x0;
  const fy = v - y0;
  const at = (ix: number, iy: number): number => data[Math.min(height - 1, Math.max(0, iy)) * width + Math.min(width - 1, Math.max(0, ix))] as number;
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

export type TileGeometry = { corners: Corners; widthPx: number; heightPx: number; origin: Pt };

/** The tile-pixel box (clipped to the tile, grown by `margin`) that the n x n canvas window at (x0, y0) covers on the ground. */
export function tileBoxForWindow(
  vp: Matrix,
  canvas: Canvas,
  tile: TileGeometry,
  x0: number,
  y0: number,
  n: number,
  margin = 3,
): { x: number; y: number; width: number; height: number } {
  const ground = groundUnderPixel(vp, canvas);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [sx, sy] of [[x0, y0], [x0 + n, y0], [x0, y0 + n], [x0 + n, y0 + n]] as const) {
    const [gx, gz] = ground(sx, sy);
    const [tx, ty] = worldToTile(tile.corners, tile.widthPx, tile.heightPx, gx + tile.origin[0], gz + tile.origin[1]);
    minX = Math.min(minX, tx);
    maxX = Math.max(maxX, tx);
    minY = Math.min(minY, ty);
    maxY = Math.max(maxY, ty);
  }
  const x = Math.max(0, Math.floor(minX) - margin);
  const y = Math.max(0, Math.floor(minY) - margin);
  const right = Math.min(tile.widthPx, Math.ceil(maxX) + margin);
  const bottom = Math.min(tile.heightPx, Math.ceil(maxY) + margin);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

/**
 * What the tile's own pixels predict the canvas shows in the n x n window at (x0, y0): for each canvas
 * pixel, the mean of `subsamples` x `subsamples` bilinear samples of the tile luminance over that
 * pixel's footprint on the ground. `box` is the tile region that `region` holds (from tileBoxForWindow).
 * A footprint that leaves the region is clamped at its edge.
 */
export function expectedPatch(
  vp: Matrix,
  canvas: Canvas,
  tile: TileGeometry,
  box: { x: number; y: number; width: number; height: number },
  region: ArrayLike<number>,
  x0: number,
  y0: number,
  n: number,
  subsamples = 4,
): Float64Array {
  const ground = groundUnderPixel(vp, canvas);
  const out = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let b = 0; b < subsamples; b++) {
        for (let a = 0; a < subsamples; a++) {
          const [gx, gz] = ground(x0 + i + (a + 0.5) / subsamples, y0 + j + (b + 0.5) / subsamples);
          const [tx, ty] = worldToTile(tile.corners, tile.widthPx, tile.heightPx, gx + tile.origin[0], gz + tile.origin[1]);
          sum += sampleBilinear(region, box.width, box.height, tx - box.x, ty - box.y);
        }
      }
      out[j * n + i] = sum / (subsamples * subsamples);
    }
  }
  return out;
}
