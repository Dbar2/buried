/**
 * The Report's findings (spec 05 design "Finding rules" and "Empty groups").
 *
 * Three groups, in this order: Water, What the land was used for, Old buildings and fill. Each finding is
 * made through spec 01's constructors, so one without a source, with an unregistered source, or with
 * a banned word cannot exist. Every sentence is built with the sentence builder, so it carries the
 * fact pack it was built from. Nothing here reads a clock or a random number.
 *
 * One departure from the design text, recorded here: "What the land was used for" groups by (use, relation, kind)
 * instead of (use, relation), so "a building" and "an area" are never counted together.
 */
import {
  createFinding,
  createNotCovered,
  createNothingFound,
  datePhrases,
  findBannedWords,
  linkedSets,
  lotRelation,
  plainReason,
  plainSourceName,
  summariseSet,
} from '../evidence';
import type {
  Dated,
  DateSummary,
  Feature,
  FeatureCollection,
  Finding,
  LinkedSet,
  LotRelation,
  PolygonalGeometry,
  Source,
  SourceIndex,
} from '../evidence';
import { COVERAGE_WORDING, coverageVisibility, lotCoverage } from './coverage';
import type { LotCoverage, PlateCoverage } from './coverage';
import * as copy from './copy';
import { statusSentences } from './reviewStatus';
import { LAND_USE_RADIUS_M, RADIUS_M, STRUCTURE_RADIUS_M, WATER_RADIUS_M } from './radii';
import type { GroupId } from './radii';
import { datePhrase, dates, fixed, joined, listOf, onLot, plan, position, quote, sentence, words, within, years } from './sentence';
import type { RelationClaim, Sentence, Slot } from './sentence';

export type ConfidenceEntry = { label: string; reason: string; pattern: 'solid' | 'dashed' | 'dotted' };

export type ReportFinding = {
  finding: Finding;
  sentences: Sentence[];
  confidence: ConfidenceEntry[];
  featureIds: string[];
  /** Why this finding is where it is: on before near, earliest source year, smallest feature id. */
  sortKey: { near: 0 | 1; yearFrom: number; featureId: string };
};

export type Group = { id: GroupId; heading: string; findings: ReportFinding[]; nextStep: Sentence[] | null };

export type GroupsInput = {
  lot: PolygonalGeometry;
  lotErrorM: number;
  sources: SourceIndex;
  /** The evidence the findings are built from. */
  collections: readonly FeatureCollection[];
  /** The evidence whose reviewed and mapped areas say what was checked. */
  coverageCollections: readonly FeatureCollection[];
  /** Plate sources, in id order (see `plateCoverages`). */
  plateSources: readonly Source[];
  /** False for the workspace section: it lists findings only. */
  withEmptyFindings: boolean;
};

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---------- sets and relations ----------

type SetInfo = {
  set: LinkedSet;
  kind: Feature['properties']['kind'];
  summary: DateSummary;
  relation: LotRelation;
  /** The member the relation claim names. */
  claim: Feature;
  sourceIds: string[];
  originIds: string[];
};

function memberRelation(feature: Feature, input: GroupsInput): LotRelation {
  return lotRelation(
    { geometry: feature.geometry, positionErrorM: feature.properties.position_error_m },
    { geometry: input.lot, positionErrorM: input.lotErrorM },
  );
}

function setInfo(set: LinkedSet, input: GroupsInput): SetInfo {
  const relations = set.members.map((member) => ({ member, relation: memberRelation(member, input) }));
  const on = relations.filter((r) => r.relation.kind === 'on');
  let relation: LotRelation;
  let claim: Feature;
  if (on.length > 0) {
    relation = { kind: 'on' };
    claim = (on[0] as (typeof on)[number]).member;
  } else {
    const nears = relations as Array<{ member: Feature; relation: { kind: 'near'; withinM: number } }>;
    const least = Math.min(...nears.map((r) => r.relation.withinM));
    const best = nears.filter((r) => r.relation.withinM === least)[0] as (typeof nears)[number];
    relation = { kind: 'near', withinM: least };
    claim = best.member;
  }
  const origins = new Set<string>();
  const cited = new Set<string>();
  for (const member of set.members) {
    origins.add(member.properties.provenance.origin_source);
    cited.add(member.properties.provenance.origin_source);
    for (const o of member.properties.observations) cited.add(o.source);
  }
  return {
    set,
    kind: claim.properties.kind,
    summary: summariseSet(set, input.sources),
    relation,
    claim,
    sourceIds: [...cited].sort(byString),
    originIds: [...origins].sort(byString),
  };
}

