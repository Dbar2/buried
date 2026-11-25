/**
 * `buildLotCheck`: the Result page's view model (spec 08 design "buildLotCheck"). Pure. It takes the
 * Report model for a lot and decides, in code and from the lettering, which of five tags the lot gets
 * and which uses sit behind it. The page only lays it out.
 *
 * The tag (requirement 4):
 *   past_industrial  a use on this lot matches the Industrial list
 *   industrial_next  none is on the lot and one is near it
 *   past_use         a use is lettered on the lot but matches no list entry (session 051 decision 1)
 *   no_industrial    nothing above, and a plan is reviewed for the lot
 *   not_covered      nothing above and no plan is reviewed for the lot
 *
 * Departures from the design text, recorded in docs/kiro-sessions/051-notes.md: the function also takes the
 * lot's geometry and the tile sidecars (the Report holds sentences, not geometry or crops), and a use
 * is read from the evidence by the feature ids the Report's "What the land was used for" group cites.
 */
import { checkSentence, industrialMatch, lotRelation, originPhrase, plainYears, provenanceFacts } from '../evidence';
import type { Feature, FeatureCollection, LotRelation, PolygonalGeometry, Source, SourceIndex, TileSidecar } from '../evidence';
import type { Report, ReportModel } from '../report/buildReport';
import { BUILDING_OUTLINES_SOURCE } from '../report/coreSample';
import type { Band } from '../report/coreSample';
import { versionPrefix } from '../report/links';
import { NO_ADDRESS_HEADING } from '../report/copy';
import { offsetOf, toJts } from '../report/geom';
import { LOT_POSITION_ERROR_M } from '../report/lotError';
import { STRUCTURE_RADIUS_M } from '../report/radii';
import { statusSentences } from '../report/reviewStatus';
import { fixed, joined, listOf, num, plan, position, sentence, words } from '../report/sentence';
import type { Sentence, Slot } from '../report/sentence';
import * as copy from './copy';
import type { LotTag } from './copy';
import { isQuotable, normaliseLettering, readCropOf, useParts } from './lettering';
import type { ReadCrop } from './lettering';

export type LotCheckInput = {
  lot: PolygonalGeometry;
  /** The published evidence files (canon only). */
  collections: readonly FeatureCollection[];
  tiles: readonly TileSidecar[];
  sources: SourceIndex;
  siteOrigin: string;
};

/** A feature on or near the lot whose lettered use matches the Industrial list. */
export type Trigger = {
  featureId: string;
  sourceId: string;
  /** "the 1911 plan". */
  planName: string;
  /** The lettering as recorded (without the recorder's note), or null when it holds a word this site does not print. */
  lettering: string | null;
  /** The list entry that matched. */
  matched: string;
  relation: LotRelation;
  positionErrorM: number;
  cropRef: ReadCrop | null;
};

/** One lettered use in a plan's row, matched or not. */
export type UseLine = {
  featureId: string;
  sourceId: string;
  /** The lettering, quoted ("Coal & Wood Yard, J. W. Corson & Co."), or the line that says it is not reproduced. */
  text: Sentence;
  quotable: boolean;
  relation: LotRelation;
  relationText: Sentence;
  /** The list entry that matched, or null. */
  matched: string | null;
  cropRef: ReadCrop | null;
};

export type PlanRow = {
  kind: 'plan';
  sourceId: string;
  eraId: string;
  /** "1911", "1931-35". */
  yearLabel: string;
  planName: string;
  reviewed: boolean;
  lines: UseLine[];
  /** What the plan shows when it letters nothing here. Empty when `lines` is not. */
  sentences: Sentence[];
};

export type TodayRow = { kind: 'today'; yearLabel: 'Today'; sentences: Sentence[] };

/**
 * The inscription at the top of the record sheet (session 053), set like a grave marker: a fixed lead ("HERE STOOD"),
 * the lettered name as the plan quotes it, and one line of years. Built from the same facts as the verdict sentence.
 * `name` is null when the plan's wording is not printed here (a banned word) or when nothing was lettered.
 */
