/**
 * The Landing's computed parts (spec 08 requirement 2, design "landing.ts"). Pure.
 *
 * `landingFact`: of the industrial land-use areas (lettering matches the Industrial list), group by the
 * lettered use, shrink each area inward by its own position error, and count the distinct address points
 * that fall inside the union. The largest count is the fact; nothing is typed in.
 *
 * `industrialLots` and `pickExamples`: the lots a trigger sits on (tag "Past industrial use recorded"),
 * one address each, and up to three of them for the "Try:" line.
 */
import { bufferScale, findBannedWords, industrialMatch, lotRelation } from '../evidence';
import type { Feature, FeatureCollection, PolygonalGeometry, PresentLayer, SourceRegistry } from '../evidence';
import { boundsOf, boxesOverlap } from '../report/cropPlan';
import { offsetOf, toJts, unionAll } from '../report/geom';
import type { Jts } from '../report/geom';
import { LOT_POSITION_ERROR_M } from '../report/lotError';
import { sentence, words } from '../report/sentence';
import type { Sentence, Slot } from '../report/sentence';
import { normaliseLettering, useParts } from './lettering';

export { normaliseLettering };

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/** "six", up to twelve; larger counts are digits and go in the fact pack. */
export function countWords(n: number): Slot {
  return n >= 0 && n < WORDS.length ? words(WORDS[n] as string) : { text: String(n), numbers: [String(n)] };
}

export type LandingFact = {
  sentence: Sentence;
  count: number;
  /** The normalised lettering the areas share: "coal and wood yard". */
  key: string;
  /** The distinct addresses inside the shrunk areas, sorted. */
  addresses: string[];
  /** The areas the fact counts in, unshrunk, as the evidence draws them. */
  areas: Array<{ featureId: string; sourceId: string; geometry: PolygonalGeometry }>;
};

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const SHRINK_SEGMENTS = 8;

/** The polygon shrunk inward by `distanceM`; never larger than the exact one (see `bufferScale`). */
function shrink(geometry: Jts, distanceM: number): Jts {
  return geometry.buffer(-distanceM * bufferScale(), SHRINK_SEGMENTS);
}

const isPolygonal = (g: { type: string }): g is PolygonalGeometry => g.type === 'Polygon' || g.type === 'MultiPolygon';

/** Published, registered, industrial areas. A feature whose source is not registered and confirmed is not counted. */
function industrialAreas(collections: readonly FeatureCollection[], registry: SourceRegistry): Array<{ feature: Feature; key: string }> {
  const ok = new Set(registry.sources.filter((s) => s.attribution_status === 'confirmed' && s.year_from !== null).map((s) => s.id));
  const out: Array<{ feature: Feature; key: string }> = [];
  for (const c of collections) {
    if (!ok.has(c.origin_source)) continue;
    for (const feature of c.features) {
      if (feature.properties.status !== 'published' || feature.properties.kind !== 'land_use') continue;
      const use = feature.properties.attributes.use;
      if (use === undefined || !isPolygonal(feature.geometry)) continue;
      const parts = useParts(use);
      if (industrialMatch(parts.whole) === null || findBannedWords(parts.whole).length > 0) continue;
      const key = normaliseLettering(use);
      if (key === '' || findBannedWords(key).length > 0) continue;
      out.push({ feature, key });
    }
  }
  return out;
}

export function landingFact(collections: readonly FeatureCollection[], addresses: PresentLayer | undefined, registry: SourceRegistry): LandingFact | null {
  if (!addresses) return null;
  const points = addresses.features.flatMap((f) => {
    const text = f.properties.ADDRESS_FULL;
    if (f.geometry.type !== 'Point' || typeof text !== 'string' || text === '' || findBannedWords(text).length > 0) return [];
    const [e, n] = f.geometry.coordinates as [number, number];
    return [{ text, e, n }];
  });
  const groups = new Map<string, Feature[]>();
  for (const { feature, key } of industrialAreas(collections, registry)) groups.set(key, [...(groups.get(key) ?? []), feature]);

  let best: { key: string; found: string[]; features: Feature[] } | null = null;
  for (const key of [...groups.keys()].sort(byString)) {
    const features = (groups.get(key) as Feature[]).sort((a, b) => byString(a.id, b.id));
    const shrunk: Jts[] = [];
    // One offset for the group, so the shrunk areas and the points share a frame.
    const lower = features.map((f) => boundsOf(f.geometry));
    const frame: readonly [number, number] = [Math.floor(Math.min(...lower.map((b) => b.minE))), Math.floor(Math.min(...lower.map((b) => b.minN)))];
    for (const f of features) {
      const s = shrink(toJts(f.geometry as PolygonalGeometry, frame), f.properties.position_error_m);
      if (!s.isEmpty()) shrunk.push(s);
    }
    const union = unionAll(shrunk);
    if (union === null) continue;
    const found = new Set<string>();
    for (const p of points) {
      if (union.intersects(toJts({ type: 'Point', coordinates: [p.e, p.n] }, frame))) found.add(p.text);
    }
    if (found.size === 0) continue;
    if (best === null || found.size > best.found.length) best = { key, found: [...found].sort(byString), features };
  }
  if (best === null) return null;
  const count = best.found.length;
  const fact = sentence`On this block, ${countWords(count)} ${words(count === 1 ? 'address stands' : 'addresses stand')} on a former ${{ text: best.key, verbatim: [best.key] }}.`;
  return {
    sentence: fact,
    count,
    key: best.key,
    addresses: best.found,
    areas: best.features.map((f) => ({ featureId: f.id, sourceId: f.properties.provenance.origin_source, geometry: f.geometry as PolygonalGeometry })),
  };
}

