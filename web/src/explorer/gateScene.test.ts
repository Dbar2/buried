import { describe, expect, it } from 'vitest';
import { checkMessage } from '../bridge/bridge';
import { loadData } from '../data/loadData';
import { featuresForEra } from '../evidence';
import { buildAddFeatures, buildLoadEra } from './gateScene';
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
