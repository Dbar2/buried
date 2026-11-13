import { describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { buildReport, PRESENT_SOURCES } from './buildReport';
import { exampleAddresses } from './examples';

describe('example addresses on the committed data', () => {
  it('are three real addresses on different lots, each with a report', async () => {
    const data = await loadData(diskFetch(REPOSITORY_DATA));
    const addresses = data.presentLayers.get(PRESENT_SOURCES.addresses);
    const lots = data.presentLayers.get(PRESENT_SOURCES.lots);
    const examples = exampleAddresses(addresses, lots, data.evidence);
    expect(examples).toHaveLength(3);
    expect(new Set(examples.map((e) => e.lotId)).size).toBe(3);
    const known = new Set(addresses!.features.map((f) => f.properties.ADDRESS_FULL));
    for (const e of examples) {
      expect(known.has(e.address)).toBe(true);
      const model = buildReport({
        lotId: e.lotId,
        eraId: null,
        canon: {
          collections: data.evidence,
          registry: data.registry,
          project: data.project,
          sidecars: data.tiles,
          lots,
          addresses,
          buildings: data.presentLayers.get(PRESENT_SOURCES.buildings),
        },
        workspace: null,
        dataVersion: 'x'.repeat(40),
        linkDataVersion: null,
        siteOrigin: 'https://buried.example',
      });
      expect(model.kind, e.address).toBe('report');
    }
  });

  it('is deterministic and empty without data', async () => {
    const data = await loadData(diskFetch(REPOSITORY_DATA));
    const a = data.presentLayers.get(PRESENT_SOURCES.addresses);
    const l = data.presentLayers.get(PRESENT_SOURCES.lots);
    expect(exampleAddresses(a, l, data.evidence)).toEqual(exampleAddresses(a, l, data.evidence));
    expect(exampleAddresses(undefined, l, data.evidence)).toEqual([]);
    expect(exampleAddresses(a, l, [])).toEqual([]);
  });
});
