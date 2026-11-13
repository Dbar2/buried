/**
 * Session 034: no source id, plate number or raw timestamp inside a sentence on the place page, the
 * card, the list or the Report. Ids belong in the sources block, in `title` text and in mono footnotes.
 *
 * The test renders each view on the committed data and on the same data plus a workspace with one land-use
 * area (whose recorded reason names its source by id, as the Studio writes it), removes what may carry an id
 * (`title`, mono spans, the Report's sources block and everything after it), and fails on an id pattern,
 * a plate number or an ISO timestamp in the text that is left, or in an aria-label.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import type { LoadedData } from '../data/loadData';
import type { Feature, FeatureCollection } from '../evidence';
import { FeatureList } from '../explorer/FeatureListPanel';
import { featureRows } from '../explorer/featureList';
import { buildGateModel } from '../explorer/gateModel';
import type { GateModel } from '../explorer/gateModel';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { makeCollection, makeFeature, obs } from '../evidence/testing/fixtures';
import { buildReport, PRESENT_SOURCES } from '../report/buildReport';
import { ReportView } from '../report/ReportView';
import { lotForPoint } from '../report/search';
import { mergeForDisplay } from '../workspace/merge';
import { buildPlaceCard } from './placeCard';
import { PlaceCard } from './PlaceCardPanel';

const P1911 = 'fip_v3_1911_229';
const P1935 = 'fip_v3_1935_229';
const AREA_ID = `use_${P1911}_0001`;

const ID_PATTERN = /\b(?:fip|aerial|present|ws_upload|bld|use|wtr)_[a-z0-9_]*[a-z0-9]/i;
const PLATE_PATTERN = /\bplates?\s+\d{3}\b/i;
const TIMESTAMP_PATTERN = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const decode = (s: string): string => s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** The text a reader meets in a sentence: no tags, no `title`, no mono spans. */
function bodyText(markup: string): string {
  return decode(
    markup
      .replace(/<(span|dd|code)\b[^>]*class="[^"]*\bmono\b[^"]*"[^>]*>.*?<\/\1>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' '),
  );
}

function ariaLabels(markup: string): string[] {
  return [...markup.matchAll(/aria-label="([^"]*)"/g)].map((m) => decode(m[1]!));
}

function expectPlain(name: string, markup: string): void {
  const text = bodyText(markup);
  expect(text, `${name}: id in a sentence`).not.toMatch(ID_PATTERN);
  expect(text, `${name}: plate number in a sentence`).not.toMatch(PLATE_PATTERN);
  expect(text, `${name}: raw timestamp in a sentence`).not.toMatch(TIMESTAMP_PATTERN);
  for (const label of ariaLabels(markup)) {
    expect(label, `${name}: id in an aria-label`).not.toMatch(ID_PATTERN);
    expect(label, `${name}: plate number in an aria-label`).not.toMatch(PLATE_PATTERN);
  }
}

function workspaceArea(at: [number, number]): Feature {
  const area = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true)], { kind: 'land_use', seq: 1, at, size: [10, 8] });
  area.properties.attributes = { use: 'COAL YARD' };
  area.properties.confidence_reason = `Area and use traced by a person from ${P1911}`;
  area.properties.provenance.confirmed_by = 'Synthetic Reviewer';
  area.properties.provenance.attribute_reads = [{ attribute: 'use', crop_px: { x: 1, y: 1, width: 20, height: 10 }, read_by: 'person' }] as never;
  return area;
}

function centreOf(feature: Feature): [number, number] {
  const g = feature.geometry;
  const ring = (g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0]![0] : [])!;
  return [ring.reduce((s, p) => s + p[0]!, 0) / ring.length, ring.reduce((s, p) => s + p[1]!, 0) / ring.length];
}

type World = { name: string; model: GateModel; report: ReturnType<typeof buildReport> };

let worlds: World[];

function reportFor(data: LoadedData, lotId: string, workspace: readonly FeatureCollection[] | null) {
  return buildReport({
    lotId,
    eraId: null,
    canon: {
      collections: data.evidence,
      registry: data.registry,
      project: data.project,
      sidecars: data.tiles,
      lots: data.presentLayers.get(PRESENT_SOURCES.lots),
      addresses: data.presentLayers.get(PRESENT_SOURCES.addresses),
      buildings: data.presentLayers.get(PRESENT_SOURCES.buildings),
    },
    workspace: workspace ? { collections: workspace, sources: [] } : null,
    dataVersion: '0123456789abcdef'.repeat(4),
    linkDataVersion: null,
    siteOrigin: 'https://buried.example',
  });
}

