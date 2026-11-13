/**
 * The evidence card on the place page (session 029): what one drawn feature's record says, in the
 * record's own words, plus a crop of the untouched scan around it. Pure.
 *
 * The card states nothing the record does not: the use as lettered, the storeys when the record has
 * them, the confidence label with its reason, the position phrase (the Evidence Library's wording),
 * the "Confirmed by" line copied from the feature's provenance, and the origin source's attribution.
 * It never says a person checked or reviewed anything beyond that line. Text that carries a banned
 * word is not reproduced (product rule 1); the card names the record instead.
 */
import { findBannedWords, plainReason, plainSourceName, positionPhrase } from '../evidence';
import type { EraFeature, Feature, PolygonalGeometry, SourceIndex, TileSidecar } from '../evidence';
import { CONFIDENCE_LABELS } from '../explorer/gateCard';
import { confirmationOf, confirmedSentence } from '../report/confirmed';
import { cropWindow, ringsOf, tileRef } from '../report/cropPlan';
import type { Crop } from '../report/cropPlan';

export type PlaceCardRow = {
  /** Stable key and the suffix of the row's test id. */
  key: 'use' | 'storeys' | 'confidence' | 'position' | 'confirmed' | 'origin';
  label: string;
  value: string;
  mono: boolean;
};

export type PlaceCard = {
  featureId: string;
  heading: string;
  rows: PlaceCardRow[];
  /** The crop of the origin source's untouched tile around the feature, with its outline; null when there is none. */
  crop: Extract<Crop, { kind: 'tile' }> | null;
  /** What the crop is, or why there is none. */
  cropLabel: string;
  /** The crop of the lettering the use was read from, or null when the record has none or the source has no tile. */
  reading: ReadCrop | null;
  /** The source the footnote names: id (mono), plain name, attribution line. */
  source: { id: string; name: string; attributionLine: string };
  workspace: boolean;
};

/** Where the lettering sits on a tile image, in the tile's own pixels. */
export type ReadCrop = { image: string; sx: number; sy: number; sw: number; sh: number; label: string };

/**
 * The crop a use was read from, in the pixels of the origin source's tile. The record's `crop_px` is in
 * plate pixels and the sidecar's `crop_px` says which plate pixels the tile shows, so the two give
 * the region by proportion. Null when the record has no read of a use, the source has no tile, or the
 * crop does not lie on the tile.
 */
export function readingCrop(feature: Feature, tiles: readonly TileSidecar[], sourceName: string): ReadCrop | null {
  const read = feature.properties.provenance.attribute_reads?.find((r) => r.attribute === 'use');
  const tile = tiles.find((t) => t.source === feature.properties.provenance.origin_source);
  if (!read || !tile?.crop_px) return null;
  const c = tile.crop_px;
  const sx = ((read.crop_px.x - c.x) * tile.width_px) / c.width;
  const sy = ((read.crop_px.y - c.y) * tile.height_px) / c.height;
  const sw = (read.crop_px.width * tile.width_px) / c.width;
  const sh = (read.crop_px.height * tile.height_px) / c.height;
  if (!(sw > 0 && sh > 0) || sx < 0 || sy < 0 || sx + sw > tile.width_px + 1e-6 || sy + sh > tile.height_px + 1e-6) return null;
  return { image: tile.image, sx, sy, sw, sh, label: `The crop the use was read from, cut from ${sourceName}` };
}

const MIN_WINDOW_M = 40;
const CROP_MARGIN_M = 12;

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

type FeatureGeometry = EraFeature['geometry'];

const isPolygonal = (g: FeatureGeometry): g is PolygonalGeometry => g.type === 'Polygon' || g.type === 'MultiPolygon';

/** A quoted record text, or a plain pointer to the record when the text holds a banned word. */
function quoted(text: string, what: string): string {
  return findBannedWords(text).length > 0 ? `${what}: the text is recorded in the evidence file.` : text;
}

/** The crop around a feature on its origin source's tile, or null when the source has no tile or the feature has no area. */
export function cardCrop(geometry: FeatureGeometry, sourceId: string, tiles: readonly TileSidecar[], kind?: EraFeature['kind']): Extract<Crop, { kind: 'tile' }> | null {
  const tile = tiles.find((t) => t.source === sourceId);
  if (!tile || !isPolygonal(geometry)) return null;
  const window = cropWindow(geometry, CROP_MARGIN_M);
  if (window.side < MIN_WINDOW_M) {
    const centreE = window.minE + window.side / 2;
    const centreN = window.minN + window.side / 2;
    window.minE = centreE - MIN_WINDOW_M / 2;
    window.minN = centreN - MIN_WINDOW_M / 2;
    window.side = MIN_WINDOW_M;
  }
  return { kind: 'tile', window, tile: tileRef(tile), lot: ringsOf(geometry), ...(kind === 'land_use' ? { hatch: true } : {}) };
}

export function buildPlaceCard(
  entry: EraFeature,
  feature: Feature,
  sources: SourceIndex,
  tiles: readonly TileSidecar[],
  origin: 'canon' | 'workspace' = 'canon',
): PlaceCard {
  if (feature.id !== entry.id) throw new Error(`Era list entry ${entry.id} does not match feature ${feature.id}`);
  const provenance = feature.properties.provenance;
  const source = sources.get(provenance.origin_source);
  if (!source) throw new Error(`Source ${provenance.origin_source} is not in the registry`);

  const kindName = entry.kind === 'building' ? 'Building' : entry.kind === 'water' ? 'Water' : 'Land use';
  const use = entry.attributes.use;
  const rows: PlaceCardRow[] = [];
  if (use !== undefined) rows.push({ key: 'use', label: 'Use as lettered', value: quoted(use, 'Use as lettered'), mono: false });
  if (entry.attributes.storeys !== undefined) {
    rows.push({ key: 'storeys', label: 'Storeys as read', value: String(entry.attributes.storeys), mono: true });
  }
  rows.push(
    { key: 'confidence', label: 'Confidence', value: quoted(`${CONFIDENCE_LABELS[entry.confidence]}. ${plainReason(entry.confidenceReason, sources)}`, 'Confidence'), mono: false },
    { key: 'position', label: 'Position', value: positionPhrase(entry.positionErrorM), mono: true },
    { key: 'confirmed', label: 'Record', value: confirmedSentence(confirmationOf(feature)).text, mono: false },
  );
  if (origin === 'workspace') {
    rows.push({ key: 'origin', label: 'Origin', value: "From your workspace. Not part of Buried's published records.", mono: false });
  }

  const crop = cardCrop(entry.geometry, source.id, tiles, entry.kind);
  const name = plainSourceName(source);
  return {
    featureId: entry.id,
    heading: use !== undefined && findBannedWords(use).length === 0 ? use : kindName,
    rows,
    crop,
    cropLabel: crop ? `${capital(name)}, around this ${kindName.toLowerCase()}` : `${capital(name)} has no picture loaded for this ${kindName.toLowerCase()}`,
    reading: use !== undefined ? readingCrop(feature, tiles, name) : null,
    source: { id: source.id, name, attributionLine: source.attribution_line },
    workspace: origin === 'workspace',
  };
}
