/**
 * Builders for tests. Geometry is synthetic rectangles near a placeholder point in UTM 17N; no
 * fixture describes a real building. Source ids are the real plate ids because the rules under
 * test are about those forms.
 */
import { indexSources } from '../sources';
import type { SourceIndex } from '../sources';
import type {
  Era,
  Feature,
  FeatureCollection,
  LinearRing,
  Observation,
  Source,
  SourceRegistry,
} from '../types.generated';

export const E0 = 500000;
export const N0 = 4000000;
export const LONG_AGO = '2026-11-12T10:00:00Z';

export const P1911 = 'fip_v3_1911_229';
export const P1935 = 'fip_v3_1935_229';
export const AERIAL = 'aerial_1947_s0000_fl0000_it0000h';

export function makeSource(id: string, yearFrom: number, yearTo: number, over: Partial<Source> = {}): Source {
  return {
    id,
    type: 'fire_insurance_plan',
    title: `synthetic ${id}`,
    year_from: yearFrom,
    year_to: yearTo,
    url: `https://example.invalid/${id}.zip`,
    licence_note: 'Synthetic.',
    attribution_line: 'Synthetic attribution.',
    attribution_status: 'confirmed',
    rights_checked_on: '2026-11-10',
    held_out: false,
    ...over,
  };
}

/** The four showcase eras with the plates and aerial that feed them. The 1935 edition reads
 * "January 1931, revised to May 1935", so its range is 1931 to 1935 (spec 01 requirement 24). */
export function showcaseRegistry(): SourceRegistry {
  return {
    schema_version: '1.1.0',
    sources: [
      makeSource(P1911, 1911, 1914, { years_label: '1911, revised to 1914' }),
      makeSource(P1935, 1931, 1935, {
        years_label: '1931, revised to 1935',
        holding: 'Library and Archives Canada, National Map Collection, NMC-0013999',
      }),
      makeSource(AERIAL, 1947, 1947, { type: 'aerial_photograph' }),
    ],
  };
}

export function showcaseSources(): SourceIndex {
  return indexSources(showcaseRegistry());
}

export const ERA_1911: Era = { id: '1911', label: '1911 (revised to 1914)', year_from: 1911, year_to: 1914 };
export const ERA_1935: Era = { id: '1935', label: '1935', year_from: 1935, year_to: 1935 };
/**
 * The 1935 era as data/project.json defines it since schema 1.1.0: 1931 to 1935, the range of the
 * plates ("January 1931, revised to May 1935"). `ERA_1935` above is the older single-year era,
 * kept because tests outside the Evidence Library still import it.
 */
export const ERA_1935_EDITION: Era = { id: '1935', label: '1935', year_from: 1931, year_to: 1935 };
export const ERA_1947: Era = { id: '1947', label: '1947', year_from: 1947, year_to: 1947 };
export const ERA_TODAY: Era = { id: 'today', label: 'Today', year_from: 2026, year_to: 2026 };

export function rect(e: number, n: number, w: number, h: number): LinearRing {
  return [
    [e, n],
    [e + w, n],
    [e + w, n + h],
    [e, n + h],
    [e, n],
  ];
}

export function obs(
  source: string,
  present: boolean,
  visibility: Observation['visibility'] = 'clear',
  method: Observation['method'] = 'person',
): Observation {
  const base: Observation = { source, present, visibility, method };
  if (method === 'person') {
    base.confirmed_by = 'synthetic reviewer';
    base.confirmed_at = LONG_AGO;
  }
  return base;
}

export type FeatureOptions = {
  seq?: number;
  kind?: 'building' | 'water' | 'land_use';
  status?: 'published' | 'rejected' | 'merged';
  at?: [number, number];
  size?: [number, number];
  positionErrorM?: number;
  sameAs?: string[];
};

const PREFIX = { building: 'bld', water: 'wtr', land_use: 'use' } as const;

/** A schema-shaped feature from `origin` with the given observations. */
export function makeFeature(origin: string, observations: Observation[], opts: FeatureOptions = {}): Feature {
  const kind = opts.kind ?? 'building';
  const seq = opts.seq ?? 1;
  const [e, n] = opts.at ?? [E0 + 40 * seq, N0];
  const [w, h] = opts.size ?? [10, 8];
  const status = opts.status ?? 'published';
  const feature: Feature = {
    type: 'Feature',
    id: `${PREFIX[kind]}_${origin}_${String(seq).padStart(4, '0')}`,
    geometry: { type: 'Polygon', coordinates: [rect(e, n, w, h)] },
    properties: {
      kind,
      position_error_m: opts.positionErrorM ?? 4.5,
      attributes: kind === 'building' ? { storeys: 2 } : {},
      observations: observations as Feature['properties']['observations'],
      confidence: 'documented',
      confidence_reason: 'Synthetic.',
      provenance: {
        origin_source: origin,
        crop_px: { x: 0, y: 0, width: 100, height: 100 },
        alignment_error_m: 4.3,
        digitising_error_m: 1,
        confirmed_by: 'synthetic reviewer',
        confirmed_at: LONG_AGO,
        review: { state: 'draft_rule' },
      },
      status,
    },
  };
  if (status === 'rejected') feature.properties.status_reason = 'synthetic';
  if (status === 'merged') feature.properties.merged_into = `${PREFIX[kind]}_${origin}_${String(seq + 1).padStart(4, '0')}`;
  if (opts.sameAs?.length) {
    feature.properties.same_as = opts.sameAs.map((id) => ({ feature: id, method: 'match_auto' as const }));
  }
  return feature;
}

/** Link `a` and `b` both ways (mutates both). */
export function link(a: Feature, b: Feature): void {
  a.properties.same_as = [...(a.properties.same_as ?? []), { feature: b.id, method: 'match_auto' }];
  b.properties.same_as = [...(b.properties.same_as ?? []), { feature: a.id, method: 'match_auto' }];
}

export function makeCollection(origin: string, features: Feature[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    schema_version: '1.0.0',
    crs: 'EPSG:26917',
    origin_source: origin,
    features,
  };
}