const inRange = (relation: LotRelation, radiusM: number): boolean => relation.kind === 'on' || relation.withinM <= radiusM;

function relationSlot(featureId: string, relation: LotRelation): Slot {
  return relation.kind === 'on' ? onLot(featureId) : within(featureId, relation.withinM);
}

const sourceYearFrom = (sources: SourceIndex, sourceId: string): number => sources.get(sourceId)?.year_from ?? 0;

/** "the 1911 plan and the 1931-35 plan", earliest first. No ids in the sentence. */
function sourceListSlot(sourceIds: readonly string[], sources: SourceIndex): Slot {
  const ordered = [...sourceIds].sort((a, b) => sourceYearFrom(sources, a) - sourceYearFrom(sources, b) || byString(a, b));
  return listOf(ordered.map((sourceId) => plan(sources.get(sourceId))));
}

function confidenceEntry(feature: Feature, sources: SourceIndex): ConfidenceEntry {
  const c = feature.properties.confidence;
  const reason = plainReason(feature.properties.confidence_reason, sources);
  return {
    label: c === 'documented' ? 'Documented' : c === 'estimated' ? 'Estimated' : 'Unknown',
    reason: findBannedWords(reason).length > 0 ? 'The reason is recorded in the evidence file.' : reason,
    pattern: c === 'documented' ? 'solid' : c === 'estimated' ? 'dashed' : 'dotted',
  };
}

function confidenceEntries(members: readonly Feature[], sources: SourceIndex): ConfidenceEntry[] {
  const seen = new Map<string, ConfidenceEntry>();
  for (const m of members) {
    const e = confidenceEntry(m, sources);
    seen.set(`${e.label}|${e.reason}`, e);
  }
  return [...seen.values()];
}

function confidenceSentence(entry: ConfidenceEntry): Sentence {
  return sentence`${words(entry.label)}: ${{ text: entry.reason, verbatim: [entry.reason] }}`;
}

function textOf(sentences: readonly Sentence[]): string {
  return sentences.map((s) => s.text).join(' ');
}

function claimsOf(sentences: readonly Sentence[]): RelationClaim[] {
  return sentences.flatMap((s) => s.claims);
}

function makeReportFinding(
  input: GroupsInput,
  parts: {
    status: 'documented' | 'estimated';
    sentences: Sentence[];
    sourceIds: readonly string[];
    members: readonly Feature[];
    relation: LotRelation;
  },
): ReportFinding {
  const featureIds = [...new Set(parts.members.map((m) => m.id))].sort(byString);
  // The review status of these features, after the sentences about them.
  const sentences = [...parts.sentences, ...statusSentences(parts.members)];
  const finding = createFinding(
    { status: parts.status, text: textOf(sentences), sourceIds: parts.sourceIds, featureIds, relation: parts.relation },
    input.sources,
  );
  return {
    finding,
    sentences,
    confidence: confidenceEntries(parts.members, input.sources),
    featureIds,
    sortKey: {
      near: parts.relation.kind === 'on' ? 0 : 1,
      yearFrom: Math.min(...parts.sourceIds.map((s) => sourceYearFrom(input.sources, s))),
      featureId: featureIds[0] as string,
    },
  };
}

function statusOf(info: readonly SetInfo[]): 'documented' | 'estimated' {
  return info.every((i) => i.summary.conflicts.length === 0 && i.set.members.every((m) => m.properties.confidence === 'documented')) ? 'documented' : 'estimated';
}

const kindWord = (kind: Feature['properties']['kind'], count: number): string => {
  if (kind === 'water') return 'water';
  if (kind === 'land_use') return count === 1 ? 'an area' : `${count} areas`;
  return count === 1 ? 'a building' : `${count} buildings`;
};

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A use as the plan letters it. The evidence files end some uses with "(as lettered on the plate)";
 * the sentence already says "lettered on the 1911 plan as", so that note is not repeated. What is left
 * is a part of the recorded string, unchanged.
 */
export function lettering(use: string): string {
  const trimmed = use.replace(/\s*\(as lettered on the plate\)\s*$/i, '');
  return trimmed === '' ? use : trimmed;
}

// ---------- conflicts ----------

