/**
 * `buildReport`: the whole Report model (spec 05 design "Inputs and model"). Pure. It is the only
 * place that decides what the Report says; the views only lay it out.
 *
 * Order of work: find the lot; check coverage; findings over canon; the core sample; fixed
 * sections; sources; links; then `checkSentence` on every sentence. The workspace section is built
 * last, from workspace inputs only, so nothing in it can reach the canon parts (property R10). Any
 * failure gives `failed`: a partly checked report is worse than none.
 */
import { checkSentence, HonestyError, indexSources, sourceYearsText } from '../evidence';
import type { Era, FeatureCollection, PolygonalGeometry, PresentLayer, Project, Source, SourceRegistry, TileSidecar } from '../evidence';
import { findBannedWords } from '../evidence';
import { aerialCoversLot, isPlateSource, lotCoverage } from './coverage';
import { buildCoreSample } from './coreSample';
import type { Band } from './coreSample';
import * as copy from './copy';
import { buildGroups } from './findings';
import type { Group } from './findings';
import { offsetOf, toJts, unionAll } from './geom';
import { LOT_POSITION_ERROR_M } from './lotError';
import { liveLink, resolveEra, shareLink, versionPrefix } from './links';
import { STRUCTURE_RADIUS_M } from './radii';
import { fixed, joined, quote, sentence, verbatim } from './sentence';
import type { Sentence, Slot } from './sentence';

export type ReportInputs = {
  lotId: string;
  eraId: string | null;
  canon: {
    collections: readonly FeatureCollection[];
    registry: SourceRegistry;
    project: Project;
    sidecars: readonly TileSidecar[];
    lots: PresentLayer | undefined;
    addresses: PresentLayer | undefined;
    buildings: PresentLayer | undefined;
  };
  workspace: { collections: readonly FeatureCollection[]; sources: readonly Source[] } | null;
  dataVersion: string;
  /** The version prefix a share link carried, or null. */
  linkDataVersion: string | null;
  siteOrigin: string;
};

export type SourceEntry = { id: string; title: string; years: string; url: string; licenceNote: string; attributionLine: string };

export type Report = {
  kind: 'report';
  screensLine: Sentence;
  title: Sentence;
  place: { lotId: string; addresses: string[]; sentences: Sentence[] };
  recordsChanged: Sentence | null;
  coreSample: Band[];
  groups: [Group, Group, Group];
  workspace: { line: Sentence; groups: [Group, Group, Group]; sources: SourceEntry[] } | null;
  cannotTell: Sentence[];
  cannotTellLink: { text: string; url: string } | null;
  beforeYouDig: Sentence[];
  beforeYouDigLink: { text: string; url: string };
  sources: SourceEntry[];
  dataVersion: string;
  links: { live: string; share: string; eraId: string | null };
};

export type ReportModel =
  | { kind: 'not_reconstructed'; text: typeof copy.NOT_RECONSTRUCTED }
  | { kind: 'failed'; text: typeof copy.COULD_NOT_PRODUCE; place: string | null; reason: string }
  | Report;

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const NOT_RECONSTRUCTED: ReportModel = { kind: 'not_reconstructed', text: copy.NOT_RECONSTRUCTED };

export const PRESENT_SOURCES = {
  lots: 'present_toronto_property_boundaries_2026',
  addresses: 'present_toronto_address_points_2026',
  buildings: 'present_toronto_building_outlines_2026',
} as const;

function polygonal(geometry: { type: string; coordinates: unknown }): PolygonalGeometry | null {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon' ? (geometry as PolygonalGeometry) : null;
}

/** Whether the lot meets the mapped area of any plate in `collections` with positive area. */
export function lotInCoverage(lot: PolygonalGeometry, collections: readonly FeatureCollection[]): boolean {
  const offset = offsetOf(lot);
  const area = unionAll(collections.flatMap((c) => (c.mapped_area ? [toJts(c.mapped_area.geometry, offset)] : [])));
  if (area === null) return false;
  return toJts(lot, offset).intersection(area).getArea() > 0;
}

/** Address points inside the lot, as printable text, sorted. */
function addressesIn(lot: PolygonalGeometry, layer: PresentLayer | undefined): string[] {
  if (!layer) return [];
  const offset = offsetOf(lot);
  const lotGeometry = toJts(lot, offset);
  const out: string[] = [];
  for (const f of layer.features) {
    if (f.geometry.type !== 'Point') continue;
    const text = f.properties.ADDRESS_FULL;
    if (typeof text !== 'string' || text === '' || findBannedWords(text).length > 0) continue;
    if (lotGeometry.intersects(toJts(f.geometry, offset))) out.push(text);
  }
  return [...new Set(out)].sort(byString);
}

