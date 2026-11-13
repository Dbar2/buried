import { describe, expect, it } from 'vitest';
import { checkMessage } from '../bridge/bridge';
import { loadData } from '../data/loadData';
import { featuresForEra } from '../evidence';
import { ERA_1911, P1911, P1935, makeCollection, makeFeature, obs, showcaseSources } from '../evidence/testing/fixtures';
import { buildAddFeatures, buildLoadEra, listForPlayer } from './gateScene';
import { AREA_SHEET_M } from './sceneFeatures';
import { diskFetch } from './testing/diskFetch';

async function list1911() {
  const data = await loadData(diskFetch());
  const era = data.project.eras.find((e) => e.id === '1911') as NonNullable<(typeof data.project.eras)[number]>;
  return featuresForEra(data.evidence, data.sources, era);
}

describe('holding features back for scene/addFeatures', () => {
  it('splits one Era list into a loadEra without them and an addFeatures with only them', async () => {
    const list = await list1911();
    const all = buildLoadEra({ id: '1911' }, list, []);
    const ids = all.payload.features.map((f) => f.id);
    expect(ids.length).toBeGreaterThan(0);

    const held = new Set([ids[0] as string]);
    const load = buildLoadEra({ id: '1911' }, list, [], held);
    const add = buildAddFeatures({ id: '1911' }, list, held);

    expect(load.payload.features.map((f) => f.id)).toEqual(ids.slice(1));
    expect(add?.payload.features.map((f) => f.id)).toEqual([ids[0]]);
    expect(checkMessage(load).ok).toBe(true);
    expect(add && checkMessage(add).ok).toBe(true);
  });

  it('sends the same scene feature either way (the add is a copy of the loadEra entry)', async () => {
    const list = await list1911();
    const all = buildLoadEra({ id: '1911' }, list, []);
    const first = all.payload.features[0];
    const add = buildAddFeatures({ id: '1911' }, list, new Set([first?.id as string]));
    expect(add?.payload.features[0]).toEqual(first);
  });

  it('sends nothing when no held-back id is in the list', async () => {
    expect(buildAddFeatures({ id: '1911' }, await list1911(), new Set(['bld_nothing_0001']))).toBeNull();
    expect(buildAddFeatures({ id: '1911' }, await list1911(), new Set())).toBeNull();
  });
});

describe('land-use areas in scene/loadEra (bridge 0.7.0)', () => {
  const sources = showcaseSources();
  const area = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true)], { kind: 'land_use', seq: 1 });
  const building = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true)], { kind: 'building', seq: 2 });
  const list = featuresForEra([makeCollection(P1911, [area, building])], sources, ERA_1911);

  it('sends the area with the era, flat, and the message passes the bridge', () => {
    const load = buildLoadEra({ id: '1911' }, list, []);
    const sent = load.payload.features.find((f) => f.id === area.id);
    expect(sent?.kind).toBe('land_use');
    expect(sent?.heightM).toBe(AREA_SHEET_M);
    expect(load.payload.features.map((f) => f.id)).toEqual([building.id, area.id]);
    expect(checkMessage(load).ok).toBe(true);
  });

  it('can hold an area back for scene/addFeatures like any other feature', () => {
    const held = new Set([area.id]);
    expect(buildLoadEra({ id: '1911' }, list, [], held).payload.features.map((f) => f.id)).toEqual([building.id]);
    expect(buildAddFeatures({ id: '1911' }, list, held)?.payload.features.map((f) => f.id)).toEqual([area.id]);
  });

  it('listForPlayer leaves the areas out when asked (?areas=0) and changes nothing else', () => {
    expect(listForPlayer(list, true)).toBe(list);
    const without = listForPlayer(list, false);
    expect(without.features.map((f) => f.id)).toEqual([building.id]);
    expect(without.eraId).toBe(list.eraId);
    expect(buildLoadEra({ id: '1911' }, without, []).payload.features.map((f) => f.id)).toEqual([building.id]);
  });
});
