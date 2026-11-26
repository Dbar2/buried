/**
 * Photographs and imagined views in the compare view (spec 08 requirements 11 and 12, session 055). Pure.
 *
 * Two kinds of picture sit beside the plans:
 * - real aerial photographs (today, 1939), placed by their bounds in EPSG:26917;
 * - views imagined from the plans with an image model, offered only where the plans letter a use on the lot.
 *
 * Nothing here decides a finding. The verdict, the tag and every sentence come from the plans' lettering
 * (`buildLotCheck`); a picture changes what the frame shows and what its one caption line says, never the record.
 */
import { worldToPixel } from '../block/sheetTransform';
import type { Pt, SheetTransform } from '../block/sheetTransform';
import { findBannedWords } from '../evidence';
import { num, sentence } from '../report/sentence';
import type { Sentence, Slot } from '../report/sentence';
import type { WorldPolygon } from './compare';

/** `[min_e, min_n, max_e, max_n]` in EPSG:26917. */
export type Bounds = readonly [number, number, number, number];

export type Photo = {
  id: string;
  /** Where the browser asks for it. */
  src: string;
  year: number;
  label: string;
  bounds: Bounds;
  widthPx: number;
  heightPx: number;
  /** The City says the photograph is not orthorectified: shown for looking, not for measuring. */
  approximate: boolean;
  licence: string;
  attribution: string;
  dataset: string;
  note: string;
  sourceUrl: string;
  fetched: string;
  metresPerPixel: number;
};

export type ImaginedTopdown = { src: string; bounds: Bounds; widthPx: number; heightPx: number };
export type ImaginedStreet = { src: string; widthPx: number; heightPx: number; caption: string };

export type ImaginedView = {
  slug: string;
  featureIds: string[];
  planSource: string;
  /** "the 1911 plan". */
  planName: string;
  /** "about 1911". */
  about: string;
  topdown: ImaginedTopdown | null;
  street: ImaginedStreet | null;
  note: string | null;
};

export type PictureIndex = { photos: Photo[]; views: ImaginedView[]; how: string };

export const AERIAL_DIR = '/lotcheck/aerial';
export const IMAGINED_DIR = '/lotcheck/imagined';

// ---------- reading the two indexes (they are the contract; anything malformed is left out) ----------

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

function boundsOf(v: unknown): Bounds | null {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const [a, b, c, d] = v as number[];
  return (a as number) < (c as number) && (b as number) < (d as number) ? [a as number, b as number, c as number, d as number] : null;
}

export function parsePhotos(raw: unknown): Photo[] {
  if (!isRec(raw) || !Array.isArray(raw['photos'])) return [];
  const out: Photo[] = [];
  for (const p of raw['photos']) {
    if (!isRec(p)) continue;
    const id = str(p['id']);
    const file = str(p['file']);
    const label = str(p['label']);
    const bounds = boundsOf(p['bounds']);
    const year = pos(p['year']);
    const widthPx = pos(p['width_px']);
    const heightPx = pos(p['height_px']);
    if (!id || !file || !label || !bounds || !year || !widthPx || !heightPx) continue;
    out.push({
      id,
      src: `${AERIAL_DIR}/${file}`,
      year,
      label,
      bounds,
      widthPx,
      heightPx,
      approximate: p['approximate'] === true,
      licence: str(p['licence']) ?? '',
      attribution: str(p['attribution']) ?? '',
      dataset: str(p['dataset']) ?? '',
      note: str(p['note']) ?? '',
      sourceUrl: str(p['source_url']) ?? '',
      fetched: str(p['fetched']) ?? '',
      metresPerPixel: pos(p['metres_per_pixel']) ?? 0,
    });
  }
  return out.sort((a, b) => a.year - b.year);
}

