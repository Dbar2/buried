/**
 * Finding a lot for the Report from an address in the clipped City address points. Pure: a lookup in
 * two present layers. No geocoder and no network. An address that is not in the layer, or whose
 * point lies in no lot, gives no lot, and the Report then says "Not reconstructed yet.".
 */
import { findBannedWords } from '../evidence';
import type { PresentLayer } from '../evidence';
import { offsetOf, toJts } from './geom';
import type { Offset } from './geom';

export type AddressHit = { id: string; text: string; point: [number, number] };

export function searchAddresses(layer: PresentLayer | undefined, query: string, limit = 8): AddressHit[] {
  const needle = query.trim().toLowerCase();
  if (!layer || needle.length < 2) return [];
  const hits: Array<AddressHit & { rank: number }> = [];
  for (const f of layer.features) {
    if (f.geometry.type !== 'Point') continue;
    const text = f.properties.ADDRESS_FULL;
    if (typeof text !== 'string' || findBannedWords(text).length > 0) continue;
    const lower = text.toLowerCase();
    if (!lower.includes(needle)) continue;
    const [e, n] = f.geometry.coordinates as [number, number];
    // An exact match comes first, so Enter on a full address opens that address and not "112" for "12".
    hits.push({ id: f.id, text, point: [e, n], rank: lower === needle ? 0 : lower.startsWith(needle) ? 1 : 2 });
  }
  return hits
    .sort((a, b) => a.rank - b.rank || (a.text < b.text ? -1 : a.text > b.text ? 1 : a.id < b.id ? -1 : 1))
    .slice(0, limit)
    .map(({ rank: _rank, ...hit }) => hit);
}

function bounds(coordinates: unknown, box: [number, number, number, number]): void {
  if (Array.isArray(coordinates) && typeof coordinates[0] === 'number') {
    const [x, y] = coordinates as [number, number];
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  } else if (Array.isArray(coordinates)) {
    for (const part of coordinates) bounds(part, box);
  }
}

/** The id of the lot that contains the point, or null. Ties go to the smallest id. */
export function lotForPoint(lots: PresentLayer | undefined, point: readonly [number, number]): string | null {
  if (!lots) return null;
  const found: string[] = [];
  for (const lot of lots.features) {
    if (lot.geometry.type === 'Point') continue;
    const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
    bounds(lot.geometry.coordinates, box);
    if (point[0] < box[0] || point[0] > box[2] || point[1] < box[1] || point[1] > box[3]) continue;
    const offset: Offset = offsetOf(lot.geometry);
    try {
      if (toJts(lot.geometry, offset).intersects(toJts({ type: 'Point', coordinates: [point[0], point[1]] }, offset))) found.push(lot.id);
    } catch {
      // A lot JTS cannot read cannot be picked.
    }
  }
  return found.sort()[0] ?? null;
}
