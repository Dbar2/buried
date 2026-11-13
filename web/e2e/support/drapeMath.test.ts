import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { bestOffset, window } from './ncc';
import { expectedPatch, groundUnderPixel, project, signedDistance, tileBoxForWindow, tileToWorld, worldToTile } from './drapeMath';
import type { Corners, Matrix, TileGeometry } from './drapeMath';

// The 1911 plate's corners (a parallelogram) and a skewed quad, in EPSG:26917.
const PARALLELOGRAM: Corners = {
  top_left: [632312.268258896, 4835087.454831159],
  top_right: [632596.4688413026, 4835177.21913871],
  bottom_right: [632699.789440777, 4834849.898286615],
  bottom_left: [632415.5888583706, 4834760.1339790635],
};
const SKEWED: Corners = {
  top_left: [632300, 4835100],
  top_right: [632620, 4835180],
  bottom_right: [632710, 4834860],
  bottom_left: [632420, 4834740],
};

/** Unity's view-projection for a pose (CameraRigMath), column-major, y up, z north, x east. */
function viewProjection(target: [number, number], distance: number, pitchDeg: number, headingDeg: number, fovDeg: number, aspect: number): Matrix {
  const p = (pitchDeg * Math.PI) / 180;
  const h = (headingDeg * Math.PI) / 180;
  const f = [Math.sin(h) * Math.cos(p), -Math.sin(p), Math.cos(h) * Math.cos(p)];
  const right = [Math.cos(h), 0, -Math.sin(h)];
  const up = [f[1]! * right[2]! - f[2]! * right[1]!, f[2]! * right[0]! - f[0]! * right[2]!, f[0]! * right[1]! - f[1]! * right[0]!].map((v) => -v);
  // up = right x forward  (so that +y is up for a camera looking down)
  const upv = [right[1]! * f[2]! - right[2]! * f[1]!, right[2]! * f[0]! - right[0]! * f[2]!, right[0]! * f[1]! - right[1]! * f[0]!];
  void up;
  const eye = [target[0] - f[0]! * distance, -f[1]! * distance, target[1] - f[2]! * distance];
  const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  // camera space: x = right, y = up, z = forward (looking along +z here; the projection below uses that)
  const view = (x: number, y: number, z: number): number[] => {
    const d = [x - eye[0]!, y - eye[1]!, z - eye[2]!];
    return [dot(d, right), dot(d, upv), dot(d, f)];
  };
  const t = 1 / Math.tan((fovDeg * Math.PI) / 360);
  const near = 5;
  const far = 20000;
  // Build the 4 x 4 as a function applied to unit vectors, then lay it out column-major.
  const apply = (x: number, y: number, z: number): number[] => {
    const c = view(x, y, z);
    return [(t / aspect) * c[0]!, t * c[1]!, ((far + near) / (far - near)) * c[2]! - (2 * far * near) / (far - near), c[2]!];
  };
  const origin = apply(0, 0, 0);
  const ex = apply(1, 0, 0);
  const ey = apply(0, 1, 0);
  const ez = apply(0, 0, 1);
  const col = (v: number[]): number[] => [v[0]! - origin[0]!, v[1]! - origin[1]!, v[2]! - origin[2]!, v[3]! - origin[3]!];
  return [...col(ex), ...col(ey), ...col(ez), ...origin];
}

const CANVAS = { widthPx: 1280, heightPx: 744 };

describe('tileToWorld and worldToTile', () => {
  it('map the corners to the corners', () => {
    expect(tileToWorld(PARALLELOGRAM, 3626, 4096, 0, 0)).toEqual([...PARALLELOGRAM.top_left]);
    const br = tileToWorld(PARALLELOGRAM, 3626, 4096, 3626, 4096);
    expect(br[0]).toBeCloseTo(PARALLELOGRAM.bottom_right[0], 6);
    expect(br[1]).toBeCloseTo(PARALLELOGRAM.bottom_right[1], 6);
  });

  it('round-trip inside the tile, for a parallelogram and a skewed quad (property)', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 3626, noNaN: true }), fc.double({ min: 0, max: 4096, noNaN: true }), fc.constantFrom(PARALLELOGRAM, SKEWED), (px, py, corners) => {
        const [e, n] = tileToWorld(corners, 3626, 4096, px, py);
        const [qx, qy] = worldToTile(corners, 3626, 4096, e, n);
        return Math.abs(qx - px) < 1e-6 && Math.abs(qy - py) < 1e-6;
      }),
      { numRuns: 200 },
    );
  });
});

