import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dataVersion, isVersionedPath } from './dataVersion';
import type { Sha256Hex } from './dataVersion';

const sha256: Sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
const FIXTURE = fileURLToPath(new URL('../../../data/schema/studio_api_fixtures/data_version', import.meta.url));

function walk(folder: string, prefix = ''): Array<[string, Uint8Array]> {
  const out: Array<[string, Uint8Array]> = [];
  for (const name of readdirSync(folder).sort()) {
    const full = join(folder, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, `${prefix}${name}/`));
    else out.push([`${prefix}${name}`, readFileSync(full)]);
  }
  return out;
}

describe('the data version rule', () => {
  it('gives the version the shared fixture tree expects (same value as the Python half)', () => {
    const files = walk(join(FIXTURE, 'tree')).filter(([path]) => isVersionedPath(path));
    const expected = readFileSync(join(FIXTURE, 'expected.txt'), 'utf8').trim();
    expect(dataVersion(files, sha256)).toBe(expected);
  });

  it('does not count work files, other folders or other suffixes', () => {
    expect(isVersionedPath('project.json')).toBe(true);
    expect(isVersionedPath('evidence/a.geojson')).toBe(true);
    expect(isVersionedPath('alignment/a.json')).toBe(true);
    expect(isVersionedPath('evidence/a.json')).toBe(false);
    expect(isVersionedPath('work/review/a.json')).toBe(false);
    expect(isVersionedPath('tiles/a.jpg')).toBe(false);
    expect(isVersionedPath('evidence/deep/a.geojson')).toBe(false);
  });

  it('does not depend on the order the files are given in', () => {
    const files = walk(join(FIXTURE, 'tree')).filter(([path]) => isVersionedPath(path));
    expect(dataVersion([...files].reverse(), sha256)).toBe(dataVersion(files, sha256));
  });
});
