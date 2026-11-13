/**
 * Session 027: the page never claims a person checked or reviewed something that the record does not
 * say in a structured way. On the committed evidence, every review claim in the rendered Report must
 * be a "Confirmed by: <confirmed_by>, <date>." line that repeats a `provenance` of a published feature,
 * and the old derived phrases must not appear.
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
  it('prints "Confirmed by" from the record and no derived review phrase', async () => {
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
    expect(page).not.toMatch(/\b(reviewed|verified|checked|confirmed) by\b(?!:)/i);

    const recorded = new Set(features.map((f) => `${f.properties.provenance.confirmed_by}, ${f.properties.provenance.confirmed_at.slice(0, 10)}`));
    const claims = [...page.matchAll(/Confirmed by: (.+?, \d{4}-\d{2}-\d{2})\./g)].map((m) => m[1]!);
    expect(claims.length).toBeGreaterThan(0);
    for (const claim of claims) expect(recorded.has(claim), claim).toBe(true);

    // The record behind the lot says "unreviewed"; the page repeats those words and nothing stronger.
    expect(building.properties.provenance.confirmed_by).toBe('Buried maintainers (gate draft, unreviewed)');
    expect(page).toContain('Confirmed by: Buried maintainers (gate draft, unreviewed), 2026-11-12.');
  });
});