describe('the ground under a pixel', () => {
  it('inverts the projection of a ground point (property)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -400, max: 400, noNaN: true }),
        fc.double({ min: -400, max: 400, noNaN: true }),
        fc.double({ min: 20, max: 85, noNaN: true }),
        fc.double({ min: 0, max: 359, noNaN: true }),
        fc.double({ min: 150, max: 900, noNaN: true }),
        (x, z, pitch, heading, distance) => {
          const vp = viewProjection([0, 0], distance, pitch, heading, 58, CANVAS.widthPx / CANVAS.heightPx);
          const px = project(vp, CANVAS, x, 0, z);
          if (!px) return true;
          const [gx, gz] = groundUnderPixel(vp, CANVAS)(px[0], px[1]);
          return Math.abs(gx - x) < 1e-6 && Math.abs(gz - z) < 1e-6;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('puts the camera target at the canvas centre', () => {
    const vp = viewProjection([120, -80], 170, 80, 0, 58, CANVAS.widthPx / CANVAS.heightPx);
    const px = project(vp, CANVAS, 120, 0, -80) as [number, number];
    expect(px[0]).toBeCloseTo(640, 6);
    expect(px[1]).toBeCloseTo(372, 6);
  });
});

describe('signedDistance', () => {
  const square: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
  it('is positive inside, negative outside, and the distance to the boundary', () => {
    expect(signedDistance(square, 5, 3)).toBeCloseTo(3, 12);
    expect(signedDistance(square, 15, 5)).toBeCloseTo(-5, 12);
    expect(signedDistance(square, -3, -4)).toBeCloseTo(-5, 12);
  });
});

describe('expectedPatch', () => {
  // A smooth luminance field over the tile, so the patch the tile predicts can be checked against the field itself.
  const widthPx = 3626;
  const heightPx = 4096;
  const field = (tx: number, ty: number): number => 128 + 90 * Math.sin(tx * 0.05) * Math.cos(ty * 0.043) + 30 * Math.sin((tx + ty) * 0.021);
  const tile: TileGeometry = { corners: PARALLELOGRAM, widthPx, heightPx, origin: [632500, 4835000] };

  function renderRegion(box: { x: number; y: number; width: number; height: number }): Float64Array {
    const data = new Float64Array(box.width * box.height);
    for (let j = 0; j < box.height; j++) {
      for (let i = 0; i < box.width; i++) data[j * box.width + i] = field(box.x + i + 0.5, box.y + j + 0.5);
    }
    return data;
  }

  it('equals the field sampled where each canvas pixel lands, and correlates with a screenshot of it at offset 0, 0', () => {
    const [e, n] = tileToWorld(PARALLELOGRAM, widthPx, heightPx, 1800, 2100);
    const vp = viewProjection([e - 632500, n - 4835000], 170, 80, 0, 58, CANVAS.widthPx / CANVAS.heightPx);
    const centre = project(vp, CANVAS, e - 632500, 0, n - 4835000) as [number, number];
    const x0 = Math.floor(centre[0]) - 32;
    const y0 = Math.floor(centre[1]) - 32;

    const box = tileBoxForWindow(vp, CANVAS, tile, x0, y0, 64);
    expect(box.width).toBeGreaterThan(100);
    expect(box.width).toBeLessThan(400);
    const patch = expectedPatch(vp, CANVAS, tile, box, renderRegion(box), x0, y0, 64);

    // A "screenshot" of the same field at the same camera, drawn pixel by pixel at pixel centres.
    const ground = groundUnderPixel(vp, CANVAS);
    const shot = new Float64Array(CANVAS.widthPx * CANVAS.heightPx);
    for (let y = y0 - 10; y < y0 + 74; y++) {
      for (let x = x0 - 10; x < x0 + 74; x++) {
        const [gx, gz] = ground(x + 0.5, y + 0.5);
        const [tx, ty] = worldToTile(PARALLELOGRAM, widthPx, heightPx, gx + 632500, gz + 4835000);
        shot[y * CANVAS.widthPx + x] = 0.7 * field(tx, ty) + 20;
      }
    }
    const peak = bestOffset(patch, { width: CANVAS.widthPx, height: CANVAS.heightPx, data: shot }, x0, y0, 64, 8);
    expect([peak.dx, peak.dy]).toEqual([0, 0]);
    expect(peak.value).toBeGreaterThan(0.99);
    expect(window({ width: CANVAS.widthPx, height: CANVAS.heightPx, data: shot }, x0, y0, 64).length).toBe(4096);
  });
});
