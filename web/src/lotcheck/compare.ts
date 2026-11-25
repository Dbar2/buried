/**
 * The compare view's model (spec 08 design "Compare view", requirement 5). Pure.
 *
 * One `SheetTransform` from the plan tile's sidecar places everything: the lot outline, today's building
 * outlines and today's lot lines are all drawn in tile pixels, in one viewBox, so the plan on the left and
 * today on the right agree by construction. The divider is not an input: it only decides how much of the
 * today layer is visible, so it cannot move the outline or the viewBox (requirement 5.2).
 */
import { makeSheetTransform, ringsToPath, worldToPixel } from '../block/sheetTransform';
import type { Pt, TileCorners } from '../block/sheetTransform';

/** `mapArea`: the plate's map-area polygon in EPSG:26917 (the sidecar's `map_area`), when the sidecar has one. */
export type CompareTile = { corners: TileCorners; widthPx: number; heightPx: number; mapArea?: WorldPolygon };

/** Polygon rings in EPSG:26917 metres; one entry per polygon (outer ring first). */
export type WorldPolygon = ReadonlyArray<ReadonlyArray<Pt>>;

export type CompareInput = {
  /** The lot's rings. */
  lot: WorldPolygon;
  tile: CompareTile;
  /** Today's building outlines. */
  buildings: readonly WorldPolygon[];
  /** Today's lot lines. */
  lots: readonly WorldPolygon[];
  /** The outlines of the lettered uses on the lot, from the evidence (session 053). */
  stood?: readonly WorldPolygon[];
  /** Metres added on each side of the lot's bounding box. Requirement 5.3: 15. */
  marginM?: number;
  /** Frame width over height: 4/3 on a desktop, 1 on a phone. */
  aspect?: number;
};

export type ViewBox = { x: number; y: number; width: number; height: number };

/** `share`: the part of the frame (0..1) the sheet does not cover. `atX`, `atY`: where its middle is, in per cent of the frame. */
export type Uncovered = { share: number; atX: number; atY: number };

export type CompareModel = {
  viewBox: ViewBox;
  /** The viewBox as the `viewBox` attribute writes it. */
  viewBoxText: string;
  lotPath: string;
  presentPaths: string[];
  lotLinePaths: string[];
  /** The outlines of the lettered uses on the lot ("where it stood"), drawn on today's side. */
  stoodPaths: string[];
  /** The map area as a pixel path, to clip the scan to, or null when the sidecar has none. */
  mapAreaPath: string | null;
  /** Where the frame reaches past the sheet's map area, or null when the sheet covers all of it. */
  uncovered: Uncovered | null;
};

export const COMPARE_MARGIN_M = 15;

function bounds(points: readonly Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Pixel-space viewBox: the lot's bounding box grown by `marginM`, padded to `aspect` about the lot's centre, so the
 * lot is always in the middle of the frame. Where the frame reaches past the sheet, the sheet shows nothing there
 * (see `uncoveredBy`); the frame is not moved to hide that.
 */
export function frameFor(lot: WorldPolygon, tile: CompareTile, marginM: number, aspect: number): ViewBox {
  const t = makeSheetTransform(tile.corners, tile.widthPx, tile.heightPx);
  const [tl, tr] = [tile.corners.top_left, tile.corners.top_right];
  const metresAcross = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const pxPerM = metresAcross > 0 ? tile.widthPx / metresAcross : 1;
  const lotPx = bounds(lot.flat().map((p) => worldToPixel(t, p)));
  const margin = marginM * pxPerM;
  let width = lotPx.maxX - lotPx.minX + 2 * margin;
  let height = lotPx.maxY - lotPx.minY + 2 * margin;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  const cx = (lotPx.minX + lotPx.maxX) / 2;
  const cy = (lotPx.minY + lotPx.maxY) / 2;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** True when `p` is inside the polygon `rings` (even-odd rule). Pure. */
export function pointInRings(p: Pt, rings: ReadonlyArray<ReadonlyArray<Pt>>): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as Pt;
      const [xj, yj] = ring[j] as Pt;
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

const COVER_SAMPLES = 25;

/**
 * The part of `box` (pixel space) that the sheet does not cover, from a grid of sample points tested against the
 * map area in pixels (or, with no map area, the tile's own rectangle). Null when every sample is covered.
 */
export function uncoveredBy(box: ViewBox, areaPx: ReadonlyArray<ReadonlyArray<Pt>> | null, widthPx: number, heightPx: number): Uncovered | null {
  let missing = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < COVER_SAMPLES; i++) {
    for (let j = 0; j < COVER_SAMPLES; j++) {
      const fx = (i + 0.5) / COVER_SAMPLES;
      const fy = (j + 0.5) / COVER_SAMPLES;
      const p: Pt = [box.x + fx * box.width, box.y + fy * box.height];
      const covered = areaPx ? pointInRings(p, areaPx) : p[0] >= 0 && p[0] <= widthPx && p[1] >= 0 && p[1] <= heightPx;
      if (!covered) {
        missing += 1;
        sx += fx;
        sy += fy;
      }
    }
  }
  if (missing === 0) return null;
  return { share: missing / (COVER_SAMPLES * COVER_SAMPLES), atX: (sx / missing) * 100, atY: (sy / missing) * 100 };
}

const round1 = (v: number): number => Math.round(v * 10) / 10;

function meets(box: ViewBox, polygon: WorldPolygon, t: ReturnType<typeof makeSheetTransform>): boolean {
  const b = bounds(polygon.flat().map((p) => worldToPixel(t, p)));
  return b.minX < box.x + box.width && b.maxX > box.x && b.minY < box.y + box.height && b.maxY > box.y;
}

export function compareModel(input: CompareInput): CompareModel {
  const marginM = input.marginM ?? COMPARE_MARGIN_M;
  const aspect = input.aspect ?? 4 / 3;
  const t = makeSheetTransform(input.tile.corners, input.tile.widthPx, input.tile.heightPx);
  const raw = frameFor(input.lot, input.tile, marginM, aspect);
  const viewBox: ViewBox = { x: round1(raw.x), y: round1(raw.y), width: round1(raw.width), height: round1(raw.height) };
  const draw = (list: readonly WorldPolygon[]): string[] => list.filter((p) => meets(viewBox, p, t)).map((p) => ringsToPath(t, p));
  const area = input.tile.mapArea;
  const areaPx = area ? area.map((ring) => ring.map((p) => worldToPixel(t, p))) : null;
  return {
    viewBox,
    viewBoxText: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    lotPath: ringsToPath(t, input.lot),
    presentPaths: draw(input.buildings),
    lotLinePaths: draw(input.lots),
    stoodPaths: draw(input.stood ?? []),
    mapAreaPath: area ? ringsToPath(t, area) : null,
    uncovered: uncoveredBy(viewBox, areaPx, input.tile.widthPx, input.tile.heightPx),
  };
}
