/**
 * What the Flat sheet (spec 06 requirement 11.3) draws for an era, and where a point of the ground lands on screen.
 * Pure: the model goes in; a tile, footprints, today's outlines and viewport positions come out. The tile is the
 * era's own drape; Today shows the raise era's tile, dimmed, under today's outlines.
 */
import { featureRows } from '../explorer/featureList';
import type { GateModel } from '../explorer/gateModel';
import type { Drape } from '../explorer/drapes';
import type { FlatFootprint, FlatTile } from './FlatSheet';
import { ringsOfGeometry, RAISE_ERA_ID } from './blockModel';
import { makeSheetTransform, worldToPixel } from './sheetTransform';
import type { Pt } from './sheetTransform';

const pt = (p: readonly number[]): Pt => [p[0] as number, p[1] as number];

export function tileOfDrape(drape: Drape): FlatTile {
  return {
    src: drape.url,
    widthPx: drape.widthPx,
    heightPx: drape.heightPx,
    corners: {
      top_left: pt(drape.corners.topLeft),
      top_right: pt(drape.corners.topRight),
      bottom_right: pt(drape.corners.bottomRight),
      bottom_left: pt(drape.corners.bottomLeft),
    },
  };
}

/** The tile the Flat sheet shows for an era: its first drape's, or the raise era's at Today. Null when there is none. */
export function flatTileFor(model: Pick<GateModel, 'drapes' | 'order'>, eraId: string): FlatTile | null {
  const era = model.order.find((e) => e.id === eraId);
  const id = era && era.index === 0 ? RAISE_ERA_ID : eraId;
  const drape = model.drapes.get(id)?.[0];
  return drape ? tileOfDrape(drape) : null;
}

/** The footprints of an era's list, in the list's order, with the accessible name the list view also gives. */
export function flatFootprints(model: Pick<GateModel, 'lists' | 'features'>, eraId: string): FlatFootprint[] {
  const list = model.lists.get(eraId);
  const names = new Map(featureRows(list, model.features).map((row) => [row.id, row.name]));
  return (list?.features ?? []).map((entry) => ({
    id: entry.id,
    rings: ringsOfGeometry(entry.geometry),
    confidence: entry.confidence,
    name: names.get(entry.id) ?? 'Feature',
  }));
}

/** Today's building outlines, one ring list per building, for the Today stop. */
export function flatPresent(model: Pick<GateModel, 'present'>): Pt[][][] {
  return model.present.map((b) => ringsOfGeometry(b.geometry));
}

export type Box = { readonly w: number; readonly h: number };

/**
 * A point on the ground as a position in the box the Flat sheet fills. The SVG draws the tile with `xMidYMid meet`, so
 * the tile is scaled to fit and centred; the point goes through the sheet's transform and then that fit.
 */
export function flatViewportPoint(tile: FlatTile, world: Pt, box: Box): { x: number; y: number; onScreen: boolean } {
  if (box.w <= 0 || box.h <= 0) return { x: 0, y: 0, onScreen: false };
  const [px, py] = worldToPixel(makeSheetTransform(tile.corners, tile.widthPx, tile.heightPx), world);
  const scale = Math.min(box.w / tile.widthPx, box.h / tile.heightPx);
  const x = (box.w - tile.widthPx * scale) / 2 + px * scale;
  const y = (box.h - tile.heightPx * scale) / 2 + py * scale;
  return { x, y, onScreen: x >= 0 && x <= box.w && y >= 0 && y <= box.h };
}
