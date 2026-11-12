import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { listDataIndex } from '../../vite/dataPlugin';
import { EvidenceLoadError } from '../evidence';
import { evidenceSourceProblem, loadData, parseIndex } from './loadData';
import type { FetchText } from './loadData';

const FIXTURE_DATA = fileURLToPath(new URL('../explorer/testing/fixtures/data', import.meta.url));

/** A fetch over the synthetic data tree, with the same allow-list and generated index as the dev server. */
function diskFetch(root = FIXTURE_DATA, overrides: Record<string, string> = {}): FetchText {
  return async (path) => {
    if (path in overrides) return overrides[path] as string;
    if (path === 'index.json') return JSON.stringify(listDataIndex(root));
    return readFileSync(join(root, ...path.split('/')), 'utf8');
  };
}

describe('loadData on the synthetic data tree', () => {
  it('loads the files that validate and say which they left out', async () => {
    const data = await loadData(diskFetch());

    expect(data.project.origin).toEqual({ easting: 632500, northing: 4835000 });
    expect(data.sources.size).toBe(4);
    expect(data.evidence.map((c) => c.origin_source)).toEqual(['fip_v3_1911_229']);
    expect(data.tiles.map((t) => t.source)).toEqual(['fip_v3_1911_229']);
    expect([...data.presentLayers.keys()]).toEqual(['present_toronto_intersections_2026']);
    expect(data.controls.size).toBe(0);

    expect(data.problems).toHaveLength(4);
    const text = data.problems.join('\n');
    expect(text).toContain('evidence/synthetic_bad_schema.geojson');
    expect(text).toContain('evidence/synthetic_unconfirmed.geojson');
    expect(text).toContain('whose rights are not confirmed');
    expect(text).toContain('evidence/synthetic_unknown_source.geojson');
    expect(text).toContain('which is not in the source registry');
    expect(text).toContain('tiles/fip_v3_1935_229.json');
    expect(text).toContain('fip_v3_1935_229.jpg is not served');
  });

  it('draws nothing from a file that failed: no feature of a left-out file is loaded', async () => {
    const data = await loadData(diskFetch());
    const ids = data.evidence.flatMap((c) => c.features.map((f) => f.id));
    expect(ids).toEqual([
      'bld_fip_v3_1911_229_0001',
      'bld_fip_v3_1911_229_0002',
      'wtr_fip_v3_1911_229_0001',
    ]);
  });

  it('throws when project.json does not validate', async () => {
    await expect(loadData(diskFetch(FIXTURE_DATA, { 'project.json': '{}' }))).rejects.toThrow(EvidenceLoadError);
  });

  it('throws when sources.json is not JSON', async () => {
    await expect(loadData(diskFetch(FIXTURE_DATA, { 'sources.json': 'oops' }))).rejects.toThrow(EvidenceLoadError);
  });

  it('reports a file that cannot be fetched and keeps going', async () => {
    const base = diskFetch();
    const flaky: FetchText = async (path) => {
      if (path === 'evidence/synthetic_ok.geojson') throw new Error('network down');
      return base(path);
    };
    const data = await loadData(flaky);
    expect(data.evidence).toEqual([]);
    expect(data.problems.join('\n')).toContain('network down');
  });
});

describe('parseIndex', () => {
  it('needs a list of names for each folder', () => {
    expect(parseIndex('{"evidence":[],"present":[],"tiles":[],"control":[]}').tiles).toEqual([]);
    expect(() => parseIndex('{"evidence":[]}')).toThrow(EvidenceLoadError);
    expect(() => parseIndex('{"evidence":[1],"present":[],"tiles":[],"control":[]}')).toThrow(EvidenceLoadError);
    expect(() => parseIndex('nope')).toThrow(EvidenceLoadError);
  });
});

describe('evidenceSourceProblem', () => {
  it('accepts the synthetic file', async () => {
    const data = await loadData(diskFetch());
    const [collection] = data.evidence;
    expect(collection).toBeDefined();
    expect(evidenceSourceProblem(collection as NonNullable<typeof collection>, data.sources)).toBeNull();
  });
});
