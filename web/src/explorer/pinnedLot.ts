/**
 * The pinned lot (bridge 0.5.0, scene/focusLot). The page `/?lot=<id>` pins the City property
 * boundary with that id: the Player outlines it on the ground, lights it and flies the camera to
 * frame it. The Shell only finds the polygon; which lots exist is the City layer's business, and
 * whether anything stood on a lot is the Evidence Library's. Pure.
 */
import type { MessageOf, PayloadOf } from '../bridge/bridge';
import type { PresentLayer } from '../evidence';

/** The registry id of the layer that holds the lots (sources.md, "Present-day sources"). */
export const LOTS_SOURCE = 'present_toronto_property_boundaries_2026';

export type LotPolygon = PayloadOf<'scene/focusLot'>['lot'];

type Ring = readonly (readonly number[])[];

function ringIsUsable(ring: Ring): boolean {
  if (ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) return false;
  return ring.every((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

/** The lot's polygon, or null when there is no such lot or the bridge could not carry its shape. */
export function lotPolygon(layer: PresentLayer | undefined, lotId: string | null): LotPolygon | null {
  if (!layer || lotId === null || lotId === '') return null;
  const feature = layer.features.find((f) => String(f.id) === lotId);
  if (!feature) return null;
  const geometry = feature.geometry;
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') return null;
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as readonly (readonly Ring[])[];
  if (!polygons.every((polygon) => polygon.length > 0 && polygon.every(ringIsUsable))) return null;
  return geometry as LotPolygon;
}

export function buildFocusLot(lot: LotPolygon): MessageOf<'scene/focusLot'> {
  return { type: 'scene/focusLot', payload: { lot } };
}

export function buildClearLot(): MessageOf<'scene/clearLot'> {
  return { type: 'scene/clearLot', payload: {} };
}

/** "View original scan" (mode 'original') and back (mode 'lit'), for one drape or, with no source, for all of them. */
export function buildSetDrapeMode(mode: 'lit' | 'original', sourceId?: string): MessageOf<'scene/setDrapeMode'> {
  return { type: 'scene/setDrapeMode', payload: sourceId === undefined ? { mode } : { mode, sourceId } };
}