export function parseImagined(raw: unknown): { views: ImaginedView[]; how: string } {
  if (!isRec(raw) || !Array.isArray(raw['views'])) return { views: [], how: '' };
  const views: ImaginedView[] = [];
  for (const v of raw['views']) {
    if (!isRec(v)) continue;
    const slug = str(v['slug']);
    const planSource = str(v['plan_source']);
    const planName = str(v['plan_name']);
    const about = str(v['about']);
    const ids = v['feature_ids'];
    if (!slug || !planSource || !planName || !about || !Array.isArray(ids) || !ids.every((i) => typeof i === 'string')) continue;
    let topdown: ImaginedTopdown | null = null;
    const td = v['topdown'];
    if (isRec(td)) {
      const file = str(td['file']);
      const bounds = boundsOf(td['bounds']);
      const w = pos(td['width_px']);
      const h = pos(td['height_px']);
      if (file && bounds && w && h) topdown = { src: `${IMAGINED_DIR}/${file}`, bounds, widthPx: w, heightPx: h };
    }
    let street: ImaginedStreet | null = null;
    const st = v['street'];
    if (isRec(st)) {
      const file = str(st['file']);
      const caption = str(st['caption']);
      const w = pos(st['width_px']);
      const h = pos(st['height_px']);
      if (file && caption && w && h) street = { src: `${IMAGINED_DIR}/${file}`, widthPx: w, heightPx: h, caption };
    }
    if (!topdown && !street) continue;
    views.push({ slug, featureIds: ids as string[], planSource, planName, about, topdown, street, note: str(v['note']) });
  }
  return { views, how: str(raw['how']) ?? '' };
}

// ---------- placement ----------

/**
 * An SVG `matrix(a b c d e f)`: x' = a x + c y + e, y' = b x + d y + f, from an image's own pixels to the plan
 * tile's pixels. The plan tile is turned a little from north, so a north-up picture lands rotated.
 */
export type Placement = { a: number; b: number; c: number; d: number; e: number; f: number };

/**
 * Where a north-up picture with `bounds` and `widthPx` by `heightPx` sits in the tile's pixel frame. Pixel (0, 0) is the
 * picture's north-west corner and (width, height) its south-east corner. The three corners that fix the matrix go
 * through `worldToPixel`, the one transform everything else uses.
 */
export function photoPlacement(bounds: Bounds, widthPx: number, heightPx: number, t: SheetTransform): Placement {
  const [minE, minN, maxE, maxN] = bounds;
  const nw = worldToPixel(t, [minE, maxN]);
  const ne = worldToPixel(t, [maxE, maxN]);
  const sw = worldToPixel(t, [minE, minN]);
  return {
    a: (ne[0] - nw[0]) / widthPx,
    b: (ne[1] - nw[1]) / widthPx,
    c: (sw[0] - nw[0]) / heightPx,
    d: (sw[1] - nw[1]) / heightPx,
    e: nw[0],
    f: nw[1],
  };
}

export const applyPlacement = (p: Placement, [x, y]: Pt): Pt => [p.a * x + p.c * y + p.e, p.b * x + p.d * y + p.f];

export const placementText = (p: Placement): string => `matrix(${[p.a, p.b, p.c, p.d, p.e, p.f].map((n) => Number(n.toPrecision(10))).join(' ')})`;

/** The four world corners of a bounds box, north-west first, clockwise. */
export const boundsCorners = (b: Bounds): Pt[] => [
  [b[0], b[3]],
  [b[2], b[3]],
  [b[2], b[1]],
  [b[0], b[1]],
];

/** The tile pixels of a bounds box's four corners, as a rectangle `{minX, minY, maxX, maxY}`. */
export function boundsInPixels(b: Bounds, t: SheetTransform): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts = boundsCorners(b).map((p) => worldToPixel(t, p));
  return { minX: Math.min(...pts.map((p) => p[0])), minY: Math.min(...pts.map((p) => p[1])), maxX: Math.max(...pts.map((p) => p[0])), maxY: Math.max(...pts.map((p) => p[1])) };
}

