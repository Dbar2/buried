/**
 * The core sample (spec 05 design "Core sample", product.md "The core sample is made of pictures"):
 * one band per era, Today first. A band has a picture plan (`crop`: a window on the ground around the
 * lot and the tile or vector shapes to draw in it) and a few plain sentences saying what that era's
 * records show at the lot. A band holds only what `featuresForEra` returns for its era.
 *
 * Sentences use plain names for sources ("the 1911 plan"); source ids stay in `sourceIds`, which the
 * view prints in the sources block and in `title` text. A sentence about an outline says whether it
 * was traced automatically and whether a person has checked it, from the feature's own provenance
 * and confidence (`provenanceFacts`), never by guesswork. Where nothing is reviewed and nothing is
 * drawn, the sentence says what the source is and states no finding.
 *
 * The Today band counts present-day building outlines. Present layers are reference data with no
 * position error, so that band never says "on this lot".
 */
import {
  checkedSentence,
  featuresForEra,
  lotRelation,
  originPhrase,
  plainSourceName,
  plainSourceNumbers,
  provenanceFacts,
} from '../evidence';
import type { Era, EraFeature, Feature, FeatureCollection, LotRelation, PolygonalGeometry, PresentLayer, Source, SourceIndex, TileSidecar } from '../evidence';
import { eraOrder } from '../explorer/eraOrder';
import { aerialCoversLot, lotCoverage } from './coverage';
import type { LotCoverage } from './coverage';
import { boundsOf, boxesOverlap, cropWindow, ringsOf, tileRef, windowBox } from './cropPlan';
import type { Crop, CropWindow, Pt } from './cropPlan';
import { offsetOf, toJts } from './geom';
import { STRUCTURE_RADIUS_M, WATER_RADIUS_M } from './radii';
import { findBannedWords } from '../evidence';
import { fixed, joined, num, quote, sentence, words } from './sentence';
import type { RelationClaim, Sentence, Slot } from './sentence';

export const BUILDING_OUTLINES_SOURCE = 'present_toronto_building_outlines_2026';

export type BandCoverage = {
  covered: boolean;
  plates: Array<{ sourceId: string; coverage: LotCoverage }>;
  aerialIds: string[];
};

export type Band = {
  eraId: string;
  label: string;
  coverage: BandCoverage;
  sentences: Sentence[];
  sourceIds: string[];
  /** Ids of the `featuresForEra` entries behind the sentences. */
  featureIds: string[];
  target: { eraId: string; lotId: string };
  /** The picture beside the sentences. */
  crop: Crop;
  /** What the picture is, in words, for the alternative text and the enlarged view. */
  cropLabel: string;
  /** The label for a picture cut from a source nobody has reviewed here ("From the plate, not yet reviewed"), or null. */
  unreviewed: string | null;
};

export type CoreSampleInput = {
  lotId: string;
  lot: PolygonalGeometry;
  lotErrorM: number;
  eras: readonly Era[];
  sources: SourceIndex;
  collections: readonly FeatureCollection[];
  sidecars: readonly TileSidecar[];
  buildings: PresentLayer | undefined;
  /** The City lots, drawn faintly in the Today crop. */
  lots?: PresentLayer | undefined;
};

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function relation(entry: Pick<EraFeature, 'geometry' | 'positionErrorM'>, input: CoreSampleInput): LotRelation {
  return lotRelation(entry, { geometry: input.lot, positionErrorM: input.lotErrorM });
}

/** A plain source name as a slot: "the 1911 plan", with its years in the pack and its id too. */
function planSlot(source: Pick<Source, 'id' | 'type' | 'year_from' | 'year_to'> | undefined): Slot {
  if (!source) return words('the records');
  return { text: plainSourceName(source), numbers: plainSourceNumbers(source), ids: [source.id] };
}

const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// ---------- crops ----------

