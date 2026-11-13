/**
 * Session 027: the page never claims a person checked or reviewed something that the record does not
 * say in a structured way. On the committed evidence, every review claim in the rendered Report must
 * be a "Status: reviewed by <by>, <on>" line that repeats a `provenance.review` of a published feature (or
 * "Status: draft, not yet reviewed"), `confirmed_by` is never printed, and the old derived phrases must not appear.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { buildReport, PRESENT_SOURCES } from './buildReport';
import { ReportView } from './ReportView';
import { lotForPoint } from './search';

const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

describe('review claims on the committed data', () => {
  it('prints the review status from the record and no derived review phrase', async () => {
    const data = await loadData(diskFetch(REPOSITORY_DATA));
    const features = data.evidence.flatMap((c) => c.features);
    const building = features.find((f) => f.id === 'bld_fip_v3_1911_229_0001')!;
    const ring = (building.geometry.type === 'Polygon' ? building.geometry.coordinates[0] : building.geometry.type === 'MultiPolygon' ? building.geometry.coordinates[0]![0] : [])!;
    const centre: [number, number] = [ring.reduce((s, p) => s + p[0]!, 0) / ring.length, ring.reduce((s, p) => s + p[1]!, 0) / ring.length];
    const lots = data.presentLayers.get(PRESENT_SOURCES.lots);
    const lotId = lotForPoint(lots, centre)!;
    const model = buildReport({
      lotId,
      eraId: null,
      canon: {
        collections: data.evidence,
        registry: data.registry,
        project: data.project,
        sidecars: data.tiles,
        lots,
        addresses: data.presentLayers.get(PRESENT_SOURCES.addresses),
        buildings: data.presentLayers.get(PRESENT_SOURCES.buildings),
      },
      workspace: null,
      dataVersion: '0123456789abcdef'.repeat(4),
      linkDataVersion: null,
      siteOrigin: 'https://buried.example',
    });
    expect(model.kind).toBe('report');

    const page = textOf(renderToStaticMarkup(<ReportView model={model} />));
    expect(page).not.toMatch(/checked by a person/i);
    expect(page).not.toMatch(/\bconfirmed\b/i);
    expect(page).not.toMatch(/\b(verified|checked) by\b/i);

    // The publishing record (`confirmed_by`) is never printed, as a status or at all.
    for (const f of features) expect(page).not.toContain(f.properties.provenance.confirmed_by);

    // A "reviewed by" line repeats the `review` of a published feature.
    const recorded = new Set(features.flatMap((f) => (f.properties.provenance.review.state === 'reviewed' ? [`${f.properties.provenance.review.by}, ${f.properties.provenance.review.on}`] : [])));
    for (const m of page.matchAll(/Status: reviewed by (.+?, \d{4}-\d{2}-\d{2})/g)) expect(recorded.has(m[1]!), m[1]).toBe(true);

    // The record behind the lot is a hand-traced draft; the page says so and nothing stronger.
    expect(building.properties.provenance.review.state).toBe('draft_hand');
    expect(page).toContain('Status: draft, not yet reviewed');
    expect(page).not.toMatch(/Status: reviewed by/);
  });
});