export type Inscription = { lead: string; name: Sentence | null; foot: Sentence | null };

export type LotCheck =
  | { kind: 'not_covered'; tag: 'not_covered'; tagText: string; sentence: Sentence }
  | { kind: 'failed'; text: typeof copy.COULD_NOT_PRODUCE; reason: string }
  | {
      kind: 'check';
      lotId: string;
      title: Sentence;
      verdict: { tag: LotTag; tagText: string; triggers: Trigger[]; sentences: Sentence[]; notClearance: string | null; inscription: Inscription };
      rows: Array<PlanRow | TodayRow>;
      cannotTell: { screens: Sentence; soil: Sentence; locate: { lead: Sentence; link: { text: string; url: string } } };
      provenance: { attribution: string[]; position: Sentence | null; traced: Sentence[]; review: Sentence[] };
      compare: { planSourceIds: string[] };
      links: { print: string; share: string };
    };

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

type Item = {
  feature: Feature;
  sourceId: string;
  source: Source | undefined;
  whole: string;
  head: string;
  rest: string;
  quotable: boolean;
  matched: string | null;
  relation: LotRelation;
  cropRef: ReadCrop | null;
};

const yearOf = (item: Item): number => item.source?.year_from ?? 0;
const withinOf = (r: LotRelation): number => (r.kind === 'near' ? r.withinM : 0);

function byRelationThenId(a: Item, b: Item): number {
  return (a.relation.kind === 'on' ? 0 : 1) - (b.relation.kind === 'on' ? 0 : 1) || withinOf(a.relation) - withinOf(b.relation) || byString(a.feature.id, b.feature.id);
}

const quoted = (text: string): Slot => ({ text: `“${text}”`, verbatim: [text] });
const verbatimSlot = (text: string): Slot => ({ text, verbatim: [text] });

/** The key two uses share when the page would say they are one: the same lettering, or (for a use it does not print) the same plan. */
function useKey(item: Item): string {
  return item.quotable ? normaliseLettering(item.whole) : `~${item.sourceId}`;
}

const isArea = (item: Item): boolean => item.feature.id.startsWith('use_');

/** Overlap, in square metres, of a feature with the lot. Pure geometry in EPSG:26917, no model. */
function overlapM2(feature: Feature, lot: PolygonalGeometry): number {
  try {
    const offset = offsetOf(lot);
    const a = toJts(feature.geometry as { type: string; coordinates: unknown }, offset);
    const b = toJts(lot, offset);
    return a.intersection(b).getArea();
  } catch {
    return 0;
  }
}

/**
 * The one use the top sentence is about (session 052): the one that covers the most of the lot, an area before a
 * building when they cover the same, then the earlier plan, then the feature id. A use that is only near the
 * lot covers none of it, so the nearer one goes first before the same tie-breaks.
 */
function leadUse(items: readonly Item[], lot: PolygonalGeometry): Item | null {
  if (items.length === 0) return null;
  const keyed = items.map((item) => ({ item, overlap: Math.round(overlapM2(item.feature, lot) * 10) / 10 }));
  keyed.sort(
    (a, b) =>
      b.overlap - a.overlap ||
      withinOf(a.item.relation) - withinOf(b.item.relation) ||
      Number(isArea(b.item)) - Number(isArea(a.item)) ||
      yearOf(a.item) - yearOf(b.item) ||
      byString(a.item.feature.id, b.item.feature.id),
  );
  return (keyed[0] as { item: Item }).item;
}

/** The sentence for the lead use, naming every plan that letters it in those words. */
function leadSentences(items: readonly Item[], lot: PolygonalGeometry): Sentence[] {
  const lead = leadUse(items, lot);
  if (!lead) return [];
  const key = useKey(lead);
  return useSentences(items.filter((i) => useKey(i) === key));
}

