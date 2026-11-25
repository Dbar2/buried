/**
 * The lot check on the committed data (session 051). It states what the records say about three lots the
 * maintainer named, and that every trigger of a tag 4.2 or 4.3 comes with its lettering and its crop.
 */
import { describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import type { PolygonalGeometry } from '../evidence';
import { buildReport, PRESENT_SOURCES, withMappedAreas } from '../report/buildReport';
import { buildLotCheck } from './lotCheck';
import type { LotCheck } from './lotCheck';

async function world() {
  const data = await loadData(diskFetch(REPOSITORY_DATA));
  return { data, lots: data.presentLayers.get(PRESENT_SOURCES.lots)! };
}

type World = Awaited<ReturnType<typeof world>>;

function check(w: World, lotId: string): LotCheck {
  const { data } = w;
  const model = buildReport({
    lotId,
    eraId: null,
    canon: {
      collections: data.evidence,
      registry: data.registry,
      project: data.project,
      sidecars: data.tiles,
      lots: w.lots,
      addresses: data.presentLayers.get(PRESENT_SOURCES.addresses),
      buildings: data.presentLayers.get(PRESENT_SOURCES.buildings),
    },
    workspace: null,
    dataVersion: '0123456789abcdef'.repeat(4),
    linkDataVersion: null,
    siteOrigin: 'https://buried.example',
  });
  const lot = w.lots.features.find((f) => f.id === lotId)?.geometry as PolygonalGeometry;
  return buildLotCheck(model, { lot, collections: withMappedAreas(data.evidence, data.tiles), tiles: data.tiles, sources: data.sources, siteOrigin: 'https://buried.example' });
}

describe('the lot check on the committed data', () => {
  it('2A Percy St: a coal and wood yard on both plans, with the lettering and a crop for each', async () => {
    const w = await world();
    const c = check(w, '5451729');
    expect(c.kind).toBe('check');
    if (c.kind !== 'check') return;
    expect(c.verdict.tag).toBe('past_industrial');
    expect(c.verdict.sentences[0]?.text).toBe('The 1911 and 1931-35 plans letter this lot “Coal & Wood Yard”.');
    expect(c.verdict.triggers.length).toBeGreaterThanOrEqual(2);
    for (const t of c.verdict.triggers) {
      expect(t.lettering).not.toBeNull();
      expect(t.cropRef, `crop for ${t.featureId}`).not.toBeNull();
    }
    expect(c.compare.planSourceIds).toEqual(['fip_v3_1911_229', 'fip_v3_1935_229']);
    expect(c.title.text).toContain('2A');
  });

  it('524 King St E: a machine shop', async () => {
    const c = check(await world(), '5448428');
    expect(c.kind).toBe('check');
    if (c.kind !== 'check') return;
    expect(c.verdict.tag).toBe('past_industrial');
    expect(c.verdict.triggers.map((t) => t.matched)).toContain('machine shop');
    for (const t of c.verdict.triggers) expect(t.cropRef, t.featureId).not.toBeNull();
  });

  it('535 Queen St E: an overall factory', async () => {
    const c = check(await world(), '5447060');
    expect(c.kind).toBe('check');
    if (c.kind !== 'check') return;
    expect(c.verdict.tag).toBe('past_industrial');
    expect(c.verdict.triggers.map((t) => t.matched)).toContain('factory');
  });

  it('every lot in the coverage area gets a check, never a failure, and a tag 4.2 or 4.3 always has a crop', async () => {
    const w = await world();
    const counts: Record<string, number> = {};
    for (const lot of w.lots.features) {
      const c = check(w, lot.id);
      if (c.kind === 'failed') throw new Error(`${lot.id}: ${c.reason}`);
      if (c.kind !== 'check') continue;
      counts[c.verdict.tag] = (counts[c.verdict.tag] ?? 0) + 1;
      if (c.verdict.tag === 'past_industrial' || c.verdict.tag === 'industrial_next') {
        expect(c.verdict.triggers.length).toBeGreaterThan(0);
        for (const t of c.verdict.triggers) expect(t.cropRef, `${lot.id} ${t.featureId}`).not.toBeNull();
      }
    }
    console.info('lot check tags on the committed data', JSON.stringify(counts));
    expect(counts['past_industrial']).toBeGreaterThan(5);
  });
});