function lotBox(lot: WorldPolygon): Bounds | null {
  const pts = lot.flat();
  if (pts.length === 0) return null;
  return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
}

/** True when the lot's whole bounding box is inside `bounds`. */
export function boundsHoldLot(bounds: Bounds, lot: WorldPolygon): boolean {
  const box = lotBox(lot);
  return box !== null && box[0] >= bounds[0] && box[1] >= bounds[1] && box[2] <= bounds[2] && box[3] <= bounds[3];
}

/** True when the middle of the lot's bounding box is inside `bounds`. */
export function boundsHoldLotCentre(bounds: Bounds, lot: WorldPolygon): boolean {
  const box = lotBox(lot);
  if (box === null) return false;
  const e = (box[0] + box[2]) / 2;
  const n = (box[1] + box[3]) / 2;
  return e >= bounds[0] && e <= bounds[2] && n >= bounds[1] && n <= bounds[3];
}

// ---------- which imagined views a lot may show (rule 4) ----------

/** The minimal shape of a plan row's line that this module reads. */
export type LineLike = { featureId: string; relation: { kind: string } };
export type RowLike = { kind: string; lines?: readonly LineLike[] };

/** The ids of the lettered uses ON the lot (never "near"), from the view model's rows. */
export function onLotFeatureIds(rows: readonly RowLike[]): Set<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.kind !== 'plan') continue;
    for (const line of row.lines ?? []) if (line.relation.kind === 'on') ids.add(line.featureId);
  }
  return ids;
}

/** The imagined views about a lettered use on the lot: one of the view's `feature_ids` is on it. */
export function viewsOnLot(onIds: ReadonlySet<string>, views: readonly ImaginedView[]): ImaginedView[] {
  return views.filter((v) => v.featureIds.some((id) => onIds.has(id)));
}

/** The imagined view whose street picture a dig slip may carry: the slip's line is a use ON the lot (never "near") that the view is about. */
export function streetViewForSlip(slip: { kind: string; featureId: string | null }, views: readonly ImaginedView[]): ImaginedView | null {
  if (slip.kind !== 'use' || slip.featureId === null) return null;
  const id = slip.featureId;
  return views.find((v) => v.street !== null && v.featureIds.includes(id)) ?? null;
}

// ---------- the choices ----------

export type ThenLayer =
  | { kind: 'plan'; sourceId: string }
  | { kind: 'photo'; photoId: string }
  | { kind: 'imagined'; slug: string };

export type ThenChoice = {
  /** A stable key: the plan's source id, `photo:<id>`, `imagined:<slug>`. */
  key: string;
  layer: ThenLayer;
  /** The radio's text and the corner chip: "1911 plan", "1939 photo", "Imagined, about 1911". */
  label: string;
  /** What the polite live region says. */
  announce: string;
  /** The slider's name after "Divider between ", up to " and today". */
  name: string;
};

export type NowChoice = { key: 'photo' | 'outlines'; label: string; announce: string };

export type PlanLike = { sourceId: string; planName: string; label: string };

export type Choices = { then: ThenChoice[]; now: NowChoice[]; todayPhoto: Photo | null; thenPhotos: Photo[]; views: ImaginedView[] };

export const NOW_PHOTO_LABEL = 'Today, photo';
export const NOW_OUTLINES_LABEL = 'Today, outlines';

/**
 * The Then (left) and Now (right) choices for a lot. Plans first (the first is the default), then the older
 * photographs that hold the lot, then an imagined top-down view for each recorded use on the lot whose picture holds
 * the lot's middle. The newest photograph is "Today, photo". Photographs appear only when the index has them.
 */
