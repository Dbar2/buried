/**
 * The 2D fallback for the scene (session 029): what to draw when the Player cannot run. The era's
 * untouched tiles, today's outlines at Today, every feature of the era's list drawn over them, and
 * the pinned lot outlined. Pure: it only arranges geometry the model already holds, so the footprint
 * count is the era list's count by construction, and no date or confidence is decided here.
 */
import type { PolygonalGeometry } from '../evidence';
import { boundsOf, cropWindow, ringsOf } from '../report/cropPlan';
import type { CropWindow, Pt, TileRef } from '../report/cropPlan';
import { tileRef } from '../report/cropPlan';
import type { GateModel } from './gateModel';
import type { LotPolygon } from './pinnedLot';

export type FallbackFootprint = {
  id: string;
  confidence: 'documented' | 'estimated' | 'unknown';
  /** Polygon rings (closed) or line strings (open). */
  rings: Pt[][];
  closed: boolean;
};

export type FallbackPlan = {
  eraId: string;
  /** The square of ground the drawing is centred on, EPSG:26917 metres. */
  window: CropWindow;
  /** The era's untouched tiles, in draw order. */
  tiles: TileRef[];
  /** Today's outlines near the window, drawn only at Today. */
  present: Pt[][][];
  /** One per entry of the era's list, in the list's order. */
  footprints: FallbackFootprint[];
  lot: Pt[][] | null;
  /** True when the era has no picture to draw under the footprints. */
  noPicture: boolean;
};

export const FALLBACK_MARGIN_M = 30;

type Box = { minE: number; minN: number; maxE: number; maxN: number };

const merge = (a: Box | null, b: Box): Box =>
  a === null
    ? b
    : { minE: Math.min(a.minE, b.minE), minN: Math.min(a.minN, b.minN), maxE: Math.max(a.maxE, b.maxE), maxN: Math.max(a.maxN, b.maxN) };

/** Why the Player is not shown, in one plain sentence. */
export function fallbackReason(webgl2: boolean, unavailable: string | null, noWebgl2Message: string): string {
  if (!webgl2) return `${noWebgl2Message} The map below shows the same records.`;
  return `The 3D view did not load${unavailable ? `: ${unavailable}` : '.'} The map below shows the same records.`;
}

export function fallbackPlan(model: GateModel, eraId: string, lot: LotPolygon | null): FallbackPlan {
  const info = model.order.find((e) => e.id === eraId) ?? model.order[0];
  if (!info) throw new Error('The model has no eras');
  const list = model.lists.get(info.id);

  const footprints: FallbackFootprint[] = (list?.features ?? []).map((entry) => {
    const g = entry.geometry;
    const closed = g.type === 'Polygon' || g.type === 'MultiPolygon';
    const rings: Pt[][] = closed
      ? ringsOf(g as PolygonalGeometry)
      : (g.type === 'LineString' ? [g.coordinates] : g.coordinates).map((line) => (line as number[][]).map((p) => [p[0] as number, p[1] as number] as Pt));
    return { id: entry.id, confidence: entry.confidence, rings, closed };
  });

  const lotRings = lot ? ringsOf(lot as PolygonalGeometry) : null;

  let box: Box | null = null;
  for (const f of list?.features ?? []) box = merge(box, boundsOf(f.geometry));
  if (lot) box = merge(box, boundsOf(lot));
  let window: CropWindow;
  if (box) {
    window = cropWindow({ coordinates: [[[box.minE, box.minN], [box.maxE, box.maxN]]] }, FALLBACK_MARGIN_M);
  } else {
    const v = model.initialView;
    window = cropWindow({ coordinates: [[[v.minE, v.minN], [v.maxE, v.maxN]]] }, 0);
  }

  const tiles = (model.drapes.get(info.id) ?? []).flatMap((d) => {
    const tile = model.tiles.find((t) => t.source === d.sourceId);
    return tile ? [tileRef(tile)] : [];
  });

  const present: Pt[][][] =
    info.index === 0
      ? model.present
          .filter((b) => {
            const bb = boundsOf(b.geometry);
            const w = { minE: window.minE, minN: window.minN, maxE: window.minE + window.side, maxN: window.minN + window.side };
            return bb.minE < w.maxE && w.minE < bb.maxE && bb.minN < w.maxN && w.minN < bb.maxN;
          })
          .map((b) => ringsOf(b.geometry as PolygonalGeometry))
      : [];

  return {
    eraId: info.id,
    window,
    tiles,
    present,
    footprints,
    lot: lotRings,
    noPicture: info.index === 0 ? present.length === 0 : tiles.length === 0,
  };
}