/** One sentence per lettered use that triggered the tag (or, for the fifth tag, sat on the lot). */
function useSentences(items: readonly Item[]): Sentence[] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    // A use this site does not print is grouped by its plan, so two different hidden uses are never said to be one.
    const key = useKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const ordered = [...groups.entries()]
    .map(([key, list]) => ({ key, list: [...list].sort((a, b) => yearOf(a) - yearOf(b) || byString(a.feature.id, b.feature.id)) }))
    .sort((a, b) => yearOf(a.list[0] as Item) - yearOf(b.list[0] as Item) || byString(a.key, b.key));
  return ordered.map(({ list }) => {
    const first = list[0] as Item;
    const planSources = list.flatMap((i) => (i.source ? [i.source] : []));
    const plural = new Set(planSources.map((s) => plainYears(s))).size > 1;
    const verb = words(plural ? 'letter' : 'letters');
    const plans = copy.plansSlot(planSources, true);
    const near = list.filter((i) => i.relation.kind === 'near');
    const onLot = list.some((i) => i.relation.kind === 'on');
    let where: Slot;
    if (onLot) {
      where = { text: 'this lot', claims: list.filter((i) => i.relation.kind === 'on').map((i) => ({ featureId: i.feature.id, kind: 'on' as const })) };
    } else {
      const widest = Math.max(...near.map((i) => withinOf(i.relation)));
      where = {
        text: `near this lot (within ${widest} m)`,
        numbers: [String(widest)],
        claims: near.map((i) => ({ featureId: i.feature.id, kind: 'near' as const, withinM: withinOf(i.relation) })),
      };
    }
    if (!first.quotable) {
      return onLot
        ? sentence`${plans} ${verb} a use on this lot that this page does not quote. ${words(copy.WORDING_NOT_REPRODUCED)}`
        : sentence`${plans} ${verb} a use ${where} that this page does not quote. ${words(copy.WORDING_NOT_REPRODUCED)}`;
    }
    return onLot ? sentence`${plans} ${verb} ${where} ${quoted(first.head)}.` : sentence`${plans} ${verb} ${quoted(first.head)} ${where}.`;
  });
}

/** The plans a list of sources stand for, by their plain years, earliest first, each once. */
function planYears(sources: readonly Source[]): { words: string; list: Slot } {
  const ordered = [...sources].sort((a, b) => (a.year_from ?? 0) - (b.year_from ?? 0) || byString(a.id, b.id));
  const seen: string[] = [];
  for (const s of ordered) {
    const y = plainYears(s);
    if (!seen.includes(y)) seen.push(y);
  }
  return { words: seen.length > 1 ? 'plans' : 'plan', list: listOf(seen.map((y): Slot => ({ text: y, numbers: y.match(/\d+/g) ?? [] }))) };
}

/**
 * The inscription for a verdict (requirement 10.1). `found` is the use the verdict's sentence is about, with every use
 * that letters the same words; `reviewed` are the plans that cover the lot when no use is lettered.
 */
function inscriptionFor(tag: LotTag, found: { lead: Item; group: Item[] } | null, reviewed: readonly Source[]): Inscription {
  const name = (item: Item): Sentence | null => (item.quotable ? sentence`${verbatimSlot(item.head)}` : null);
  if ((tag === 'past_industrial' || tag === 'past_use') && found) {
    const plans = planYears(found.group.flatMap((i) => (i.source ? [i.source] : [])));
    return { lead: copy.INSCRIPTION.here, name: name(found.lead), foot: sentence`recorded on the ${words(plans.words)} of ${plans.list}` };
  }
  if (tag === 'industrial_next' && found) {
    const plans = planYears(found.group.flatMap((i) => (i.source ? [i.source] : [])));
    const widest = Math.max(...found.group.map((i) => withinOf(i.relation)));
    return { lead: copy.INSCRIPTION.next, name: name(found.lead), foot: sentence`within ${num(widest)} m, on the ${words(plans.words)} of ${plans.list}` };
  }
  if (tag === 'no_industrial') {
    const plans = planYears(reviewed);
    return { lead: copy.INSCRIPTION.nothing, name: null, foot: sentence`on the ${words(plans.words)} of ${plans.list}` };
  }
  return { lead: copy.INSCRIPTION.notDug, name: null, foot: null };
}

