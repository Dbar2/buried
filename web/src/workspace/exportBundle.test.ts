import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { findBannedWords, parseEvidenceFile } from '../evidence';
import type { FeatureCollection } from '../evidence';
import type { PublishResponse } from '../studio/service/types.generated';
import { openWorkspace } from './db';
import { buildExport, bundleFileName, importBundle } from './exportBundle';
import { loadWorkspaceEvidence } from './load';
import { storePublished, workspaceEvidencePath } from './publish';
import { readZip, writeZip } from './zip';

const SOURCE = 'fip_v3_1911_229';
const NOW = '2026-11-13T01:00:00Z';
const NEW_ID = 'bld_fip_v3_1911_229_9001';

async function canon() {
  const data = await loadData(diskFetch(REPOSITORY_DATA));
  const collection = data.evidence.find((c) => c.origin_source === SOURCE) as FeatureCollection;
  return { data, collection };
}

async function response(): Promise<PublishResponse> {
  const { collection } = await canon();
  const template = JSON.parse(JSON.stringify(collection.features[0])) as FeatureCollection['features'][number];
  template.id = NEW_ID;
  const whole = { ...collection, features: [...collection.features, template] };
  return {
    ok: true,
    evidence_file_text: `${JSON.stringify(whole, null, 2)}\n`,
    counts: { accepted: 1, published_now: 1, already_published: 0, rejected: 0, undecided: 0, unconfirmed: 0 },
    new_feature_ids: [NEW_ID],
  };
}

const decisionsText = `${JSON.stringify(
  {
    version: 2,
    source: SOURCE,
    decisions: [],
    reviewed_areas: [{ pixel_polygon: [[0, 0], [10, 0], [10, 10]], confirmed_by: 'Ada Reviewer', confirmed_at: NOW }],
  },
  null,
  2,
)}\n`;
const proposalText = `${JSON.stringify({ type: 'FeatureCollection', features: [] }, null, 2)}\n`;

async function published() {
  const db = await openWorkspace(new IDBFactory());
  if (!db) throw new Error('no workspace');
  const stored = await storePublished(db, SOURCE, await response(), NOW, { proposalFileText: proposalText, decisionsText });
  expect(stored.stored).toBe(true);
  return db;
}

describe('zip', () => {
  it('reads back what it wrote, including non-ASCII text', () => {
    const entries = [
      { path: 'a/b.txt', text: 'one' },
      { path: 'c.json', text: '{"x":"é — 5 m"}\n' },
      { path: 'empty.txt', text: '' },
    ];
    expect(readZip(writeZip(entries, new Date(NOW)))).toEqual(entries);
  });

  it('refuses a damaged archive', () => {
    const bytes = writeZip([{ path: 'a.txt', text: 'hello world' }], new Date(NOW));
    bytes[40] = bytes[40]! ^ 0xff; // inside the stored data
    expect(() => readZip(bytes)).toThrow(/damaged/);
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow(/not a zip/);
  });
});