function conflictFinding(info: SetInfo, input: GroupsInput): ReportFinding {
  const s = info.summary;
  const refs = s.conflicts;
  const presence = new Set<string>();
  const absence = new Set<string>();
  if (s.kind === 'dated') for (const p of s.presences) presence.add(p.source);
  for (const r of refs) {
    if (r.visibility !== 'clear') continue;
    (r.present ? presence : absence).add(r.source);
  }
  const subject = info.kind === 'water' ? 'water' : 'a building';
  const rel = relationSlot(info.claim.id, info.relation);
  const list = (ids: Iterable<string>): Slot => sourceListSlot([...ids], input.sources);
  const body =
    absence.size > 0 && presence.size > 0
      ? sentence`The records disagree about ${words(subject)} drawn ${rel}: it is shown on ${list(presence)}, and the spot is shown empty on ${list(absence)}. It needs review.`
      : sentence`The records disagree with each other about ${words(subject)} drawn ${rel}, on ${list(new Set(refs.map((r) => r.source)))}. It needs review.`;
  return makeReportFinding(input, {
    status: 'estimated',
    sentences: [body],
    sourceIds: info.sourceIds,
    members: info.set.members,
    relation: info.relation,
  });
}

// ---------- water and structures ----------

function datedSentences(info: SetInfo): Sentence[] {
  return info.summary.kind === 'dated' && datePhrases(info.summary).length > 0 ? [sentence`${dates(info.summary)}.`] : [];
}

function waterFinding(info: SetInfo, input: GroupsInput): ReportFinding {
  const label = lettering(info.claim.properties.attributes.use ?? '') || undefined;
  const printable = label !== undefined && findBannedWords(label).length === 0;
  const labelled: Slot = printable ? joined([words(' labelled '), quote(label)], '') : words('');
  const rel = relationSlot(info.claim.id, info.relation);
  const sentences = [
    sentence`Water${labelled} is drawn ${rel} on ${sourceListSlot(info.originIds, input.sources)}.`,
    ...datedSentences(info),
    sentence`${position(info.claim.properties.position_error_m)}.`,
    confidenceSentence(confidenceEntry(info.claim, input.sources)),
  ];
  return makeReportFinding(input, { status: statusOf([info]), sentences, sourceIds: info.sourceIds, members: info.set.members, relation: info.relation });
}

function structureFinding(info: SetInfo, input: GroupsInput): ReportFinding {
  // A use lettered on the plan is quoted once, under "What the land was used for" (useFindings).
  const rel = relationSlot(info.claim.id, info.relation);
  const storeys = info.claim.properties.attributes.storeys;
  const sentences = [
    sentence`A building is drawn ${rel} on ${sourceListSlot(info.originIds, input.sources)}.`,
    ...datedSentences(info),
    storeys !== undefined ? sentence`Storeys: ${{ text: String(storeys), numbers: [String(storeys)] }}.` : sentence`Storeys: not recorded.`,
    sentence`${position(info.claim.properties.position_error_m)}.`,
    confidenceSentence(confidenceEntry(info.claim, input.sources)),
  ];
  return makeReportFinding(input, { status: statusOf([info]), sentences, sourceIds: info.sourceIds, members: info.set.members, relation: info.relation });
}

/** Water drawn on the lot, then a building drawn on the lot whose window starts after the water's last record. */
function waterThenBuilding(water: SetInfo, building: SetInfo, input: GroupsInput): ReportFinding | null {
  const w = water.summary;
  const b = building.summary;
  if (w.kind !== 'dated' || b.kind !== 'dated') return null;
  if (w.conflicts.length > 0 || b.conflicts.length > 0) return null;
  if (!(b.window.from > w.lastSeen)) return null;
  const waterPhrase = datePhrase(w as Dated, w.goneBy !== null ? 'Gone by' : 'Last seen');
  const body = sentence`Water is drawn ${onLot(water.claim.id)} on ${sourceListSlot(water.originIds, input.sources)} (${waterPhrase}), and a building is drawn ${onLot(building.claim.id)} on ${sourceListSlot(building.originIds, input.sources)} (${datePhrase(b as Dated, 'Built by')}).`;
  return makeReportFinding(input, {
    status: statusOf([water, building]),
    sentences: [body],
    sourceIds: [...new Set([...water.sourceIds, ...building.sourceIds])].sort(byString),
    members: [...water.set.members, ...building.set.members],
    relation: { kind: 'on' },
  });
}

// ---------- uses ----------

type UseKey = { printable: boolean; use: string; sourceId: string; kind: Feature['properties']['kind']; relationKind: 'on' | 'near' };

