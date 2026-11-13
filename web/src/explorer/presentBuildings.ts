/**
 * Today's buildings for the Player (spec 03 requirement 8.4, design.md "Scene features and heights").
 * They are context, not evidence: every building is drawn at the same fixed display height, and
 * that height is never shown as text anywhere. Pure.
 */
import type { PayloadOf } from '../bridge/bridge';
import type { PresentLayer } from '../evidence';

export type PresentBuilding = PayloadOf<'scene/init'>['present'][number];

/** Every present building's display height. No storey data is used (tech.md, "Present-day heights"). */
export const PRESENT_HEIGHT_M = 7.0;

/** The registry id of the layer that holds today's building outlines. */
export const PRESENT_BUILDINGS_SOURCE = 'present_toronto_building_outlines_2026';

type Ring = readonly (readonly number[])[];

function ringIsUsable(ring: Ring): boolean {
  if (ring.length < 4) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) return false;
  return ring.every((p) => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
}

export type PresentBuildingsResult = {
  buildings: PresentBuilding[];
  /** Features left out because the bridge could not carry them (not a polygon, open ring, repeated id). */
  skipped: number;
};

/** The scene's present buildings from the City building outlines layer. */
export function presentBuildings(layer: PresentLayer | undefined): PresentBuildingsResult {
  const buildings: PresentBuilding[] = [];
  let skipped = 0;
  if (!layer) return { buildings, skipped };

  const seen = new Set<string>();
  for (const feature of layer.features) {
    const geometry = feature.geometry;
    const id = String(feature.id);
    if ((geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') || id.length === 0 || id.length > 64 || seen.has(id)) {
      skipped++;
      continue;
    }
    const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates) as readonly (readonly Ring[])[];
    if (!polygons.every((polygon) => polygon.length > 0 && polygon.every(ringIsUsable))) {
      skipped++;
      continue;
    }
    seen.add(id);
    buildings.push({
      id,
      geometry: geometry as PresentBuilding['geometry'],
      heightM: PRESENT_HEIGHT_M,
    });
  }
  return { buildings, skipped };
}