describe('the export bundle', () => {
  it('holds the proposals, decisions and expected evidence verbatim, and a README naming plate and reviewer', async () => {
    const db = await published();
    const result = await buildExport(db, SOURCE, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fileName).toBe(`buried_export_${SOURCE}_2026-11-13.zip`);
    const files = new Map(readZip(result.bytes).map((e) => [e.path, e.text]));
    expect([...files.keys()].sort()).toEqual([
      'README.md',
      `data/work/proposals/${SOURCE}.geojson`,
      `data/work/review/${SOURCE}.json`,
      `expected/data/evidence/${SOURCE}.geojson`,
    ]);
    expect(files.get(`data/work/proposals/${SOURCE}.geojson`)).toBe(proposalText);
    expect(files.get(`data/work/review/${SOURCE}.json`)).toBe(decisionsText);
    expect(files.get(`expected/data/evidence/${SOURCE}.geojson`)).toBe((await response() as { evidence_file_text: string }).evidence_file_text);
    const readme = files.get('README.md') ?? '';
    expect(readme).toContain(`Plate: ${SOURCE}`);
    expect(readme).toContain('Reviewer: Ada Reviewer');
    expect(readme).toContain(`uv run buried publish ${SOURCE}`);
    expect(findBannedWords(readme)).toEqual([]);
  });

  it('exports an evidence file that passes the Evidence Library', async () => {
    const db = await published();
    const result = await buildExport(db, SOURCE, NOW);
    if (!result.ok) throw new Error(result.reason);
    const text = readZip(result.bytes).find((e) => e.path.startsWith('expected/'))?.text ?? '';
    expect(parseEvidenceFile(text, 'expected').features.some((f) => f.id === NEW_ID)).toBe(true);
  });

  it('round-trips: export, import into an empty workspace, same features', async () => {
    const { data } = await canon();
    const canonIds = new Set(data.evidence.flatMap((c) => c.features.map((f) => f.id)));
    const first = await published();
    const result = await buildExport(first, SOURCE, NOW);
    if (!result.ok) throw new Error(result.reason);

    const empty = await openWorkspace(new IDBFactory());
    expect(await empty?.listFiles('')).toEqual([]);
    const imported = await importBundle(empty, result.bytes, canonIds, NOW);
    expect(imported).toEqual({ ok: true, sourceId: SOURCE, featureIds: [NEW_ID] });

    for (const path of await first.listFiles('')) {
      expect((await empty?.getFile(path))?.text).toBe((await first.getFile(path))?.text);
    }
    const loaded = await loadWorkspaceEvidence(empty, data.evidence, data.sources);
    expect(loaded.problems).toEqual([]);
    expect(loaded.collections.flatMap((c) => c.features.map((f) => f.id))).toEqual([NEW_ID]);
    expect(workspaceEvidencePath(SOURCE)).toBe(`evidence/${SOURCE}.geojson`);

    // And exporting the imported workspace gives the same bundle.
    const again = await buildExport(empty, SOURCE, NOW);
    expect(again.ok && again.bytes).toEqual(result.bytes);
  });

  it('says so when nothing has been published', async () => {
    const db = await openWorkspace(new IDBFactory());
    const result = await buildExport(db, SOURCE, NOW);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('Publish to your workspace first') });
    expect((await buildExport(null, SOURCE, NOW)).ok).toBe(false);
  });

  it('refuses a bundle whose evidence fails the Schema, or that is not a bundle', async () => {
    const db = await openWorkspace(new IDBFactory());
    const bad = writeZip(
      [
        { path: `data/work/proposals/${SOURCE}.geojson`, text: proposalText },
        { path: `data/work/review/${SOURCE}.json`, text: decisionsText },
        { path: `expected/data/evidence/${SOURCE}.geojson`, text: '{"type":"FeatureCollection"}' },
      ],
      new Date(NOW),
    );
    const refused = await importBundle(db, bad, new Set(), NOW);
    expect(refused.ok).toBe(false);
    expect(await db?.listFiles('')).toEqual([]);
    expect((await importBundle(db, new Uint8Array([0, 1, 2]), new Set(), NOW)).ok).toBe(false);
    expect((await importBundle(db, writeZip([{ path: 'x.txt', text: 'x' }], new Date(NOW)), new Set(), NOW)).ok).toBe(false);
  });

  it('adds nothing when every feature is already canon', async () => {
    const { data } = await canon();
    const canonIds = new Set([...data.evidence.flatMap((c) => c.features.map((f) => f.id)), NEW_ID]);
    const result = await buildExport(await published(), SOURCE, NOW);
    if (!result.ok) throw new Error(result.reason);
    const imported = await importBundle(await openWorkspace(new IDBFactory()), result.bytes, canonIds, NOW);
    expect(imported.ok).toBe(false);
  });

  it('names the file with the date', () => {
    expect(bundleFileName('fip_v3_1935_232', '2026-11-13T23:59:00Z')).toBe('buried_export_fip_v3_1935_232_2026-11-13.zip');
  });
});
