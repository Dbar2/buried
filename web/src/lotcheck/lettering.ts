/**
 * Lettering helpers for the lot check (spec 08). Pure.
 *
 * A recorded use is the plan's own lettering, "Coal & Wood Yard; J. W. Corson & Co.", sometimes with a
 * note the recorder appended ("(as lettered on the plate)"). The part before the first semicolon is the
 * use as the plan names it (the head); what follows is the business named beside it (the rest).
 */
import { findBannedWords } from '../evidence';
import type { Feature, TileSidecar } from '../evidence';

/** The recorder's closing note, which is not lettering: "(as lettered on the plate ...)". */
const RECORDER_NOTE = /\s*\(as lettered on the plate[^)]*\)\s*$/i;

export type UseParts = { whole: string; head: string; rest: string };

/** The use without the recorder's note, split at its first semicolon. `rest` is empty when there is none. */
export function useParts(use: string): UseParts {
  const trimmed = use.replace(RECORDER_NOTE, '').trim();
  const whole = trimmed === '' ? use.trim() : trimmed;
  const at = whole.indexOf(';');
  if (at < 0) return { whole, head: whole, rest: '' };
  const head = whole.slice(0, at).trim();
  const rest = whole.slice(at + 1).trim();
  return head === '' ? { whole, head: whole, rest: '' } : { whole, head, rest };
}

/** True when the lettering may be quoted: no banned word anywhere in it (product rule 1, requirement 4.6). */
export const isQuotable = (use: string): boolean => findBannedWords(use).length === 0;

/**
 * The key a use groups under: the head, lowercase, "&" as "and", every run of non-letters one space.
 * "Coal & Wood Yard; J. W. Corson & Co." and "Coal & Wood Yard; Northern Fuels Co." share a key.
 */
export function normaliseLettering(use: string): string {
  return useParts(use)
    .head.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}]+/gu, ' ')
    .trim();
}

// ---------- the crop a use was read from ----------

/** Where the lettering sits on a tile image, in the tile's own pixels. */
export type ReadCrop = { image: string; sx: number; sy: number; sw: number; sh: number; label: string };

/**
 * The crop a use was read from, in the pixels of the origin source's tile. The record's `crop_px` is in
 * plate pixels and the sidecar's `crop_px` says which plate pixels the tile shows, so the two give the
 * region by proportion. Null when the record has no read of a use, the source has no tile, or the crop
 * does not lie on the tile.
 */
export function readCropOf(feature: Pick<Feature, 'properties'>, tiles: readonly TileSidecar[], sourceName: string): ReadCrop | null {
  const read = feature.properties.provenance.attribute_reads?.find((r) => r.attribute === 'use');
  const tile = tiles.find((t) => t.source === feature.properties.provenance.origin_source);
  if (!read || !tile?.crop_px) return null;
  const c = tile.crop_px;
  const sx = ((read.crop_px.x - c.x) * tile.width_px) / c.width;
  const sy = ((read.crop_px.y - c.y) * tile.height_px) / c.height;
  const sw = (read.crop_px.width * tile.width_px) / c.width;
  const sh = (read.crop_px.height * tile.height_px) / c.height;
  if (!(sw > 0 && sh > 0) || sx < 0 || sy < 0 || sx + sw > tile.width_px + 1e-6 || sy + sh > tile.height_px + 1e-6) return null;
  return { image: tile.image, sx, sy, sw, sh, label: `The lettering as it appears on ${sourceName}` };
}
