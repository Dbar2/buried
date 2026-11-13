/**
 * Drapes: the source rasters laid on the ground (spec 03 requirements 8.2 and 21.1).
 *
 * A tile is a drape in an era when its source's rights are confirmed and the source's year range
 * contains the era's year range. These rules use source years, which is why they run in the Shell:
 * the Player never sees a year. They choose which image to show; they do not date any feature.
 */
import type { PayloadOf } from '../bridge/bridge';
import type { Era, SourceIndex, TileSidecar } from '../evidence';

export type Drape = PayloadOf<'scene/loadEra'>['drapes'][number];

/**
 * The tile as a bridge drape. The URL is below /data/tiles/, where the data plugin serves it.
 * `clip` is the sidecar's `map_area` when it has one (bridge 0.3.0) and is left out when it has
 * none. The full photograph (`full_image`) is never a drape.
 */
export function toDrape(tile: TileSidecar): Drape {
  const drape: Drape = {
    sourceId: tile.source,
    url: `/data/tiles/${tile.image}`,
    corners: {
      topLeft: tile.corners.top_left,
      topRight: tile.corners.top_right,
      bottomRight: tile.corners.bottom_right,
      bottomLeft: tile.corners.bottom_left,
    },
    widthPx: tile.width_px,
    heightPx: tile.height_px,
  };
  if (tile.map_area) drape.clip = { type: 'Polygon', coordinates: tile.map_area.coordinates };
  return drape;
}

/** Whether a source's rasters may be shown in this era. */
export function sourceCoversEra(sources: SourceIndex, sourceId: string, era: Pick<Era, 'year_from' | 'year_to'>): boolean {
  const source = sources.get(sourceId);
  if (!source) return false;
  if (source.attribution_status !== 'confirmed') return false;
  if (source.year_from === null) return false;
  return source.year_from <= era.year_from && source.year_to >= era.year_to;
}

/** Every tile that may be draped in the era, sorted by source id. The order is the draw order. */
export function drapesForEra(era: Era, sources: SourceIndex, tiles: readonly TileSidecar[]): Drape[] {
  return tiles
    .filter((tile) => sourceCoversEra(sources, tile.source, era))
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : 0))
    .map(toDrape);
}

/** The drape of one source, for Show Evidence, or null when it has no tile. */
export function drapeForSource(sourceId: string, tiles: readonly TileSidecar[]): Drape | null {
  const tile = tiles.find((t) => t.source === sourceId);
  return tile ? toDrape(tile) : null;
}
