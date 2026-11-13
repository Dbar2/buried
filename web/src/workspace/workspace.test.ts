import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import type { FeatureCollection } from '../evidence';
import type { PublishResponse } from '../studio/service/types.generated';
import { openWorkspace } from './db';
import { loadWorkspaceEvidence } from './load';
import { additionsText, storePublished, workspaceEvidencePath } from './publish';

const SOURCE = 'fip_v3_1911_229';
const NOW = '2026-11-13T01:00:00Z';

async function canon() {
  const data = await loadData(diskFetch(REPOSITORY_DATA));
  const collection = data.evidence.find((c) => c.origin_source === SOURCE) as FeatureCollection;
  return { data, collection };
}

/** What the Service would return: the canon file plus one new building on a new id. */
async function okResponse(newId = 'bld_fip_v3_1911_229_9001'): Promise<PublishResponse> {
  const { collection } = await canon();
  const template = JSON.parse(JSON.stringify(collection.features[0])) as FeatureCollection['features'][number];
  template.id = newId;
  const whole = { ...collection, features: [...collection.features, template] };
  return { ok: true, evidence_file_text: `${JSON.stringify(whole, null, 2)}\n`, counts: { accepted: 1, published_now: 1, already_published: 0, rejected: 0, undecided: 0, unconfirmed: 0 }, new_feature_ids: [newId] };
}

describe('the workspace database', () => {
  it('keeps files, settings and seen ids', async () => {
    const db = await openWorkspace(new IDBFactory());
    expect(db).not.toBeNull();
    if (!db) return;
    await db.putFile('evidence/a.geojson', 'one', NOW);
    await db.putFile('evidence/b.geojson', 'two', NOW);
    await db.putFile('work/x.json', 'three', NOW);
    expect(await db.listFiles('evidence/')).toEqual(['evidence/a.geojson', 'evidence/b.geojson']);
    expect((await db.getFile('evidence/a.geojson'))?.text).toBe('one');
    await db.deleteFile('evidence/a.geojson');
    expect(await db.getFile('evidence/a.geojson')).toBeUndefined();
    await db.putSetting('reviewer', 'Ada');
    expect(await db.getSetting('reviewer')).toBe('Ada');
    await db.markSeen(['bld_x_0001', 'bld_x_0002'], NOW);
    expect(await db.seenIds()).toEqual(new Set(['bld_x_0001', 'bld_x_0002']));
    db.close();
  });

  it('is null, not an error, when IndexedDB is unavailable', async () => {
    expect(await openWorkspace(null)).toBeNull();
  });
});

describe('storing a publish result', () => {
  it('stores only the new features, as a file that passes the Schema', async () => {
    const db = await openWorkspace(new IDBFactory());
    const response = await okResponse();
    const result = await storePublished(db, SOURCE, response, NOW);
    expect(result).toEqual({ stored: true, featureIds: ['bld_fip_v3_1911_229_9001'] });
    const stored = await db?.getFile(workspaceEvidencePath(SOURCE));
    const parsed = JSON.parse(stored?.text ?? '{}') as FeatureCollection;
    expect(parsed.features.map((f) => f.id)).toEqual(['bld_fip_v3_1911_229_9001']);
  });

  it('stores nothing when the Service refused', async () => {
    const db = await openWorkspace(new IDBFactory());
    const refused: PublishResponse = { ok: false, errors: [{ path: 'evidence/x', pointer: '/', reason: 'no' }] };
    expect((await storePublished(db, SOURCE, refused, NOW)).stored).toBe(false);
    expect(await db?.listFiles('')).toEqual([]);
  });

  it('stores nothing when the text itself fails the Schema (S1, web half)', async () => {
    const db = await openWorkspace(new IDBFactory());
    const response = await okResponse();
    if (!response.ok) throw new Error('fixture');
    const broken = JSON.parse(response.evidence_file_text) as { features: Array<{ id: string; properties: Record<string, unknown> }> };
    const added = broken.features.find((f) => f.id === 'bld_fip_v3_1911_229_9001');
    if (!added) throw new Error('fixture');
    delete added.properties.position_error_m;
    const bad: PublishResponse = { ...response, evidence_file_text: JSON.stringify(broken) };
    const result = await storePublished(db, SOURCE, bad, NOW);
    expect(result.stored).toBe(false);
    expect(await db?.listFiles('')).toEqual([]);
  });

  it('says so when there is no workspace to store into', async () => {
    const result = await storePublished(null, SOURCE, await okResponse(), NOW);
    expect(result.stored).toBe(false);
  });

  it('never writes canon: the canon collection is unchanged by building the additions', async () => {
    const { collection } = await canon();
    const before = JSON.stringify(collection);
    const response = await okResponse();
    if (!response.ok) throw new Error('fixture');
    additionsText(response.evidence_file_text, response.new_feature_ids, 'x');
    expect(JSON.stringify(collection)).toBe(before);
  });
});

describe('loading the workspace for display', () => {
  it('returns the stored additions', async () => {
    const { data } = await canon();
    const db = await openWorkspace(new IDBFactory());
    await storePublished(db, SOURCE, await okResponse(), NOW);
    const loaded = await loadWorkspaceEvidence(db, data.evidence, data.sources);
    expect(loaded.problems).toEqual([]);
    expect(loaded.collections.flatMap((c) => c.features.map((f) => f.id))).toEqual(['bld_fip_v3_1911_229_9001']);
  });

  it('leaves out a feature whose id is a canon id, and says so', async () => {
    const { data, collection } = await canon();
    const db = await openWorkspace(new IDBFactory());
    const clash = { ...collection, features: [collection.features[0]] };
    await db?.putFile('evidence/clash.geojson', JSON.stringify(clash), NOW);
    const loaded = await loadWorkspaceEvidence(db, data.evidence, data.sources);
    expect(loaded.collections).toEqual([]);
    expect(loaded.problems.join(' ')).toContain("conflicts with Buried's records");
  });

  it('leaves out a file that is not valid, and a file that cites an unknown source', async () => {
    const { data, collection } = await canon();
    const db = await openWorkspace(new IDBFactory());
    await db?.putFile('evidence/junk.geojson', '{"not":"evidence"}', NOW);
    await db?.putFile('evidence/stranger.geojson', JSON.stringify({ ...collection, origin_source: 'fip_v3_1911_999' }), NOW);
    const loaded = await loadWorkspaceEvidence(db, data.evidence, data.sources);
    expect(loaded.collections).toEqual([]);
    expect(loaded.problems).toHaveLength(2);
  });

  it('shows nothing, with no problem, when there is no workspace', async () => {
    const { data } = await canon();
    expect(await loadWorkspaceEvidence(null, data.evidence, data.sources)).toEqual({ collections: [], problems: [] });
  });
});
