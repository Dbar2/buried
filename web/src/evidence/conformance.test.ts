/**
 * Conformance (requirement 9.3): every file under data/schema/fixtures/valid/<def>/ passes and
 * every file under invalid/<def>/ fails for that `$defs` entry. The Python suite runs the same
 * files, so the two validators give the same verdict.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { definitionNames, validate } from './schema';
import type { DefName } from './schema';

const DATA = fileURLToPath(new URL('../../../data', import.meta.url));
const FIXTURES = join(DATA, 'schema', 'fixtures');

function fixtures(kind: 'valid' | 'invalid'): { def: string; name: string; path: string }[] {
  const out: { def: string; name: string; path: string }[] = [];
  for (const def of readdirSync(join(FIXTURES, kind)).sort()) {
    for (const file of readdirSync(join(FIXTURES, kind, def)).sort()) {
      if (file.endsWith('.json')) out.push({ def, name: file, path: join(FIXTURES, kind, def, file) });
    }
  }
  return out;
}

const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

describe('schema conformance fixtures', () => {
  const names = new Set(definitionNames());

  it('names only definitions that exist', () => {
    for (const f of [...fixtures('valid'), ...fixtures('invalid')]) expect(names.has(f.def)).toBe(true);
  });

  it('has a valid fixture for every shape named in requirement 1.2 and 1.7', () => {
    const covered = new Set(fixtures('valid').map((f) => f.def));
    for (const def of [
      'featureCollection', 'feature', 'observation', 'provenance', 'sourceRegistry', 'source',
      'project', 'era', 'controlPoints', 'alignmentRecord', 'tileSidecar', 'link',
      'coverageArea', 'presentLayer', 'presentFeature',
    ]) {
      expect(covered.has(def), def).toBe(true);
    }
  });

  for (const f of fixtures('valid')) {
    it(`accepts valid/${f.def}/${f.name}`, () => {
      const result = validate(f.def as DefName, read(f.path));
      expect(result.errors).toEqual([]);
    });
  }

  for (const f of fixtures('invalid')) {
    it(`rejects invalid/${f.def}/${f.name}`, () => {
      expect(validate(f.def as DefName, read(f.path)).ok).toBe(false);
    });
  }
});

describe('the committed contract files', () => {
  const targets: [DefName, string][] = [
    ['sourceRegistry', 'sources.json'],
    ['project', 'project.json'],
  ];
  for (const [dir, def, ext] of [
    ['alignment', 'alignmentRecord', '.json'],
    ['control', 'controlPoints', '.json'],
    ['tiles', 'tileSidecar', '.json'],
    ['present', 'presentLayer', '.geojson'],
    ['evidence', 'featureCollection', '.geojson'],
  ] as const) {
    const folder = join(DATA, dir);
    if (!existsSync(folder)) continue;
    for (const file of readdirSync(folder).sort()) {
      if (file.endsWith(ext)) targets.push([def, `${dir}/${file}`]);
    }
  }

  for (const [def, rel] of targets) {
    it(`data/${rel} passes ${def}`, () => {
      const result = validate(def, read(join(DATA, rel)));
      expect(result.errors).toEqual([]);
    });
  }
});
