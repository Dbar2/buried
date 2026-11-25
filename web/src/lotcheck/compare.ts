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

export type CompareTile = { corners: TileCorners; widthPx: number; heightPx: number };

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
  /** Metres added on each side of the lot's bounding box. Requirement 5.3: 40. */
  marginM?: number;
  /** Frame width over height: 4/3 on a desktop, 1 on a phone. */
  aspect?: number;
};

export type ViewBox = { x: number; y: number; width: number; height: number };

export type CompareModel = {
  viewBox: ViewBox;
  /** The viewBox as the `viewBox` attribute writes it. */
  viewBoxText: string;
  lotPath: string;
  presentPaths: string[];
  lotLinePaths: string[];
};

export const COMPARE_MARGIN_M = 40;

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

/** Pixel-space viewBox of the lot's bounding box grown by `marginM`, padded to `aspect` about its centre. */
export function frameFor(lot: WorldPolygon, tile: CompareTile, marginM: number, aspect: number): ViewBox {
  const t = makeSheetTransform(tile.corners, tile.widthPx, tile.heightPx);
  const world = bounds(lot.flat());
  const corners: Pt[] = [
    [world.minX - marginM, world.minY - marginM],
    [world.maxX + marginM, world.minY - marginM],
    [world.maxX + marginM, world.maxY + marginM],
    [world.minX - marginM, world.maxY + marginM],
  ];
  const px = bounds(corners.map((c) => worldToPixel(t, c)));
  let width = px.maxX - px.minX;
  let height = px.maxY - px.minY;
  const cx = (px.minX + px.maxX) / 2;
  const cy = (px.minY + px.maxY) / 2;
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  return { x: cx - width / 2, y: cy - height / 2, width, height };
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
  return {
    viewBox,
    viewBoxText: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    lotPath: ringsToPath(t, input.lot),
    presentPaths: draw(input.buildings),
    lotLinePaths: draw(input.lots),
  };
}