function useFindings(input: GroupsInput, features: ReadonlyArray<{ feature: Feature; relation: LotRelation }>): ReportFinding[] {
  const groups = new Map<string, { key: UseKey; items: typeof features[number][] }>();
  for (const item of features) {
    const raw = item.feature.properties.attributes.use;
    if (raw === undefined) continue;
    const use = lettering(raw);
    const printable = findBannedWords(use).length === 0;
    const sourceId = item.feature.properties.provenance.origin_source;
    const key: UseKey = { printable, use: printable ? use : '', sourceId: printable ? '' : sourceId, kind: item.feature.properties.kind, relationKind: item.relation.kind };
    const mapKey = JSON.stringify([key.printable, key.use, key.sourceId, key.kind, key.relationKind]);
    const group = groups.get(mapKey) ?? { key, items: [] };
    group.items.push(item);
    groups.set(mapKey, group);
  }
  const out: ReportFinding[] = [];
  for (const { key, items } of groups.values()) {
    items.sort((a, b) => byString(a.feature.id, b.feature.id));
    const members = items.map((i) => i.feature);
    const widest = items.reduce((best, i) => (i.relation.kind === 'near' && (best.relation.kind !== 'near' || i.relation.withinM > best.relation.withinM) ? i : best), items[0] as (typeof items)[number]);
    const relation: LotRelation = key.relationKind === 'on' ? { kind: 'on' } : { kind: 'near', withinM: (widest.relation as { withinM: number }).withinM };
    const rel: Slot =
      relation.kind === 'on'
        ? { ...onLot((items[0] as (typeof items)[number]).feature.id), claims: items.map((i) => ({ featureId: i.feature.id, kind: 'on' as const })) }
        : {
            ...within(widest.feature.id, relation.withinM),
            claims: items.map((i) => ({ featureId: i.feature.id, kind: 'near' as const, withinM: (i.relation as { withinM: number }).withinM })),
          };
    const originIds = [...new Set(members.map((m) => m.properties.provenance.origin_source))].sort(byString);
    const what = words(capitalise(kindWord(members[0]?.properties.kind ?? 'building', members.length)));
    const countNum: Slot = { text: '', numbers: members.length > 1 ? [String(members.length)] : [] };
    const verb = words(members.length === 1 ? 'is' : 'are');
    const body = key.printable
      ? sentence`${what}${countNum} ${rel} ${verb} lettered on ${sourceListSlot(originIds, input.sources)} as ${quote(key.use)}.`
      : sentence`A use printed on ${plan(input.sources.get(key.sourceId))} is recorded for ${words(kindWord(members[0]?.properties.kind ?? 'building', members.length))}${countNum} ${rel}. Its wording is not reproduced in this report; see the source.`;
    const errorM = Math.max(...members.map((m) => m.properties.position_error_m));
    const cited = new Set<string>();
    for (const m of members) for (const o of m.properties.observations) cited.add(o.source);
    for (const o of originIds) cited.add(o);
    out.push(
      makeReportFinding(input, {
        status: members.every((m) => m.properties.confidence === 'documented') ? 'documented' : 'estimated',
        sentences: [body, sentence`${position(errorM)}.`],
        sourceIds: [...cited].sort(byString),
        members,
        relation,
      }),
    );
  }
  return out;
}

// ---------- ordering and empty groups ----------

function sortFindings(list: ReportFinding[]): ReportFinding[] {
  return [...list].sort(
    (a, b) => a.sortKey.near - b.sortKey.near || a.sortKey.yearFrom - b.sortKey.yearFrom || byString(a.sortKey.featureId, b.sortKey.featureId) || byString(a.sentences[0]?.text ?? '', b.sentences[0]?.text ?? ''),
  );
}

type Rows = ReadonlyArray<{ source: Source; coverage: LotCoverage }>;

const COVERAGE_ORDER: readonly LotCoverage[] = ['reviewed', 'mapped', 'not_read', 'not_mapped'];

/** "the 1911 plan (1911, revised to 1914)": a plan's plain name and the years its record states. */
function planWithYears(source: Source): Slot {
  return joined([plan(source), words(' ('), years(source), words(')')], '');
}

/**
 * What was looked at, in plain words and in one run: one sentence per kind of coverage, such as
 * "Checked here: the 1911 plan (1911, revised to 1914) and the 1931-35 plan (1931, revised to 1935)."
 * Two sheets of one plan are named once, by the one that says most about the lot. The finding's
 * `checked` list (built from every row) keeps each sheet with its visibility.
 */