export function layerChoices(input: { plans: readonly PlanLike[]; lot: WorldPolygon; photos: readonly Photo[]; onLotViews: readonly ImaginedView[] }): Choices {
  const covering = input.photos.filter((p) => boundsHoldLot(p.bounds, input.lot));
  const newest = covering.reduce<Photo | null>((best, p) => (best === null || p.year > best.year ? p : best), null);
  const thenPhotos = covering.filter((p) => p !== newest).sort((a, b) => a.year - b.year);
  const views = input.onLotViews.filter((v) => v.topdown !== null && boundsHoldLotCentre((v.topdown as ImaginedTopdown).bounds, input.lot));
  const then: ThenChoice[] = [
    ...input.plans.map((p): ThenChoice => ({ key: p.sourceId, layer: { kind: 'plan', sourceId: p.sourceId }, label: p.label, announce: `Now showing ${p.planName}`, name: p.planName })),
    ...thenPhotos.map((p): ThenChoice => ({ key: `photo:${p.id}`, layer: { kind: 'photo', photoId: p.id }, label: `${p.year} photo`, announce: `Now showing the ${p.year} aerial photograph, placed approximately`, name: `the ${p.year} photograph` })),
    ...views.map((v): ThenChoice => ({ key: `imagined:${v.slug}`, layer: { kind: 'imagined', slug: v.slug }, label: `Imagined, ${v.about}`, announce: `Now showing a view imagined from ${v.planName}. Not a photograph.`, name: 'the imagined view' })),
  ];
  const now: NowChoice[] = [
    ...(newest ? [{ key: 'photo' as const, label: NOW_PHOTO_LABEL, announce: `Now showing the ${newest.year} aerial photograph on the right` }] : []),
    { key: 'outlines', label: NOW_OUTLINES_LABEL, announce: "Now showing today's outlines on the right" },
  ];
  return { then, now, todayPhoto: newest, thenPhotos, views };
}

// ---------- the caption under the view ----------

const textSlot = (text: string): Slot => ({ text, numbers: text.match(/\d+/g) ?? [] });

export type ThenShown =
  | { kind: 'plan'; years: string }
  | { kind: 'photo'; year: number; approximate: boolean }
  | { kind: 'imagined'; planName: string };
export type NowShown = { kind: 'photo'; year: number } | { kind: 'outlines' };

/**
 * The one line under the view, for the layers on screen (requirement 11.3): "Left: the 1911 plan, as digitized.
 * Right: 2025 aerial photograph, City of Toronto." An imagined layer always says "Imagined from the 1911 plan. Not a
 * photograph." Built with the sentence builder so the years are in its pack and the test can check it.
 */
export function layerCaption(left: ThenShown, right: NowShown): Sentence {
  const l: Slot =
    left.kind === 'plan'
      ? { text: `the ${left.years} plan, as digitized`, numbers: textSlot(left.years).numbers }
      : left.kind === 'photo'
        ? { text: `${left.year} aerial photograph, City of Toronto${left.approximate ? ', placed approximately' : ''}`, numbers: [String(left.year)] }
        : { text: `Imagined from ${left.planName}. Not a photograph`, numbers: textSlot(left.planName).numbers };
  const r: Slot = right.kind === 'photo' ? { text: `${right.year} aerial photograph, City of Toronto`, numbers: [String(right.year)] } : { text: "today's building outlines and lot lines, City of Toronto" };
  return sentence`Left: ${l}. Right: ${r}.`;
}

/** The sentence that goes with an imagined picture wherever it is on screen (rule 1). */
export const imaginedLine = (planName: string): Sentence => sentence`Imagined from ${textSlot(planName)}. Not a photograph.`;

/** The line under a real photograph: its year and "aerial photograph, City of Toronto". */
export const photoLine = (year: number): Sentence => sentence`${num(year)} aerial photograph, City of Toronto.`;

/** The City's caveat for the 1939 photograph, written on the frame beside the lot outline. */
export const APPROXIMATE_NOTE = 'The 1939 photograph is placed approximately.';

/** The street caption from the index, or a plain line when it holds a word this site does not print. */
export function streetCaption(view: Pick<ImaginedView, 'street'>): string {
  const c = view.street?.caption ?? '';
  return c !== '' && findBannedWords(c).length === 0 ? c : 'A view imagined from the plan.';
}
