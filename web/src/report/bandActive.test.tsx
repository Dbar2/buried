/**
 * Session 029: the core sample marks the band whose era the scene is showing, with a text mark and
 * `aria-current`, and exactly one band at a time.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { buildReport, PRESENT_SOURCES } from './buildReport';
import { ReportView } from './ReportView';
import { lotForPoint } from './search';

describe('the active band', () => {
  it('marks only the band of the era on screen, in words as well as in the markup', async () => {
    const data = await loadData(diskFetch(REPOSITORY_DATA));
    const building = data.evidence.flatMap((c) => c.features).find((f) => f.id === 'bld_fip_v3_1911_229_0001')!;
    const ring = (building.geometry.type === 'Polygon' ? building.geometry.coordinates[0] : building.geometry.type === 'MultiPolygon' ? building.geometry.coordinates[0]![0] : [])!;
    const centre: [number, number] = [ring.reduce((s, p) => s + p[0]!, 0) / ring.length, ring.reduce((s, p) => s + p[1]!, 0) / ring.length];
    const lots = data.presentLayers.get(PRESENT_SOURCES.lots);
    const model = buildReport({
      lotId: lotForPoint(lots, centre)!,
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
    if (model.kind !== 'report') return;

    const none = renderToStaticMarkup(<ReportView model={model} onBandSelect={() => {}} />);
    expect(none).not.toContain('aria-current');
    expect(none).not.toContain('Showing');

    for (const band of model.coreSample) {
      const html = renderToStaticMarkup(<ReportView model={model} onBandSelect={() => {}} activeEraId={band.eraId} />);
      expect((html.match(/aria-current="true"/g) ?? []).length, band.eraId).toBe(1);
      expect((html.match(/>Showing</g) ?? []).length, band.eraId).toBe(1);
      expect(html, band.eraId).toContain(`data-testid="band-now-${band.eraId}"`);
      expect(html).toMatch(new RegExp(`<li class="band band--active" data-era="${band.eraId}" data-active="true" aria-current="true"`));
    }
  });
});