function lineOf(item: Item, planSource: Source | undefined): UseLine {
  const text = item.quotable
    ? sentence`${joined([verbatimSlot(item.head), ...(item.rest ? [words(', '), verbatimSlot(item.rest)] : [])], '')}`
    : sentence`${planSource ? copy.plansSlot([planSource], true) : words('A plan')} ${words('letters a use here that this page does not quote.')} ${words(copy.WORDING_NOT_REPRODUCED)}`;
  const relationText =
    item.relation.kind === 'on'
      ? sentence`${{ text: 'On this lot', claims: [{ featureId: item.feature.id, kind: 'on' as const }] }}`
      : sentence`${{
          text: `Near this lot (within ${item.relation.withinM} m)`,
          numbers: [String(item.relation.withinM)],
          claims: [{ featureId: item.feature.id, kind: 'near' as const, withinM: item.relation.withinM }],
        }}`;
  return {
    featureId: item.feature.id,
    sourceId: item.sourceId,
    text,
    quotable: item.quotable,
    relation: item.relation,
    relationText,
    matched: item.matched,
    cropRef: item.cropRef,
  };
}

function tracedSentence(feature: Feature, source: Source | undefined): Sentence {
  const facts = provenanceFacts(feature);
  const state = feature.properties.provenance.review?.state;
  const how = facts.tracedAutomatically ? originPhrase(facts) : state === 'draft_hand' ? 'traced by hand from' : 'read from';
  return sentence`The outline was ${words(how)} ${source ? plan(source) : words('the plan')}.`;
}

export function buildLotCheck(model: ReportModel, input: LotCheckInput): LotCheck {
  if (model.kind === 'not_reconstructed') {
    return { kind: 'not_covered', tag: 'not_covered', tagText: copy.TAG_TEXT.not_covered, sentence: fixed(copy.NOT_RECONSTRUCTED) };
  }
  if (model.kind === 'failed') return { kind: 'failed', text: copy.COULD_NOT_PRODUCE, reason: model.reason };
  try {
    return build(model, input);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('The lot check could not be produced:', reason);
    return { kind: 'failed', text: copy.COULD_NOT_PRODUCE, reason };
  }
}

/**
 * The Today row: the addresses on the lot and how many of the City's building outlines meet it ("2A, 2B, 2C and 2D
 * Percy St, 6 building outlines."). A lot with no address, or with no outline, keeps the Report's own sentence.
 */
function todaySentences(heading: Sentence, band: Band | undefined): Sentence[] {
  if (!band) return [];
  const count = band.buildingCount;
  if (count === undefined || count === 0 || heading.text === NO_ADDRESS_HEADING) return band.sentences;
  const address: Slot = { text: heading.text, numbers: heading.pack.numbers, ids: heading.pack.ids, verbatim: heading.pack.verbatim };
  const noun = words(count === 1 ? ' building outline.' : ' building outlines.');
  return [sentence`${address}, ${num(count)}${noun}`];
}

