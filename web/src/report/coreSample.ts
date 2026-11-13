/**
 * The core sample (spec 05 design "Core sample"): one band per era, Today first, saying what that
 * era's records show at the lot. A band holds only what `featuresForEra` returns for its era.
 *
 * The Today band counts present-day building outlines. Present layers are reference data with no
 * position error, so that band never says "on this lot".
 */
import { featuresForEra, lotRelation } from '../evidence';
import type { Era, EraFeature, FeatureCollection, LotRelation, PolygonalGeometry, PresentLayer, Source, SourceIndex, TileSidecar } from '../evidence';
import { eraOrder } from '../explorer/eraOrder';
import { COVERAGE_WORDING, aerialCoversLot, lotCoverage } from './coverage';
import type { LotCoverage } from './coverage';
import { offsetOf, toJts } from './geom';
import { STRUCTURE_RADIUS_M, WATER_RADIUS_M } from './radii';
import { findBannedWords } from '../evidence';
import { fixed, id, joined, num, quote, sentence, words } from './sentence';
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
};

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function relation(entry: Pick<EraFeature, 'geometry' | 'positionErrorM'>, input: CoreSampleInput): LotRelation {
  return lotRelation(entry, { geometry: input.lot, positionErrorM: input.lotErrorM });
}

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
    sentences: [text, sentence`Source: ${id(BUILDING_OUTLINES_SOURCE)}.`],
    sourceIds: [BUILDING_OUTLINES_SOURCE],
    featureIds: [],
    target: { eraId: era.id, lotId: input.lotId },
  };
}

function claimsSlot(text: string, claims: RelationClaim[], numbers: string[]): Slot {
  return { text, claims, numbers };
}

function countedDrawn(kind: 'building' | 'water', items: Array<{ entry: EraFeature; relation: LotRelation }>, which: 'on' | 'near'): Sentence | null {
  const chosen = items.filter((i) => i.relation.kind === which);
  if (chosen.length === 0) return null;
  const n = chosen.length;
  const noun = kind === 'building' ? (n === 1 ? 'building' : 'buildings') : n === 1 ? 'water feature' : 'water features';
  if (which === 'on') {
    const rel = claimsSlot('on this lot', chosen.map((c) => ({ featureId: c.entry.id, kind: 'on' as const })), []);
    return sentence`${num(n)} ${words(noun)} drawn ${rel}.`;
  }
  const widest = Math.max(...chosen.map((c) => (c.relation as { withinM: number }).withinM));
  const rel = claimsSlot(
    `near this lot (within ${widest} m)`,
    chosen.map((c) => ({ featureId: c.entry.id, kind: 'near' as const, withinM: (c.relation as { withinM: number }).withinM })),
    [String(widest)],
  );
  return sentence`${num(n)} ${words(noun)} drawn ${rel}.`;
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
  const aerialIds = containing
    .filter((s) => s.type === 'aerial_photograph')
    .filter((s) => input.sidecars.some((t) => t.source === s.id && aerialCoversLot(input.lot, t)))
    .map((s) => s.id)
    .sort(byString);
  const platesCover = plateRows.filter((r) => r.coverage === 'reviewed' || r.coverage === 'mapped');
  const covered = platesCover.length > 0 || aerialIds.length > 0;

  const sentences: Sentence[] = [];
  if (covered) {
    const parts: Slot[] = [
      ...platesCover.map((r) => joined([id(r.source.id), words(` (${COVERAGE_WORDING[r.coverage]})`)], '')),
      ...aerialIds.map((a) => joined([id(a), words(' (photograph covers this lot)')], '')),
    ];
    sentences.push(sentence`Covered by: ${joined(parts, '; ')}.`);
  } else {
    sentences.push(fixed('Not covered by these records.'));
  }

  const list = featuresForEra(input.collections, input.sources, era);
  const buildings: Array<{ entry: EraFeature; relation: LotRelation }> = [];
  const water: Array<{ entry: EraFeature; relation: LotRelation }> = [];
  for (const entry of list.features) {
    const r = relation(entry, input);
    if (entry.kind === 'water' && (r.kind === 'on' || r.withinM <= WATER_RADIUS_M)) water.push({ entry, relation: r });
    else if (entry.kind !== 'water' && (r.kind === 'on' || r.withinM <= STRUCTURE_RADIUS_M)) buildings.push({ entry, relation: r });
  }
  for (const s of [
    countedDrawn('building', buildings, 'on'),
    countedDrawn('building', buildings, 'near'),
    countedDrawn('water', water, 'on'),
    countedDrawn('water', water, 'near'),
  ]) {
    if (s) sentences.push(s);
  }

  const uses = [...new Set([...buildings, ...water].map((i) => i.entry.attributes.use).filter((u): u is string => u !== undefined))];
  const printable = uses.filter((u) => findBannedWords(u).length === 0).sort(byString);
  if (printable.length > 0) sentences.push(sentence`Uses recorded: ${joined(printable.map(quote), ', ')}.`);
  const hidden = uses.length - printable.length;
  if (hidden > 0) sentences.push(sentence`${num(hidden)} recorded ${words(hidden === 1 ? 'use is' : 'uses are')} not reproduced in this report.`);

  if (covered && buildings.length === 0 && water.length === 0) {
    sentences.push(sentence`No building is drawn at this lot or within ${num(STRUCTURE_RADIUS_M)} m in this era.`);
  }

  // Records of this era that would be in range but whose sources disagree.
  const featureById = new Map(input.collections.flatMap((c) => c.features).map((f) => [f.id, f]));
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

  return {
    eraId: era.id,
    label: era.label,
    coverage: { covered, plates: plateRows.map((r) => ({ sourceId: r.source.id, coverage: r.coverage })), aerialIds },
    sentences,
    sourceIds: [...sourceIds].sort(byString),
    featureIds,
    target: { eraId: era.id, lotId: input.lotId },
  };
}

export function buildCoreSample(input: CoreSampleInput, plates: readonly Source[]): Band[] {
  const order = eraOrder(input.eras);
  return order.map((info) => {
    const era = input.eras.find((e) => e.id === info.id) as Era;
    return info.index === 0 ? todayBand(input, era) : pastBand(input, era, plates);
  });
}
