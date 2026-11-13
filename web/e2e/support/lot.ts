/**
 * The id of the lot, in the committed City layer, that contains the committed 1911 building
 * `bld_fip_v3_1911_229_0001`: a lot with something on it. Read from the repository's data files.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../..', import.meta.url));
const DATA = join(WEB, '..', 'data');

type Ring = number[][];
const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;

function inside(point: [number, number], ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export function lotWithTheBuilding(): string {
  const evidence = readJson<{ features: Array<{ id: string; geometry: { coordinates: Ring[] } }> }>('evidence', 'fip_v3_1911_229.geojson');
  const building = evidence.features.find((f) => f.id === 'bld_fip_v3_1911_229_0001');
  if (!building) throw new Error('the committed building is missing');
  const ring = building.geometry.coordinates[0] as Ring;
  const centre: [number, number] = [ring.reduce((s, p) => s + (p[0] as number), 0) / ring.length, ring.reduce((s, p) => s + (p[1] as number), 0) / ring.length];
  const lots = readJson<{ features: Array<{ id: string; geometry: { type: string; coordinates: Ring[] | Ring[][] } }> }>('present', 'present_toronto_property_boundaries_2026.geojson');
  for (const lot of lots.features) {
    const polygons = (lot.geometry.type === 'MultiPolygon' ? lot.geometry.coordinates : [lot.geometry.coordinates]) as Ring[][];
    if (polygons.some((p) => inside(centre, p[0] as Ring))) return lot.id;
  }
  throw new Error('no lot contains the committed building');
}