function recordLines(rows: Rows): Sentence[] {
  const best = new Map<string, { source: Source; coverage: LotCoverage }>();
  for (const row of rows) {
    const key = plainSourceName(row.source);
    const have = best.get(key);
    if (!have || COVERAGE_ORDER.indexOf(row.coverage) < COVERAGE_ORDER.indexOf(have.coverage)) best.set(key, row);
  }
  return COVERAGE_ORDER.flatMap((coverage) => {
    const group = [...best.values()]
      .filter((r) => r.coverage === coverage)
      .sort((a, b) => (a.source.year_from ?? 0) - (b.source.year_from ?? 0) || byString(a.source.id, b.source.id));
    if (group.length === 0) return [];
    const label = capitalise(COVERAGE_WORDING[coverage]);
    return [sentence`${words(label)}: ${listOf(group.map((r) => planWithYears(r.source)))}.`];
  });
}

function checkedFinding(kind: 'nothing_found' | 'not_covered', head: Sentence, rows: Rows, input: GroupsInput): ReportFinding {
  const sentences = [head, ...recordLines(rows)];
  const checked = rows.map(({ source, coverage }) => ({ sourceId: source.id, visibility: coverageVisibility(coverage) }));
  const text = textOf(sentences);
  const finding = kind === 'nothing_found' ? createNothingFound(text, checked, input.sources) : createNotCovered(text, checked, input.sources);
  return {
    finding,
    sentences,
    confidence: [],
    featureIds: [],
    sortKey: { near: 1, yearFrom: Math.min(...rows.map((r) => r.source.year_from ?? 0)), featureId: '' },
  };
}

function idList(rows: Rows): Slot {
  return listOf(rows.map((r) => plan(r.source)));
}

function coveragesFor(input: GroupsInput, radiusM: number, kinds: ReadonlyArray<'building' | 'water' | 'land_use'>): PlateCoverage[] {
  const byOrigin = new Map<string, FeatureCollection>();
  for (const c of input.coverageCollections) byOrigin.set(c.origin_source, c);
  return input.plateSources.map((source) => {
    const parts = kinds.map((k) => lotCoverage(input.lot, byOrigin.get(source.id), radiusM, k));
    const coverage: LotCoverage =
      parts.find((p) => p === 'not_read') ?? parts.find((p) => p === 'not_mapped') ?? (parts.every((p) => p === 'reviewed') ? 'reviewed' : 'mapped');
    return { source, coverage };
  });
}

// ---------- the three groups ----------

/**
 * One entry per linked set of building outlines within the structure radius of the lot, with its
 * relation to the lot. The place summary counts these; they are the same sets the "Old buildings and
 * fill" group reports on.
 */
export function structureOutlines(input: GroupsInput): Array<{ featureId: string; relation: LotRelation }> {
  return linkedSets(input.collections)
    .map((set) => setInfo(set, input))
    .filter((i) => i.kind === 'building' && inRange(i.relation, STRUCTURE_RADIUS_M))
    .map((i) => ({ featureId: i.claim.id, relation: i.relation }));
}

const NEXT: Record<GroupId, string> = { water: copy.NEXT_WATER, land_use: copy.NEXT_LAND_USE, structures: copy.NEXT_STRUCTURES };

function finishGroup(id_: GroupId, findings: ReportFinding[]): Group {
  const hasEvidence = findings.some((f) => f.finding.status === 'documented' || f.finding.status === 'estimated');
  return {
    id: id_,
    heading: copy.GROUP_HEADINGS[id_],
    findings: sortFindings(findings),
    nextStep: hasEvidence ? [fixed(NEXT[id_])] : null,
  };
}