function polygonalRings(geometry: { type: string; coordinates: unknown }): Pt[][] | null {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon' ? ringsOf(geometry as PolygonalGeometry) : null;
}

function layerShapes(layer: PresentLayer | undefined, window: CropWindow, limit: number): Pt[][][] {
  const box = windowBox(window);
  const out: Pt[][][] = [];
  for (const f of layer?.features ?? []) {
    const rings = polygonalRings(f.geometry);
    if (!rings) continue;
    if (boxesOverlap(boundsOf(f.geometry), box)) out.push(rings);
    if (out.length >= limit) break;
  }
  return out;
}

function vectorCrop(input: CoreSampleInput): Crop {
  const window = cropWindow(input.lot);
  return {
    kind: 'vector',
    window,
    shapes: { lot: ringsOf(input.lot), buildings: layerShapes(input.buildings, window, 400), lots: layerShapes(input.lots, window, 200) },
  };
}

/** Whether a tile shows the lot: the lot meets its map area when it states one, else its four corners. */
function tileShowsLot(lot: PolygonalGeometry, sidecar: TileSidecar): boolean {
  if (!sidecar.map_area) return aerialCoversLot(lot, sidecar);
  const offset = offsetOf(lot);
  try {
    return toJts(sidecar.map_area, offset).intersection(toJts(lot, offset)).getArea() > 0;
  } catch {
    return false;
  }
}

// ---------- the Today band ----------

function todayBand(input: CoreSampleInput, era: Era): Band {
  let count = 0;
  const offset = offsetOf(input.lot);
  const lot = toJts(input.lot, offset);
  for (const f of input.buildings?.features ?? []) {
    if (f.geometry.type === 'Point') continue;
    try {
      if (lot.intersection(toJts(f.geometry, offset)).getArea() > 0) count++;
    } catch {
      // An outline JTS cannot read is not counted.
    }
  }
  const text =
    count === 0
      ? sentence`No building outline at this lot today.`
      : count === 1
        ? sentence`${num(count)} building outline at this lot today.`
        : sentence`${num(count)} building outlines at this lot today.`;
  return {
    eraId: era.id,
    label: era.label,
    coverage: { covered: true, plates: [], aerialIds: [] },
    sentences: [text],
    sourceIds: [BUILDING_OUTLINES_SOURCE],
    featureIds: [],
    target: { eraId: era.id, lotId: input.lotId },
    crop: vectorCrop(input),
    cropLabel: "Today's map of this lot, drawn from the City of Toronto's outlines",
    unreviewed: null,
  };
}

// ---------- the past bands ----------

function claimsSlot(text: string, claims: RelationClaim[], numbers: string[]): Slot {
  return { text, claims, numbers };
}

type Item = { entry: EraFeature; relation: LotRelation; feature: Feature | undefined };

/** One sentence and its "checked" line for the items that share a kind, relation, source and provenance. */
function outlineSentences(items: Item[], which: 'on' | 'near', sources: SourceIndex): Sentence[] {
  const first = items[0] as Item;
  const facts = first.feature ? provenanceFacts(first.feature) : { tracedAutomatically: false, checkedByPerson: false };
  const origin = first.feature ? sources.get(first.feature.properties.provenance.origin_source) : undefined;
  const water = first.entry.kind === 'water';
  const n = items.length;
  const noun = water ? 'water feature' : 'building outline';
  const subject: Slot = n === 1 ? words(`A ${noun}`) : { text: `${n} ${noun}s`, numbers: [String(n)] };
  const verb = words(n === 1 ? 'sits' : 'sit');
  let rel: Slot;
  if (which === 'on') {
    rel = claimsSlot('on this lot', items.map((c) => ({ featureId: c.entry.id, kind: 'on' as const })), []);
  } else {
    const widest = Math.max(...items.map((c) => (c.relation as { withinM: number }).withinM));
    rel = claimsSlot(
      `near this lot (within ${widest} m)`,
      items.map((c) => ({ featureId: c.entry.id, kind: 'near' as const, withinM: (c.relation as { withinM: number }).withinM })),
      [String(widest)],
    );
  }
  return [sentence`${subject} ${words(originPhrase(facts))} ${planSlot(origin)} ${verb} ${rel}.`, fixed(checkedSentence(facts))];
}

