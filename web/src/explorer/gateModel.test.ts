import { describe, expect, it } from 'vitest';
import { BRIDGE_VERSION, checkMessage } from '../bridge/bridge';
import { loadData } from '../data/loadData';
import { buildGateModel } from './gateModel';
import type { GateModel } from './gateModel';
import { buildLoadEra, buildMarkers, buildSceneInit, buildSetDepth } from './gateScene';
import { diskFetch } from './testing/diskFetch';

async function model(): Promise<GateModel> {
  return buildGateModel(await loadData(diskFetch()));
}

describe('buildGateModel on the synthetic data', () => {
  it('orders the eras with Today first and picks the two gate eras', async () => {
    const m = await model();
    expect(m.order.map((e) => `${e.id}:${e.index}`)).toEqual(['today:0', '1947:1', '1935:2', '1911:3']);
    expect(m.gateEras.map((e) => e.id)).toEqual(['1935', '1911']);
  });

  it('lists only the features whose evidence window holds the era', async () => {
    const m = await model();
    expect(m.lists.get('1911')?.features.map((f) => f.id)).toEqual([
      'bld_fip_v3_1911_229_0001',
      'bld_fip_v3_1911_229_0002',
      'wtr_fip_v3_1911_229_0001',
    ]);
    // The synthetic buildings were seen on the 1911 plate only: not drawn in 1935.
    expect(m.lists.get('1935')?.features).toEqual([]);
  });

  it('drapes the tiles that were loaded and whose source covers the era', async () => {
    const m = await model();
    expect(m.drapes.get('1911')?.map((d) => d.sourceId)).toEqual(['fip_v3_1911_229']);
    expect(m.drapes.get('1935')).toEqual([]); // its image is not served in the fixture
  });

  it('refuses a project without the gate eras', async () => {
    const data = await loadData(diskFetch());
    data.project.eras = [data.project.eras[0] as (typeof data.project.eras)[number]];
    expect(() => buildGateModel(data)).toThrow(/gate needs/);
  });
});

describe('the gate messages', () => {
  it('scene/init carries the project origin and bounds, era ids and indexes, and no year', async () => {
    const m = await model();
    const message = buildSceneInit(m.project, m.order, { reducedMotion: false, debug: true });
    expect(checkMessage(message).ok).toBe(true);
    expect(message.payload.bridgeVersion).toBe(BRIDGE_VERSION);
    expect(message.payload.origin).toEqual({ easting: 632500, northing: 4835000 });
    expect(message.payload.bounds).toEqual({ minE: 631900, minN: 4834400, maxE: 633200, maxN: 4835600 });
    expect(message.payload.eras).toEqual([
      { id: 'today', index: 0 },
      { id: '1947', index: 1 },
      { id: '1935', index: 2 },
      { id: '1911', index: 3 },
    ]);
    expect(message.payload.debug).toBe(true);
  });

  it('the origin sent is the one in the project file, not a constant (requirement 3.3)', async () => {
    const m = await model();
    const moved = { ...m.project, origin: { easting: 640000, northing: 4800000 } };
    expect(buildSceneInit(moved, m.order, { reducedMotion: false, debug: false }).payload.origin).toEqual({
      easting: 640000,
      northing: 4800000,
    });
  });

  it('scene/loadEra carries the features of that era list and the era drapes, and passes the schema', async () => {
    const m = await model();
    const era = m.gateEras.find((e) => e.id === '1911') as NonNullable<(typeof m.gateEras)[number]>;
    const list = m.lists.get('1911') as NonNullable<ReturnType<typeof m.lists.get>>;
    const message = buildLoadEra(era, list, m.drapes.get('1911') ?? []);

    expect(checkMessage(message).ok).toBe(true);
    expect(message.payload.eraId).toBe('1911');
    // Property E5 in miniature: every feature sent is an entry of the Era list for that era.
    expect(message.payload.features.map((f) => f.id)).toEqual(list.features.map((f) => f.id));
    expect(message.payload.features.map((f) => f.heightM)).toEqual([7, 3.5, 9]);
    expect(message.payload.features.map((f) => f.confidence)).toEqual(['documented', 'estimated', 'estimated']);
    expect(message.payload.drapes.map((d) => d.url)).toEqual(['/data/tiles/fip_v3_1911_229.jpg']);
  });

  it('scene/loadEra for an era with nothing in it is empty, not invented', async () => {
    const m = await model();
    const era = m.gateEras.find((e) => e.id === '1935') as NonNullable<(typeof m.gateEras)[number]>;
    const message = buildLoadEra(era, m.lists.get('1935') as NonNullable<ReturnType<typeof m.lists.get>>, []);
    expect(message.payload.features).toEqual([]);
    expect(checkMessage(message).ok).toBe(true);
  });

  it('scene/setDepth and debug/markers pass the schema', () => {
    expect(checkMessage(buildSetDepth(3)).ok).toBe(true);
    expect(checkMessage(buildMarkers([{ id: 'cp_1', position: [632328.353, 4835068.6] }])).ok).toBe(true);
  });
});
