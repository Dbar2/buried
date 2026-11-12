import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { summariseDates } from './dates';
import { EvidenceLoadError, parseEvidenceFile, parseProject, parseSourceRegistry } from './load';
import { indexSources, yearRange } from './sources';
import { P1911, makeFeature, makeSource, obs, showcaseRegistry, showcaseSources } from './testing/fixtures';

const data = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../data/${rel}`, import.meta.url)), 'utf8');

describe('parse and validate on load (requirement 9.2)', () => {
  it('accepts the real source registry and project file', () => {
    expect(parseSourceRegistry(data('sources.json'), 'data/sources.json').sources.length).toBeGreaterThan(0);
    expect(parseProject(data('project.json'), 'data/project.json').origin).toEqual({
      easting: 632500,
      northing: 4835000,
    });
  });

  it('accepts a valid evidence file', () => {
    const text = data('schema/fixtures/valid/featureCollection/full.json');
    const collection = parseEvidenceFile(text, 'full.json');
    expect(collection.features.length).toBe(3);
  });

  it('rejects text that is not JSON, naming the file', () => {
    expect(() => parseEvidenceFile('{not json', 'broken.geojson')).toThrowError(EvidenceLoadError);
    try {
      parseEvidenceFile('{not json', 'broken.geojson');
    } catch (e) {
      expect((e as EvidenceLoadError).fileName).toBe('broken.geojson');
      expect((e as Error).message).toContain('is not valid JSON');
    }
  });

  it('rejects an invalid file with the Ajv errors attached', () => {
    const text = data('schema/fixtures/invalid/featureCollection/wrong_crs.json');
    try {
      parseEvidenceFile(text, 'wrong_crs.geojson');
      expect.unreachable();
    } catch (e) {
      const err = e as EvidenceLoadError;
      expect(err).toBeInstanceOf(EvidenceLoadError);
      expect(err.def).toBe('featureCollection');
      expect(err.errors.length).toBeGreaterThan(0);
      expect(err.errors.some((x) => x.instancePath === '/crs')).toBe(true);
      expect(err.message).toContain('/crs');
    }
  });

  it('rejects a lon/lat position and a missing position error', () => {
    const lonlat = data('schema/fixtures/invalid/feature/lonlat_position.json');
    const feature = JSON.parse(lonlat);
    const collection = {
      type: 'FeatureCollection', schema_version: '1.0.0', crs: 'EPSG:26917',
      origin_source: P1911, features: [feature],
    };
    expect(() => parseEvidenceFile(JSON.stringify(collection), 'x.geojson')).toThrowError(
      EvidenceLoadError,
    );
    const noError = JSON.parse(data('schema/fixtures/invalid/feature/no_position_error.json'));
    expect(() =>
      parseEvidenceFile(JSON.stringify({ ...collection, features: [noError] }), 'x.geojson'),
    ).toThrowError(EvidenceLoadError);
  });
});

describe('the source index', () => {
  it('maps sources by id', () => {
    const index = showcaseSources();
    expect(index.get(P1911)?.year_to).toBe(1914);
  });

  it('throws on a duplicate id', () => {
    const registry = showcaseRegistry();
    registry.sources.push(makeSource(P1911, 1911, 1914));
    expect(() => indexSources(registry)).toThrowError(/duplicate source id/);
  });

  it('refuses an unknown source and a source with no start year', () => {
    const index = showcaseSources();
    expect(() => yearRange(index, 'fip_v3_1999_001')).toThrowError(EvidenceLoadError);
    const pending = indexSources({
      schema_version: '1.0.0',
      sources: [makeSource('present_toronto_intersections_2026', 2026, 2026, {
        type: 'present_day_reference', year_from: null })],
    });
    expect(() => yearRange(pending, 'present_toronto_intersections_2026')).toThrowError(/no year_from/);
  });

  it('makes the date logic throw for an observation that cites an unregistered source', () => {
    const f = makeFeature(P1911, [obs(P1911, true), obs('fip_v3_1999_001', false)]);
    expect(() => summariseDates(f, showcaseSources())).toThrowError(EvidenceLoadError);
  });
});