function pastBand(input: CoreSampleInput, era: Era, plates: readonly Source[]): Band {
  const containing = [...input.sources.values()].filter(
    (s) => s.attribution_status === 'confirmed' && s.year_from !== null && s.year_from <= era.year_from && era.year_to <= s.year_to,
  );
  const byOrigin = new Map(input.collections.map((c) => [c.origin_source, c]));
  const plateRows = containing
    .filter((s) => plates.some((p) => p.id === s.id))
    .sort((a, b) => byString(a.id, b.id))
    .map((s) => ({ source: s, coverage: lotCoverage(input.lot, byOrigin.get(s.id), STRUCTURE_RADIUS_M) }));
  const aerials = containing
    .filter((s) => s.type === 'aerial_photograph')
    .filter((s) => input.sidecars.some((t) => t.source === s.id && aerialCoversLot(input.lot, t)))
    .sort((a, b) => byString(a.id, b.id));
  const aerialIds = aerials.map((s) => s.id);
  const list = featuresForEra(input.collections, input.sources, era);
  const platesCover = plateRows.filter((r) => r.coverage === 'reviewed' || r.coverage === 'mapped');
  // A feature drawn in this era also means the era's records reach the lot, even when the plate's own
  // file is not read yet (a building drawn on the 1911 plate and seen on a 1935 plate by a person).
  const covered = platesCover.length > 0 || aerialIds.length > 0 || list.features.length > 0;
  const anyReviewed = platesCover.some((r) => r.coverage === 'reviewed');

  const featureById = new Map(input.collections.flatMap((c) => c.features).map((f) => [f.id, f]));
  const buildings: Item[] = [];
  const water: Item[] = [];
  for (const entry of list.features) {
    const r = relation(entry, input);
    const item = { entry, relation: r, feature: featureById.get(entry.id) };
    if (entry.kind === 'water' && (r.kind === 'on' || r.withinM <= WATER_RADIUS_M)) water.push(item);
    else if (entry.kind !== 'water' && (r.kind === 'on' || r.withinM <= STRUCTURE_RADIUS_M)) buildings.push(item);
  }

  const sentences: Sentence[] = [];
  // Items that share kind, relation, source and provenance read as one sentence.
  const groups = new Map<string, Item[]>();
  for (const item of [...buildings, ...water]) {
    const facts = item.feature ? provenanceFacts(item.feature) : { tracedAutomatically: false, checkedByPerson: false };
    const key = [item.relation.kind === 'on' ? 0 : 1, item.entry.kind === 'water' ? 1 : 0, item.feature?.properties.provenance.origin_source ?? '', facts.tracedAutomatically, facts.checkedByPerson].join('|');
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  for (const key of [...groups.keys()].sort(byString)) {
    const items = (groups.get(key) as Item[]).sort((a, b) => byString(a.entry.id, b.entry.id));
    sentences.push(...outlineSentences(items, (items[0] as Item).relation.kind, input.sources));
  }

  const uses = [...new Set([...buildings, ...water].map((i) => i.entry.attributes.use).filter((u): u is string => u !== undefined))];
  const printable = uses.filter((u) => findBannedWords(u).length === 0).sort(byString);
  if (printable.length > 0) sentences.push(sentence`Uses recorded: ${joined(printable.map(quote), ', ')}.`);
  const hidden = uses.length - printable.length;
  if (hidden > 0) sentences.push(sentence`${num(hidden)} recorded ${words(hidden === 1 ? 'use is' : 'uses are')} not reproduced in this report.`);

  if (covered && buildings.length === 0 && water.length === 0) {
    if (anyReviewed) {
      sentences.push(sentence`No building is drawn at this lot or within ${num(STRUCTURE_RADIUS_M)} m in this era.`);
    } else if (platesCover.length > 0 || aerialIds.length > 0) {
      // Nothing is reviewed: say what the source is and state no finding.
      const names = [...platesCover.map((r) => planSlot(r.source)), ...aerials.map((s) => planSlot(s))];
      sentences.push(sentence`From ${joined(names, ' and ')}. Not yet reviewed.`);
    }
  }
  if (!covered) sentences.push(fixed('Not covered by these records.'));

  // Records of this era that would be in range but whose sources disagree.
  const review = list.needsReview.filter((featureId) => {
    const f = featureById.get(featureId);
    if (!f) return false;
    const r = relation({ geometry: f.geometry, positionErrorM: f.properties.position_error_m }, input);
    return r.kind === 'on' || r.withinM <= (f.properties.kind === 'water' ? WATER_RADIUS_M : STRUCTURE_RADIUS_M);
  });
  if (review.length > 0) {
    sentences.push(sentence`${num(review.length)} ${words(review.length === 1 ? 'record here needs' : 'records here need')} review because their sources disagree.`);
  }

  const featureIds = [...buildings, ...water].map((i) => i.entry.id).sort(byString);
  const sourceIds = new Set<string>([...platesCover.map((r) => r.source.id), ...aerialIds]);
  for (const i of [...buildings, ...water]) for (const s of i.entry.sourceIds) sourceIds.add(s);

  // The picture: the first tile of this era's sources that shows the lot.
  const eraSidecars = input.sidecars.filter((t) => containing.some((s) => s.id === t.source)).sort((a, b) => byString(a.source, b.source));
  const shown = eraSidecars.find((t) => tileShowsLot(input.lot, t));
  let crop: Crop;
  let cropLabel: string;
  let unreviewed: string | null = null;
  if (shown) {
    const source = input.sources.get(shown.source);
    crop = { kind: 'tile', window: cropWindow(input.lot), tile: tileRef(shown), lot: ringsOf(input.lot) };
    cropLabel = `${capital(source ? plainSourceName(source) : 'The record')}, around this lot`;
    if (!plateRows.some((r) => r.source.id === shown.source && r.coverage === 'reviewed')) {
      unreviewed = source?.type === 'aerial_photograph' ? 'From the photograph, not yet reviewed' : 'From the plate, not yet reviewed';
    }
    sourceIds.add(shown.source);
  } else if (eraSidecars.length > 0) {
    const source = input.sources.get((eraSidecars[0] as TileSidecar).source);
    crop = { kind: 'none', text: `${capital(source ? plainSourceName(source) : 'The record')} does not show this lot.` };
    cropLabel = crop.text;
  } else if (containing.some((s) => s.type === 'aerial_photograph')) {
    crop = { kind: 'none', text: `No ${era.label} photograph loaded yet` };
    cropLabel = crop.text;
  } else {
    crop = { kind: 'none', text: `No picture of ${era.label} loaded yet` };
    cropLabel = crop.text;
  }

  return {
    eraId: era.id,
    label: era.label,
    coverage: { covered, plates: plateRows.map((r) => ({ sourceId: r.source.id, coverage: r.coverage })), aerialIds },
    sentences,
    sourceIds: [...sourceIds].sort(byString),
    featureIds,
    target: { eraId: era.id, lotId: input.lotId },
    crop,
    cropLabel,
    unreviewed,
  };
}

export function buildCoreSample(input: CoreSampleInput, plates: readonly Source[]): Band[] {
  const order = eraOrder(input.eras);
  return order.map((info) => {
    const era = input.eras.find((e) => e.id === info.id) as Era;
    return info.index === 0 ? todayBand(input, era) : pastBand(input, era, plates);
  });
}
