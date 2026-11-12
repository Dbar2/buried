import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseSourceRegistry } from '../evidence';
import { REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { sortedSources, yearsText } from './SourcesPage';

describe('yearsText', () => {
  it('writes a single year, a range, and a dataset with no start year', () => {
    expect(yearsText({ year_from: 1935, year_to: 1935 })).toBe('1935');
    expect(yearsText({ year_from: 1911, year_to: 1914 })).toBe('1911 to 1914');
    expect(yearsText({ year_from: null, year_to: 2026 })).toBe('up to 2026');
  });
});

describe('sortedSources (requirement 21.3)', () => {
  it('lists every registered source in the real registry, sorted by id, each with the fields the page shows', () => {
    const text = readFileSync(join(REPOSITORY_DATA, 'sources.json'), 'utf8');
    const registry = parseSourceRegistry(text, 'data/sources.json');
    const sorted = sortedSources(registry.sources);
    expect(sorted).toHaveLength(registry.sources.length);
    expect(sorted.map((s) => s.id)).toEqual([...sorted.map((s) => s.id)].sort());
    for (const source of sorted) {
      expect(source.id).not.toBe('');
      expect(source.title).not.toBe('');
      expect(source.url).not.toBe('');
      expect(source.licence_note).not.toBe('');
      expect(source.attribution_line).not.toBe('');
    }
  });
});
