/** S3: a workspace feature never appears as canon. */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FeatureCollection } from '../evidence';
import { mergeForDisplay } from './merge';

type Feat = FeatureCollection['features'][number];
const feature = (id: string): Feat => ({ type: 'Feature', id, geometry: { type: 'Polygon', coordinates: [] }, properties: {} }) as unknown as Feat;
const collection = (source: string, ids: string[]): FeatureCollection =>
  ({ type: 'FeatureCollection', schema_version: '1.1.0', crs: 'EPSG:26917', origin_source: source, features: ids.map(feature) }) as unknown as FeatureCollection;

const idArb = fc.integer({ min: 1, max: 40 }).map((n) => `bld_fip_v3_1911_229_${String(n).padStart(4, '0')}`);
const collectionsArb = fc.array(fc.uniqueArray(idArb, { maxLength: 12 }), { maxLength: 3 });

describe('property S3: a workspace feature never appears as canon', () => {
  it('names every kept workspace feature as workspace, every canon feature as canon, and no id as both', () => {
    fc.assert(
      fc.property(collectionsArb, collectionsArb, (canonIds, workspaceIds) => {
        const canon = canonIds.map((ids, i) => collection(`c${i}`, ids));
        const workspace = workspaceIds.map((ids, i) => collection(`w${i}`, ids));
        const merged = mergeForDisplay(canon, workspace);

        const canonAll = new Set(canonIds.flat());
        for (const id of canonAll) expect(merged.originOf(id)).toBe('canon');
        for (const id of merged.workspaceFeatureIds) {
          expect(canonAll.has(id)).toBe(false);
          expect(merged.originOf(id)).toBe('workspace');
        }
        // Every feature in the merged collections beyond the canon ones is a workspace feature.
        const shown = merged.collections.slice(canon.length).flatMap((c) => c.features.map((f) => f.id));
        expect(new Set(shown)).toEqual(new Set(merged.workspaceFeatureIds));
        expect(new Set(shown).size).toBe(shown.length);
      }),
    );
  });

  it('leaves the canon collections as they were', () => {
    fc.assert(
      fc.property(collectionsArb, collectionsArb, (canonIds, workspaceIds) => {
        const canon = canonIds.map((ids, i) => collection(`c${i}`, ids));
        const before = JSON.stringify(canon);
        mergeForDisplay(canon, workspaceIds.map((ids, i) => collection(`w${i}`, ids)));
        expect(JSON.stringify(canon)).toBe(before);
      }),
    );
  });

  it('is canon for an id it has never heard of', () => {
    expect(mergeForDisplay([], []).originOf('bld_x_0001')).toBe('canon');
  });
});
