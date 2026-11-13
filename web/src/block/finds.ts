/**
 * Loads `data/finds.json` and checks it against the data the page has loaded (spec 06 W4, requirement 8).
 *
 * The pipeline's Validator is the authority on the file (`buried validate`). This module repeats only what a page
 * needs before it draws a tag or a card, and drops what does not resolve, saying why in `problems`:
 *  - a reading whose source is not registered, whose feature is not a published feature of that source, or whose crop
 *    is not inside the tile's crop of the source, is dropped;
 *  - a find with no reading left is dropped (no tag, no card);
 *  - a slug that repeats keeps its first find.
 * Nothing here words a sentence or decides a date.
 */
import { parseFindsFile } from '../evidence';
import type { Feature, Find, Reading, Source, TileSidecar } from '../evidence';
import type { FetchText, LoadedData } from '../data/loadData';

/** A rectangle in tile pixels. */
export type TileRect = { x: number; y: number; width: number; height: number };

export type ResolvedReading = {
  reading: Reading;
  source: Source;
  feature: Feature;
  /** The tile sidecar of the reading's source, when one is loaded. */
  tile: TileSidecar | null;
  /** The reading's crop in the tile's pixels, or null when no tile is loaded for the source. */
  tileRect: TileRect | null;
};

export type ResolvedFind = {
  find: Find;
  /** Resolved readings, earliest plan first. */
  readings: ResolvedReading[];
  /** The reading the card opens on: the earliest plan's. */
  primary: ResolvedReading;
};

export type FindsResult = { finds: ResolvedFind[]; problems: string[] };

/** The crop (source pixels) in the tile's pixels, or null when the tile does not hold the whole crop. */
export function cropInTile(crop: Reading['crop_px'], tile: TileSidecar): TileRect | null {
  const area = tile.crop_px;
  if (!area || area.width <= 0 || area.height <= 0) return null;
  const inside =
    crop.x >= area.x && crop.y >= area.y && crop.x + crop.width <= area.x + area.width && crop.y + crop.height <= area.y + area.height;
  if (!inside) return null;
  const sx = tile.width_px / area.width;
  const sy = tile.height_px / area.height;
  const x = Math.round((crop.x - area.x) * sx);
  const y = Math.round((crop.y - area.y) * sy);
  const right = Math.round((crop.x + crop.width - area.x) * sx);
  const bottom = Math.round((crop.y + crop.height - area.y) * sy);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

const bySource = (a: ResolvedReading, b: ResolvedReading): number => {
  const ay = a.source.year_from ?? a.source.year_to;
  const by = b.source.year_from ?? b.source.year_to;
  if (ay !== by) return ay - by;
  return a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0;
};

/** Resolve the finds of a parsed file against loaded data. */
export function resolveFinds(
  file: { finds: readonly Find[] },
  data: Pick<LoadedData, 'sources' | 'evidence' | 'tiles'>,
): FindsResult {
  const problems: string[] = [];
  const features = new Map<string, Feature>();
  for (const collection of data.evidence) {
    for (const feature of collection.features) {
      if (feature.properties.status === 'published') features.set(feature.id, feature);
    }
  }
  const tiles = new Map(data.tiles.map((t) => [t.source, t] as const));

  const seenSlugs = new Set<string>();
  const finds: ResolvedFind[] = [];
  for (const find of [...file.finds].sort((a, b) => a.order - b.order)) {
    if (seenSlugs.has(find.slug)) {
      problems.push(`The find ${find.id} was left out: its slug ${find.slug} is already used.`);
      continue;
    }
    const readings: ResolvedReading[] = [];
    for (const reading of find.readings) {
      const source = data.sources.get(reading.source);
      if (!source) {
        problems.push(`A reading of ${find.id} was left out: ${reading.source} is not in the source registry.`);
        continue;
      }
      const feature = features.get(reading.feature_id);
      if (!feature || feature.properties.provenance.origin_source !== reading.source) {
        problems.push(`A reading of ${find.id} was left out: ${reading.feature_id} is not a published feature of ${reading.source}.`);
        continue;
      }
      const tile = tiles.get(reading.source) ?? null;
      let tileRect: TileRect | null = null;
      if (tile) {
        tileRect = cropInTile(reading.crop_px, tile);
        if (!tileRect) {
          problems.push(`A reading of ${find.id} was left out: its crop is not inside the tile of ${reading.source}.`);
          continue;
        }
      }
      readings.push({ reading, source, feature, tile, tileRect });
    }
    if (readings.length === 0) {
      problems.push(`The find ${find.id} was left out: no reading of it resolves.`);
      continue;
    }
    readings.sort(bySource);
    seenSlugs.add(find.slug);
    finds.push({ find, readings, primary: readings[0] as ResolvedReading });
  }
  return { finds, problems };
}

/** Fetch, parse and resolve `finds.json`. A missing or invalid file gives no finds and one problem. */
export async function loadFinds(fetchText: FetchText, data: Pick<LoadedData, 'sources' | 'evidence' | 'tiles'>): Promise<FindsResult> {
  let text: string;
  try {
    text = await fetchText('finds.json');
  } catch (error) {
    return { finds: [], problems: [`The finds file could not be read: ${error instanceof Error ? error.message : String(error)}.`] };
  }
  try {
    return resolveFinds(parseFindsFile(text), data);
  } catch (error) {
    return { finds: [], problems: [`The finds file was left out: ${error instanceof Error ? error.message : String(error)}.`] };
  }
}

/** The find whose slug it is, or undefined. */
export function findBySlug(finds: readonly ResolvedFind[], slug: string): ResolvedFind | undefined {
  return finds.find((f) => f.find.slug === slug);
}

/** The find that has `featureId` as one of its readings' features, or undefined. */
export function findForFeature(finds: readonly ResolvedFind[], featureId: string): ResolvedFind | undefined {
  return finds.find((f) => f.readings.some((r) => r.reading.feature_id === featureId));
}