// ---------- examples ----------

export type TaggedLot = { lotId: string; addresses: readonly string[]; key: string };
export type Example = { lotId: string; address: string; key: string };

/**
 * The lots that carry the tag "Past industrial use recorded": a lot with an industrial building or area on
 * it, by `lotRelation` ("on this lot", with the lot's position error), with the lot's addresses and the
 * lettering key of the earliest trigger. A lot with no address point is left out (there is nothing to try).
 * Sorted by lot id.
 */
export function industrialLots(collections: readonly FeatureCollection[], lots: PresentLayer | undefined, addresses: PresentLayer | undefined, registry: SourceRegistry): TaggedLot[] {
  if (!lots || !addresses) return [];
  const ok = new Map(registry.sources.filter((s) => s.attribution_status === 'confirmed' && s.year_from !== null).map((s) => [s.id, s.year_from as number]));
  const triggers: Array<{ feature: Feature; key: string; year: number }> = [];
  for (const c of collections) {
    const year = ok.get(c.origin_source);
    if (year === undefined) continue;
    for (const feature of c.features) {
      if (feature.properties.status !== 'published' || feature.properties.kind === 'water') continue;
      const use = feature.properties.attributes.use;
      if (use === undefined || !isPolygonal(feature.geometry)) continue;
      const parts = useParts(use);
      if (industrialMatch(parts.whole) === null) continue;
      const key = normaliseLettering(use);
      if (key === '' || findBannedWords(parts.whole).length > 0) continue;
      triggers.push({ feature, key, year });
    }
  }
  triggers.sort((a, b) => a.year - b.year || byString(a.feature.id, b.feature.id));
  const out: TaggedLot[] = [];
  for (const lot of lots.features) {
    if (!isPolygonal(lot.geometry)) continue;
    const lotBox = boundsOf(lot.geometry);
    const on = triggers.filter((t) => {
      if (!boxesOverlap(boundsOf(t.feature.geometry), lotBox)) return false;
      try {
        return lotRelation({ geometry: t.feature.geometry, positionErrorM: t.feature.properties.position_error_m }, { geometry: lot.geometry as PolygonalGeometry, positionErrorM: LOT_POSITION_ERROR_M }).kind === 'on';
      } catch {
        return false;
      }
    });
    if (on.length === 0) continue;
    const offset = offsetOf(lot.geometry);
    const lotJts = toJts(lot.geometry, offset);
    const found = new Set<string>();
    for (const a of addresses.features) {
      const text = a.properties.ADDRESS_FULL;
      if (a.geometry.type !== 'Point' || typeof text !== 'string' || text === '' || findBannedWords(text).length > 0) continue;
      if (lotJts.intersects(toJts(a.geometry, offset))) found.add(text);
    }
    if (found.size === 0) continue;
    out.push({ lotId: lot.id, addresses: [...found].sort(byString), key: (on[0] as (typeof on)[number]).key });
  }
  return out.sort((a, b) => byString(a.lotId, b.lotId));
}

/**
 * Up to three distinct lots for "Try:", one address each (the first by text), one per distinct lettering
 * first, then filled by address text, shown in address order.
 */
export function pickExamples(tagged: readonly TaggedLot[], limit = 3): Example[] {
  const candidates: Example[] = tagged
    .filter((t) => t.addresses.length > 0)
    .map((t) => ({ lotId: t.lotId, address: [...t.addresses].sort(byString)[0] as string, key: t.key }))
    .sort((a, b) => byString(a.address, b.address) || byString(a.lotId, b.lotId));
  const chosen: Example[] = [];
  const keys = new Set<string>();
  for (const c of candidates) {
    if (chosen.length >= limit) break;
    if (keys.has(c.key)) continue;
    keys.add(c.key);
    chosen.push(c);
  }
  for (const c of candidates) {
    if (chosen.length >= limit) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  return chosen.sort((a, b) => byString(a.address, b.address) || byString(a.lotId, b.lotId));
}