export function buildGroups(input: GroupsInput): [Group, Group, Group] {
  const infos = linkedSets(input.collections).map((set) => setInfo(set, input));
  const conflicted = (i: SetInfo) => i.summary.conflicts.length > 0;

  // Water history
  const waterInfos = infos.filter((i) => i.kind === 'water' && inRange(i.relation, WATER_RADIUS_M));
  const water: ReportFinding[] = [];
  for (const i of waterInfos) {
    if (conflicted(i)) water.push(conflictFinding(i, input));
    else if (i.summary.kind === 'dated') water.push(waterFinding(i, input));
  }
  if (input.withEmptyFindings && water.length === 0) {
    const rows = coveragesFor(input, WATER_RADIUS_M, ['water']);
    const reviewed = rows.filter((r) => r.coverage === 'reviewed');
    const mapped = rows.filter((r) => r.coverage === 'mapped');
    if (reviewed.length > 0 && mapped.length === 0) {
      water.push(checkedFinding('nothing_found', sentence`No water is drawn at this lot or within ${num100()} m.`, rows, input));
    } else {
      water.push(
        checkedFinding(
          'not_covered',
          sentence`No record Buried has read has been checked for water at this lot. Water is traced by hand, and a record can show water that has not been traced.`,
          rows,
          input,
        ),
      );
    }
  }

  // Fill and old structures
  const buildingInfos = infos.filter((i) => i.kind === 'building' && inRange(i.relation, STRUCTURE_RADIUS_M));
  const structures: ReportFinding[] = [];
  for (const i of buildingInfos) {
    if (conflicted(i)) structures.push(conflictFinding(i, input));
    else if (i.summary.kind === 'dated') structures.push(structureFinding(i, input));
  }
  const datedWater = waterInfos.filter((i) => i.relation.kind === 'on' && !conflicted(i));
  const datedBuildings = buildingInfos.filter((i) => i.relation.kind === 'on' && !conflicted(i));
  for (const w of datedWater) {
    for (const b of datedBuildings) {
      const pair = waterThenBuilding(w, b, input);
      if (pair) structures.push(pair);
    }
  }
  const structureRows = coveragesFor(input, STRUCTURE_RADIUS_M, ['building']);
  if (input.withEmptyFindings) {
    const reviewed = structureRows.filter((r) => r.coverage === 'reviewed');
    const mapped = structureRows.filter((r) => r.coverage === 'mapped');
    if (structures.length === 0 && reviewed.length > 0) {
      structures.push(checkedFinding('nothing_found', sentence`No building is drawn at this lot or within ${num10()} m.`, structureRows, input));
    }
    if (mapped.length > 0) {
      structures.push(checkedFinding('not_covered', sentence`This lot is on ${idList(mapped)}, but not every building they draw here has been checked.`, structureRows, input));
    }
    if (structures.length === 0) {
      structures.push(checkedFinding('not_covered', sentence`No record Buried has read shows this lot.`, structureRows, input));
    }
  }

  // Past land use
  const landRows = coveragesFor(input, LAND_USE_RADIUS_M, ['building', 'land_use']);
  const inLandRange: Array<{ feature: Feature; relation: LotRelation; setKey: string }> = [];
  for (const i of infos) {
    if (i.kind === 'water') continue;
    for (const member of i.set.members) {
      const relation = memberRelation(member, input);
      if (inRange(relation, LAND_USE_RADIUS_M)) inLandRange.push({ feature: member, relation, setKey: i.set.memberIds[0] as string });
    }
  }
  const landUse = useFindings(input, inLandRange);
  // Counted per linked set: one building drawn on two plates is one building.
  const withoutUse = new Set(inLandRange.filter((x) => x.feature.properties.attributes.use === undefined).map((x) => x.setKey)).size;
  if (input.withEmptyFindings) {
    const reviewed = landRows.filter((r) => r.coverage === 'reviewed');
    const mapped = landRows.filter((r) => r.coverage === 'mapped');
    if (withoutUse > 0) {
      landUse.push(
        checkedFinding(
          'not_covered',
          sentence`Uses are not recorded for ${{ text: String(withoutUse), numbers: [String(withoutUse)] }} buildings or areas drawn at this lot or within ${num30()} m of it.`,
          landRows,
          input,
        ),
      );
    } else if (landUse.length === 0 && reviewed.length > 0) {
      landUse.push(checkedFinding('nothing_found', sentence`No building or land use is drawn at this lot or within ${num30()} m.`, landRows, input));
    }
    if (mapped.length > 0) {
      landUse.push(checkedFinding('not_covered', sentence`This lot is on ${idList(mapped)}, but not every building or area they draw here has been checked.`, landRows, input));
    }
    if (landUse.length === 0) {
      landUse.push(checkedFinding('not_covered', sentence`No record Buried has read shows this lot.`, landRows, input));
    }
  }

  return [finishGroup('water', water), finishGroup('land_use', landUse), finishGroup('structures', structures)];
}

// Fixed radii as slots, so the figure in the sentence is in its pack.
const radiusSlot = (m: number): Slot => ({ text: String(m), numbers: [String(m)] });
const num100 = (): Slot => radiusSlot(WATER_RADIUS_M);
const num30 = (): Slot => radiusSlot(LAND_USE_RADIUS_M);
const num10 = (): Slot => radiusSlot(STRUCTURE_RADIUS_M);

export { RADIUS_M };
export { claimsOf };
