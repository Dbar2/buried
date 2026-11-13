/**
 * The Report on the committed data: the one building in `data/evidence/fip_v3_1911_229.geojson` and
 * the lot that contains it. This checks the real files load and build, and that the honest result
 * is what comes out: what the records say about that lot, and "Nothing found in these records" with
 * every record listed where they say nothing. The example synthetic tests state no history.
 */
import { describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { buildReport, PRESENT_SOURCES } from './buildReport';
import type { Report } from './buildReport';
import { lotForPoint, searchAddresses } from './search';

async function world() {
  const data = await loadData(diskFetch(REPOSITORY_DATA));
  const evidence = data.evidence.find((c) => c.origin_source === 'fip_v3_1911_229')!;
  const building = evidence.features.find((f) => f.id === 'bld_fip_v3_1911_229_0001')!;
  const ring = (building.geometry.type === 'Polygon' ? building.geometry.coordinates[0] : building.geometry.type === 'MultiPolygon' ? building.geometry.coordinates[0]![0] : [])!;
  const centre: [number, number] = [ring.reduce((s, p) => s + p[0]!, 0) / ring.length, ring.reduce((s, p) => s + p[1]!, 0) / ring.length];
  const lots = data.presentLayers.get(PRESENT_SOURCES.lots);
  return { data, building, centre, lots, lotId: lotForPoint(lots, centre) };
}

function inputsFor(w: Awaited<ReturnType<typeof world>>, lotId: string) {
  return {
    lotId,
    eraId: null,
    canon: {
      collections: w.data.evidence,
      registry: w.data.registry,
      project: w.data.project,
      sidecars: w.data.tiles,
      lots: w.lots,
      addresses: w.data.presentLayers.get(PRESENT_SOURCES.addresses),
      buildings: w.data.presentLayers.get(PRESENT_SOURCES.buildings),
    },
    workspace: null,
    dataVersion: '0123456789abcdef'.repeat(4),
    linkDataVersion: null,
    siteOrigin: 'https://buried.example',
  };
}

describe('the Report on the committed data', () => {
  it('finds the lot that contains the committed building', async () => {
    const w = await world();
    expect(w.lotId).not.toBeNull();
  });

  it('reports the committed building on its lot, with its source, and lists every record where the records say nothing', async () => {
    const w = await world();
    const model = buildReport(inputsFor(w, w.lotId!));
    expect(model.kind).toBe('report');
    const r = model as Report;
    const structures = r.groups[2].findings.filter((f) => f.finding.status === 'documented' || f.finding.status === 'estimated');
    expect(structures.length).toBeGreaterThan(0);
    const ours = structures.find((f) => f.featureIds.includes('bld_fip_v3_1911_229_0001'));
    expect(ours, 'a finding for bld_fip_v3_1911_229_0001').toBeDefined();
    expect(ours!.finding.sourceIds).toContain('fip_v3_1911_229');
    // Every group has at least one finding, and any "nothing" finding lists both showcase plates.
    for (const g of r.groups) {
      expect(g.findings.length).toBeGreaterThan(0);
      for (const f of g.findings) {
        if (f.finding.status === 'nothing_found' || f.finding.status === 'not_covered') {
          const ids = f.finding.checked.map((c) => c.sourceId);
          for (const plate of w.data.registry.sources.filter((s) => s.type === 'fire_insurance_plan' && s.attribution_status === 'confirmed')) expect(ids).toContain(plate.id);
        }
      }
    }
    expect(r.coreSample.map((b) => b.eraId)).toEqual(['today', '1947', '1935', '1911']);
    expect(r.sources.map((s) => s.id)).toContain('present_toronto_property_boundaries_2026');
  });

  it('says "Not reconstructed yet." for a lot id the layer does not have', async () => {
    const w = await world();
    expect(buildReport(inputsFor(w, 'no_such_lot')).kind).toBe('not_reconstructed');
  });

  it('finds addresses in the clipped layer and the lot an address point lies in', async () => {
    const w = await world();
    const layer = w.data.presentLayers.get(PRESENT_SOURCES.addresses);
    const hits = searchAddresses(layer, 'eastern');
    expect(hits.length).toBeGreaterThan(0);
    expect(searchAddresses(layer, 'x')).toEqual([]);
    expect(searchAddresses(undefined, 'eastern')).toEqual([]);
    const lotIds = hits.map((h) => lotForPoint(w.lots, h.point));
    expect(lotIds.some((id) => id !== null)).toBe(true);
  });
});