function build(report: Report, input: LotCheckInput): LotCheck {
  const { lot, collections, tiles, sources } = input;
  const lotId = report.place.lotId;
  const featureById = new Map(collections.flatMap((c) => c.features).map((f) => [f.id, f]));

  // Every lettered use the Report cites under "What the land was used for", with its relation to the lot.
  const items: Item[] = [];
  const cited = [...new Set(report.groups[1].findings.flatMap((f) => f.featureIds))].sort(byString);
  for (const id of cited) {
    const feature = featureById.get(id);
    const use = feature?.properties.attributes.use;
    if (!feature || use === undefined) continue;
    const parts = useParts(use);
    const sourceId = feature.properties.provenance.origin_source;
    const source = sources.get(sourceId);
    const relation = lotRelation(
      { geometry: feature.geometry, positionErrorM: feature.properties.position_error_m },
      { geometry: lot, positionErrorM: LOT_POSITION_ERROR_M },
    );
    items.push({
      feature,
      sourceId,
      source,
      whole: parts.whole,
      head: parts.head,
      rest: parts.rest,
      quotable: isQuotable(parts.whole),
      matched: industrialMatch(parts.whole),
      relation,
      cropRef: readCropOf(feature, tiles, source ? `${copy.plansSlot([source]).text}` : 'the plan'),
    });
  }
  items.sort(byRelationThenId);

  const onTriggers = items.filter((i) => i.matched !== null && i.relation.kind === 'on');
  const nearTriggers = items.filter((i) => i.matched !== null && i.relation.kind === 'near');
  const onOther = items.filter((i) => i.matched === null && i.relation.kind === 'on');

  // Plates that show the lot, earliest first, each with the band that covers it.
  const plateBand = new Map<string, { band: Band; reviewed: boolean }>();
  for (const band of report.coreSample) {
    for (const p of band.coverage.plates) {
      if ((p.coverage === 'reviewed' || p.coverage === 'mapped') && !plateBand.has(p.sourceId)) plateBand.set(p.sourceId, { band, reviewed: p.coverage === 'reviewed' });
    }
  }
  const plateIds = [...plateBand.keys()].sort((a, b) => (sources.get(a)?.year_from ?? 0) - (sources.get(b)?.year_from ?? 0) || byString(a, b));
  const reviewedPlateIds = plateIds.filter((id) => plateBand.get(id)?.reviewed);

  // ---- the verdict ----
  let tag: LotTag;
  let recordItems: Item[];
  let sentences: Sentence[];
  let notClearance: string | null = null;
  const foundIn = (list: Item[]): { lead: Item; group: Item[] } | null => {
    const lead = leadUse(list, lot);
    return lead ? { lead, group: list.filter((i) => useKey(i) === useKey(lead)) } : null;
  };
  let found: { lead: Item; group: Item[] } | null = null;
  let reviewedSources: Source[] = [];
  if (onTriggers.length > 0) {
    tag = 'past_industrial';
    recordItems = onTriggers;
    sentences = leadSentences(onTriggers, lot);
    found = foundIn(onTriggers);
  } else if (nearTriggers.length > 0) {
    tag = 'industrial_next';
    recordItems = nearTriggers;
    sentences = leadSentences(nearTriggers, lot);
    found = foundIn(nearTriggers);
  } else if (onOther.length > 0) {
    tag = 'past_use';
    recordItems = onOther;
    sentences = leadSentences(onOther, lot);
    found = foundIn(onOther);
  } else if (reviewedPlateIds.length > 0) {
    tag = 'no_industrial';
    recordItems = [];
    reviewedSources = reviewedPlateIds.flatMap((id) => {
      const s = sources.get(id);
      return s ? [s] : [];
    });
    const r: Slot = { text: String(STRUCTURE_RADIUS_M), numbers: [String(STRUCTURE_RADIUS_M)] };
    sentences = [
      sentence`${copy.plansSlot(reviewedSources, true)} ${words(reviewedSources.length > 1 && new Set(reviewedSources.map((s) => plainYears(s))).size > 1 ? 'letter' : 'letters')} no industrial use on this lot or within ${r} m.`,
    ];
    notClearance = copy.NOT_A_CLEARANCE;
  } else {
    tag = 'not_covered';
    recordItems = [];
    sentences = report.summary;
  }

  const triggers: Trigger[] =
    tag === 'past_industrial' || tag === 'industrial_next'
      ? recordItems.map((i) => ({
          featureId: i.feature.id,
          sourceId: i.sourceId,
          planName: i.source ? copy.plansSlot([i.source]).text : 'the plan',
          lettering: i.quotable ? i.whole : null,
          matched: i.matched as string,
          relation: i.relation,
          positionErrorM: i.feature.properties.position_error_m,
          cropRef: i.cropRef,
        }))
      : [];

  // ---- the rows ----
  const planRows: PlanRow[] = plateIds.map((sourceId) => {
    const source = sources.get(sourceId);
    const entry = plateBand.get(sourceId) as { band: Band; reviewed: boolean };
    const lines = items.filter((i) => i.sourceId === sourceId).map((i) => lineOf(i, source));
    return {
      kind: 'plan' as const,
      sourceId,
      eraId: entry.band.eraId,
      yearLabel: source ? plainYears(source) : sourceId,
      planName: source ? copy.plansSlot([source]).text : 'the plan',
      reviewed: entry.reviewed,
      lines,
      sentences: lines.length === 0 ? entry.band.sentences : [],
    };
  });
  const today = report.coreSample.find((b) => b.sourceIds.includes(BUILDING_OUTLINES_SOURCE));
  const todayRow: TodayRow = { kind: 'today', yearLabel: 'Today', sentences: todaySentences(report.place.heading, today) };

  // ---- provenance ----
  const shown = recordItems.length > 0 ? [...new Set(recordItems.map((i) => i.sourceId))] : plateIds;
  const shownSorted = shown.sort((a, b) => (sources.get(a)?.year_from ?? 0) - (sources.get(b)?.year_from ?? 0) || byString(a, b));
  const attribution = [...new Set(shownSorted.flatMap((id) => report.sources.filter((s) => s.id === id).map((s) => s.attributionLine)))];
  let positionLine: Sentence | null = null;
  if (recordItems.length > 0) {
    positionLine = sentence`${position(Math.max(...recordItems.map((i) => i.feature.properties.position_error_m)))}.`;
  } else {
    const errors = tiles.filter((t) => shownSorted.includes(t.source)).map((t) => t.alignment_error_m);
    if (errors.length > 0) positionLine = sentence`${position(Math.max(...errors))}.`;
  }
  const tracedByText = new Map<string, Sentence>();
  for (const i of recordItems) {
    const s = tracedSentence(i.feature, i.source);
    tracedByText.set(s.text, s);
  }
  const traced = [...tracedByText.keys()].sort().map((k) => tracedByText.get(k) as Sentence);
  const review = statusSentences(recordItems.map((i) => i.feature));

  const encoded = encodeURIComponent(lotId);
  const prefix = versionPrefix(report.dataVersion);
  const check: LotCheck = {
    kind: 'check',
    lotId,
    title: report.place.heading,
    verdict: { tag, tagText: copy.TAG_TEXT[tag], triggers, sentences, notClearance, inscription: inscriptionFor(tag, found, reviewedSources) },
    rows: [...planRows, todayRow],
    cannotTell: {
      screens: report.screensLine,
      soil: fixed(copy.CANNOT_TELL_SOIL),
      locate: { lead: fixed(copy.NOT_A_LOCATE_LEAD), link: report.beforeYouDigLink },
    },
    provenance: { attribution, position: positionLine, traced, review },
    compare: { planSourceIds: plateIds.filter((id) => tiles.some((t) => t.source === id)) },
    links: {
      print: `/report?lot=${encoded}&print=1`,
      share: `${input.siteOrigin}/lot/${encoded}${prefix === '' ? '' : `?v=${prefix}`}`,
    },
  };

  for (const s of allSentences(check)) {
    const result = checkSentence(s.text, s.pack);
    if (!result.ok) {
      console.error('A lot check sentence failed its check:', s.text, result.reasons);
      return { kind: 'failed', text: copy.COULD_NOT_PRODUCE, reason: `A sentence failed its check: ${result.reasons.join('; ')}` };
    }
  }
  return check;
}

/** Every sentence of a check, for the final check and the tests. */
export function allSentences(check: Extract<LotCheck, { kind: 'check' }>): Sentence[] {
  return [
    check.title,
    ...check.verdict.sentences,
    ...(check.verdict.inscription.name ? [check.verdict.inscription.name] : []),
    ...(check.verdict.inscription.foot ? [check.verdict.inscription.foot] : []),
    ...check.rows.flatMap((r) => (r.kind === 'today' ? r.sentences : [...r.sentences, ...r.lines.flatMap((l) => [l.text, l.relationText])])),
    check.cannotTell.screens,
    check.cannotTell.soil,
    check.cannotTell.locate.lead,
    ...(check.provenance.position ? [check.provenance.position] : []),
    ...check.provenance.traced,
    ...check.provenance.review,
  ];
}