beforeAll(async () => {
  const data = await loadData(diskFetch(REPOSITORY_DATA));
  const building = data.evidence.flatMap((c) => c.features).find((f) => f.id === 'bld_fip_v3_1911_229_0001')!;
  const centre = centreOf(building);
  const lotId = lotForPoint(data.presentLayers.get(PRESENT_SOURCES.lots), centre)!;

  const area = workspaceArea([centre[0] - 4, centre[1] - 4]);
  const workspace = [makeCollection(P1911, [area])];
  const merged = mergeForDisplay(data.evidence, workspace);

  worlds = [
    { name: 'committed data', model: buildGateModel(data), report: reportFor(data, lotId, null) },
    {
      name: 'committed data and a workspace with one area',
      model: buildGateModel({ ...data, evidence: merged.collections }, merged.workspaceFeatureIds),
      report: reportFor(data, lotId, workspace),
    },
  ];
});

describe('plain words on the rendered place page', () => {
  it('has the workspace area to check, and it is in an era list', () => {
    const model = worlds[1]!.model;
    const listed = [...model.lists.values()].flatMap((l) => l.features).some((f) => f.id === AREA_ID);
    expect(listed).toBe(true);
    expect(model.workspaceFeatureIds.has(AREA_ID)).toBe(true);
  });

  it('words the area as lettered on plans, never as built', () => {
    const model = worlds[1]!.model;
    const rows = featureRows(model.lists.get('1911'), model.features);
    const row = rows.find((r) => r.id === AREA_ID)!;
    expect(row.dates).toBe('Lettered on the 1911 plan. Still lettered on the 1931-35 plan');
    expect(row.dates).not.toMatch(/Built|Gone|Last seen/);
  });

  for (const index of [0, 1]) {
    it(`has no id, plate number or raw timestamp in the list, the card or the Report (${index === 0 ? 'committed data' : 'with a workspace area'})`, () => {
      const { name, model, report } = worlds[index]!;
      let cards = 0;
      for (const [eraId, list] of model.lists) {
        const rows = featureRows(list, model.features);
        const eraLabel = model.order.find((e) => e.id === eraId)!.label;
        expectPlain(
          `${name}, list for ${eraId}`,
          renderToStaticMarkup(<FeatureList rows={rows} eraLabel={eraLabel} open onToggle={() => {}} onChoose={() => {}} selectedId={null} />),
        );
        for (const entry of list.features) {
          const card = buildPlaceCard(entry, model.features.get(entry.id)!, model.sources, model.tiles, model.workspaceFeatureIds.has(entry.id) ? 'workspace' : 'canon');
          const html = renderToStaticMarkup(
            <PlaceCard card={card} confidence={entry.confidence} onClose={() => {}} canViewOriginal original={false} onToggleOriginal={() => {}} canShowEvidence evidenceShown={false} onToggleEvidence={() => {}} />,
          );
          expectPlain(`${name}, card for ${entry.id}`, html);
          cards += 1;
        }
      }
      expect(cards).toBeGreaterThan(0);

      expect(report.kind).toBe('report');
      const html = renderToStaticMarkup(<ReportView model={report} />);
      // The sources block and what follows it (links) are footnotes: ids are allowed there.
      const body = html.slice(0, html.indexOf('aria-labelledby="report-sources"'));
      expect(body.length).toBeGreaterThan(0);
      expectPlain(`${name}, Report`, body);
      if (index === 1) expect(bodyText(body)).toContain('COAL YARD');
    });
  }

  it('says "traced from the 1911 plan" on the area card, with no id and no claim about who traced it', () => {
    const model = worlds[1]!.model;
    const entry = model.lists.get('1911')!.features.find((f) => f.id === AREA_ID)!;
    const card = buildPlaceCard(entry, model.features.get(AREA_ID)!, model.sources, model.tiles, 'workspace');
    const confidence = card.rows.find((r) => r.key === 'confidence')!.value;
    expect(confidence).toBe('Documented. Area and use traced from the 1911 plan');
    expect(card.rows.find((r) => r.key === 'confirmed')!.value).toMatch(/^Confirmed by: Synthetic Reviewer, /);
    expect(`${confidence} ${card.cropLabel}`).not.toMatch(/by a person/i);
  });
});
