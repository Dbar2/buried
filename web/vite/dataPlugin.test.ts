import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALLOWED_DIRS, copyAllowedData, listDataIndex, resolveAllowedPath } from './dataPlugin';

let dataDir: string;
let outDir: string;

beforeAll(() => {
  const root = mkdtempSync(join(tmpdir(), 'buried-data-plugin-'));
  dataDir = join(root, 'data');
  outDir = join(root, 'dist-data');
  for (const dir of ['evidence', 'present', 'tiles', 'control', 'raw', 'work', 'alignment', 'schema']) {
    mkdirSync(join(dataDir, dir), { recursive: true });
  }
  writeFileSync(join(dataDir, 'project.json'), '{}');
  writeFileSync(join(dataDir, 'sources.json'), '{}');
  writeFileSync(join(dataDir, 'secret.json'), '{}');
  writeFileSync(join(dataDir, 'evidence', 'a.geojson'), '{}');
  writeFileSync(join(dataDir, 'evidence', 'notes.txt'), 'x');
  writeFileSync(join(dataDir, 'present', 'p.geojson'), '{}');
  writeFileSync(join(dataDir, 'tiles', 't.json'), '{}');
  writeFileSync(join(dataDir, 'tiles', 't.jpg'), 'jpg');
  writeFileSync(join(dataDir, 'control', 'c.json'), '{}');
  writeFileSync(join(dataDir, 'raw', 'big.json'), '{}');
  writeFileSync(join(dataDir, 'work', 'tmp.json'), '{}');
  writeFileSync(join(dataDir, 'alignment', 'a.json'), '{}');
  writeFileSync(join(dataDir, 'schema', 's.json'), '{}');
});

afterAll(() => {
  rmSync(join(dataDir, '..'), { recursive: true, force: true });
});

describe('resolveAllowedPath', () => {
  it('accepts the allowed root files and the files directly inside the allowed folders', () => {
    for (const ok of [
      'project.json',
      'sources.json',
      'evidence/a.geojson',
      'present/p.geojson',
      'tiles/t.json',
      'tiles/t.jpg',
      'control/c.json',
    ]) {
      expect(resolveAllowedPath(dataDir, ok), ok).toBe(resolve(dataDir, ...ok.split('/')));
    }
  });

  it('refuses raw/, work/ and every folder that is not listed', () => {
    for (const bad of ['raw/big.json', 'work/tmp.json', 'alignment/a.json', 'schema/s.json', 'secret.json']) {
      expect(resolveAllowedPath(dataDir, bad), bad).toBeNull();
    }
  });

  it('refuses parent segments, encoded dots, backslashes and absolute paths', () => {
    for (const bad of [
      '../secret.json',
      'evidence/../secret.json',
      'evidence/../../secret.json',
      '%2e%2e/secret.json',
      'evidence/%2e%2e/secret.json',
      'evidence%2f..%2fsecret.json',
      'evidence\\a.geojson',
      '/etc/passwd',
      '/project.json',
      'evidence//a.geojson',
      './project.json',
      'evidence/./a.geojson',
      'project.json/',
      '',
      'evidence/a.geojson\0.png',
      '%',
    ]) {
      expect(resolveAllowedPath(dataDir, bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it('refuses nested folders, unlisted extensions and hidden files', () => {
    for (const bad of ['evidence/sub/a.geojson', 'evidence/notes.txt', 'evidence/.hidden.json', 'evidence/a', 'tiles/t.jpg.exe']) {
      expect(resolveAllowedPath(dataDir, bad), bad).toBeNull();
    }
  });

  it('only ever returns a path inside the data folder, under an allowed name', () => {
    const root = resolve(dataDir);
    const piece = fc.constantFrom('..', '.', 'evidence', 'present', 'raw', 'work', 'project.json', 'a.geojson', '%2e%2e', '%2F', '', 'x\\y', 'tiles', 't.jpg');
    const paths = fc.oneof(fc.string(), fc.array(piece, { maxLength: 5 }).map((parts) => parts.join('/')));
    fc.assert(
      fc.property(paths, (p) => {
        const result = resolveAllowedPath(dataDir, p);
        if (result === null) return true;
        if (!result.startsWith(root + sep)) return false;
        const relative = result.slice(root.length + 1).split(sep);
        if (relative.some((s) => s === '..' || s === '.' || s === '')) return false;
        if (relative.length === 1) return ['project.json', 'sources.json'].includes(relative[0] as string);
        return relative.length === 2 && (ALLOWED_DIRS as readonly string[]).includes(relative[0] as string);
      }),
      { numRuns: 500 },
    );
  });
});

describe('listDataIndex', () => {
  it('lists only allowed files, sorted, in the four folders', () => {
    expect(listDataIndex(dataDir)).toEqual({
      evidence: ['a.geojson'],
      present: ['p.geojson'],
      tiles: ['t.jpg', 't.json'],
      control: ['c.json'],
    });
  });

  it('gives empty lists for folders that do not exist', () => {
    expect(listDataIndex(join(dataDir, 'nowhere'))).toEqual({ evidence: [], present: [], tiles: [], control: [] });
  });
});

describe('copyAllowedData', () => {
  it('copies the allowed files and an index, and nothing else', () => {
    const copied = copyAllowedData(dataDir, outDir);
    expect(copied.sort()).toEqual(
      [
        'control/c.json',
        'evidence/a.geojson',
        'index.json',
        'present/p.geojson',
        'project.json',
        'sources.json',
        'tiles/t.jpg',
        'tiles/t.json',
      ].sort(),
    );
    for (const refused of ['raw', 'work', 'alignment', 'schema', 'secret.json', 'evidence/notes.txt']) {
      expect(existsSync(join(outDir, refused)), refused).toBe(false);
    }
    const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8')) as Record<string, string[]>;
    expect(index.tiles).toEqual(['t.jpg', 't.json']);
  });
});