/** Merged numeric year ranges, written as `1911–1914, 1931–1935, 1947`. */
export function mergeYearRanges(ranges: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged: Array<[number, number]> = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

function yearsSentence(ranges: Array<[number, number]>): Sentence {
  if (ranges.length === 0) return fixed('No years of these records cover this lot.');
  const slots: Slot[] = ranges.map(([from, to]) =>
    from === to ? { text: String(from), numbers: [String(from)] } : { text: `${from}–${to}`, numbers: [String(from), String(to)] },
  );
  return sentence`They cover only the years of these records: ${joined(slots, ', ')}. They say nothing about this place in other years.`;
}

function sourceEntry(source: Source): SourceEntry {
  return {
    id: source.id,
    title: source.title,
    years: sourceYearsText(source),
    url: source.url,
    licenceNote: source.licence_note,
    attributionLine: source.attribution_line,
  };
}

function entriesFor(ids: Iterable<string>, index: ReadonlyMap<string, Source>): SourceEntry[] {
  return [...new Set(ids)]
    .sort(byString)
    .flatMap((sourceId) => {
      const source = index.get(sourceId);
      return source && source.attribution_status === 'confirmed' ? [sourceEntry(source)] : [];
    });
}

function groupSourceIds(groups: readonly Group[]): string[] {
  return groups.flatMap((g) => g.findings.flatMap((f) => f.finding.sourceIds));
}

/** Every sentence in a model, for the final check. */
export function allSentences(report: Report): Sentence[] {
  const fromGroups = (groups: readonly Group[]) => groups.flatMap((g) => [...g.findings.flatMap((f) => f.sentences), ...(g.nextStep ?? [])]);
  return [
    report.screensLine,
    report.title,
    ...report.place.sentences,
    ...(report.recordsChanged ? [report.recordsChanged] : []),
    ...report.coreSample.flatMap((b) => b.sentences),
    ...fromGroups(report.groups),
    ...(report.workspace ? [report.workspace.line, ...fromGroups(report.workspace.groups)] : []),
    ...report.cannotTell,
    ...report.beforeYouDig,
  ];
}

/**
 * A plate's evidence file may state no `mapped_area`. The plate's tile sidecar states the same fact
 * (its map area, in EPSG:26917 through the chosen transform), so a file without one takes it from
 * the sidecar. A file that states its own keeps it.
 */
export function withMappedAreas(collections: readonly FeatureCollection[], sidecars: readonly TileSidecar[]): FeatureCollection[] {
  return collections.map((c) => {
    if (c.mapped_area) return c;
    const sidecar = sidecars.find((t) => t.source === c.origin_source && t.map_area !== undefined);
    return sidecar?.map_area ? { ...c, mapped_area: { geometry: sidecar.map_area, method: 'map_area' as const } } : c;
  });
}

export function buildReport(inputs: ReportInputs): ReportModel {
  const lotFeature = inputs.canon.lots?.features.find((f) => f.id === inputs.lotId);
  if (!lotFeature) return NOT_RECONSTRUCTED;
  const lot = polygonal(lotFeature.geometry);
  if (!lot) return NOT_RECONSTRUCTED;

  try {
    const canonCollections = withMappedAreas(inputs.canon.collections, inputs.canon.sidecars);
    const workspaceCollections = inputs.workspace?.collections ?? [];
    if (!lotInCoverage(lot, [...canonCollections, ...workspaceCollections])) return NOT_RECONSTRUCTED;

    const sources = indexSources(inputs.canon.registry);
    const plateSources = inputs.canon.registry.sources.filter(isPlateSource).sort((a, b) => byString(a.id, b.id));
    const eras: readonly Era[] = inputs.canon.project.eras;
    const eraId = resolveEra(eras, inputs.eraId);

    // ---- canon parts: nothing below reads the workspace ----
    const groups = buildGroups({
      lot,
      lotErrorM: LOT_POSITION_ERROR_M,
      sources,
      collections: canonCollections,
      coverageCollections: canonCollections,
      plateSources,
      withEmptyFindings: true,
    });
    const coreSample = buildCoreSample(
      {
        lotId: inputs.lotId,
        lot,
        lotErrorM: LOT_POSITION_ERROR_M,
        eras,
        sources,
        collections: canonCollections,
        sidecars: inputs.canon.sidecars,
        buildings: inputs.canon.buildings,
        lots: inputs.canon.lots,
      },
      plateSources,
    );

    const addresses = addressesIn(lot, inputs.canon.addresses);
    const place: Report['place'] = {
      lotId: inputs.lotId,
      addresses,
      sentences: [
        sentence`Lot ${verbatim(inputs.lotId)}.`,
        ...addresses.map((a) => sentence`Address: ${quote(a)}.`),
      ],
    };

    const byOrigin = new Map(canonCollections.map((c) => [c.origin_source, c]));
    const covering: Array<[number, number]> = [];
    for (const s of plateSources) {
      const c = lotCoverage(lot, byOrigin.get(s.id), STRUCTURE_RADIUS_M);
      if ((c === 'reviewed' || c === 'mapped') && s.year_from !== null) covering.push([s.year_from, s.year_to]);
    }
    for (const s of inputs.canon.registry.sources) {
      if (s.type === 'aerial_photograph' && s.attribution_status === 'confirmed' && s.year_from !== null && inputs.canon.sidecars.some((t) => t.source === s.id && aerialCoversLot(lot, t))) {
        covering.push([s.year_from, s.year_to]);
      }
    }
    const cannotTell: Sentence[] = [fixed(copy.CANNOT_CONDITION), yearsSentence(mergeYearRanges(covering)), fixed(copy.CANNOT_UTILITIES), fixed(copy.BEFORE_COLONIAL)];
    const cannotTellLink = copy.CITY_LAND_ACKNOWLEDGEMENT_URL ? { text: copy.LAND_ACKNOWLEDGEMENT_LINK, url: copy.CITY_LAND_ACKNOWLEDGEMENT_URL } : null;

    const citedIds = new Set<string>([PRESENT_SOURCES.lots, PRESENT_SOURCES.buildings, ...(addresses.length > 0 ? [PRESENT_SOURCES.addresses] : [])]);
    for (const b of coreSample) for (const s of b.sourceIds) citedIds.add(s);
    for (const s of groupSourceIds(groups)) citedIds.add(s);
    const sourceEntries = entriesFor(citedIds, sources);

    const recordsChanged = inputs.linkDataVersion !== null && inputs.linkDataVersion !== versionPrefix(inputs.dataVersion) ? fixed(copy.RECORDS_CHANGED) : null;

    // ---- the workspace section, last ----
    let workspace: Report['workspace'] = null;
    if (inputs.workspace && inputs.workspace.collections.length > 0) {
      const withWorkspace = indexSources({ ...inputs.canon.registry, sources: [...inputs.canon.registry.sources, ...inputs.workspace.sources.filter((s) => !sources.has(s.id))] });
      const wsGroups = buildGroups({
        lot,
        lotErrorM: LOT_POSITION_ERROR_M,
        sources: withWorkspace,
        collections: inputs.workspace.collections,
        coverageCollections: inputs.workspace.collections,
        plateSources: [],
        withEmptyFindings: false,
      });
      if (wsGroups.some((g) => g.findings.length > 0)) {
        workspace = { line: fixed(copy.WORKSPACE_LINE), groups: wsGroups, sources: entriesFor(groupSourceIds(wsGroups), withWorkspace) };
      }
    }

    const report: Report = {
      kind: 'report',
      screensLine: fixed(copy.SCREENS_LINE),
      title: fixed(copy.TITLE),
      place,
      recordsChanged,
      coreSample,
      groups,
      workspace,
      cannotTell,
      cannotTellLink,
      beforeYouDig: [fixed(copy.DIG_NOT_LOCATES), fixed(copy.DIG_REQUEST)],
      beforeYouDigLink: { text: copy.DIG_LINK_TEXT, url: copy.ONTARIO_DIG_AUTHORITY_URL },
      sources: sourceEntries,
      dataVersion: inputs.dataVersion,
      links: {
        live: liveLink(inputs.siteOrigin, inputs.lotId, eraId),
        share: shareLink(inputs.siteOrigin, inputs.lotId, eraId, inputs.dataVersion),
        eraId,
      },
    };

    for (const s of allSentences(report)) {
      const result = checkSentence(s.text, s.pack);
      if (!result.ok) {
        console.error('Report sentence failed its check:', s.text, result.reasons);
        return { kind: 'failed', text: copy.COULD_NOT_PRODUCE, place: inputs.lotId, reason: `A sentence failed its check: ${result.reasons.join('; ')}` };
      }
    }
    return report;
  } catch (error) {
    const reason = error instanceof Error ? `${error instanceof HonestyError ? 'Honesty check: ' : ''}${error.message}` : String(error);
    console.error('The report could not be produced:', reason);
    return { kind: 'failed', text: copy.COULD_NOT_PRODUCE, place: inputs.lotId, reason };
  }
}
