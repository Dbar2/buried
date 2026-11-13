/**
 * Example addresses for the landing (session 024): real address points whose lot has a published
 * feature within 15 m, chosen from the loaded data. Nothing is hard-coded. The choice is
 * deterministic: candidates are taken in address order, one per street first, so the three examples
 * are on different streets when the data allows it.
 */
import { findBannedWords } from '../evidence';
import type { FeatureCollection, PresentLayer } from '../evidence';
import { boundsOf, boxesOverlap } from './cropPlan';
import { offsetOf, toJts } from './geom';
import { lotForPoint } from './search';

export const EXAMPLE_RADIUS_M = 15;

export type Example = { address: string; lotId: string };

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function exampleAddresses(
  addresses: PresentLayer | undefined,
  lots: PresentLayer | undefined,
  collections: readonly FeatureCollection[],
  count = 3,
  radiusM = EXAMPLE_RADIUS_M,
): Example[] {
  if (!addresses || !lots) return [];
  const features = collections.flatMap((c) => c.features).filter((f) => f.properties.status === 'published');
  const boxes = features.map((f) => ({ f, box: boundsOf(f.geometry) }));
  const lotsById = new Map(lots.features.map((l) => [l.id, l]));

  const hasNearby = new Map<string, boolean>();
  const nearby = (lotId: string): boolean => {
    const cached = hasNearby.get(lotId);
    if (cached !== undefined) return cached;
    const lot = lotsById.get(lotId);
    let found = false;
    if (lot && (lot.geometry.type === 'Polygon' || lot.geometry.type === 'MultiPolygon')) {
      const lb = boundsOf(lot.geometry);
      const grown = { minE: lb.minE - radiusM, minN: lb.minN - radiusM, maxE: lb.maxE + radiusM, maxN: lb.maxN + radiusM };
      const offset = offsetOf(lot.geometry);
      const lotJts = toJts(lot.geometry, offset);
      for (const { f, box } of boxes) {
        if (!boxesOverlap(grown, box)) continue;
        try {
          if (lotJts.distance(toJts(f.geometry, offset)) <= radiusM) {
            found = true;
            break;
          }
        } catch {
          // A geometry JTS cannot read is not counted.
        }
      }
    }
    hasNearby.set(lotId, found);
    return found;
  };

  type Candidate = Example & { street: string };
  const candidates: Candidate[] = [];
  const seenLots = new Set<string>();
  const points = addresses.features
    .filter((f) => f.geometry.type === 'Point' && typeof f.properties.ADDRESS_FULL === 'string' && findBannedWords(f.properties.ADDRESS_FULL as string).length === 0)
    .sort((a, b) => byString(String(a.properties.ADDRESS_FULL), String(b.properties.ADDRESS_FULL)) || byString(a.id, b.id));
  for (const p of points) {
    if (candidates.length >= 80) break;
    const [e, n] = (p.geometry as { coordinates: [number, number] }).coordinates;
    const lotId = lotForPoint(lots, [e, n]);
    if (lotId === null || seenLots.has(lotId) || !nearby(lotId)) continue;
    seenLots.add(lotId);
    candidates.push({ address: String(p.properties.ADDRESS_FULL), lotId, street: String(p.properties.LINEAR_NAME_FULL ?? '') });
  }

  // One per street first, in street order, then anything left.
  const chosen: Candidate[] = [];
  const streets = new Set<string>();
  for (const c of candidates) {
    if (chosen.length >= count) break;
    if (streets.has(c.street)) continue;
    streets.add(c.street);
    chosen.push(c);
  }
  for (const c of candidates) {
    if (chosen.length >= count) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  return chosen.map(({ address, lotId }) => ({ address, lotId }));
}
