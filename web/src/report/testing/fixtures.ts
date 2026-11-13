/**
 * Synthetic worlds for the Report's tests. Geometry is rectangles near a placeholder point in UTM
 * 17N; source ids are the real plate ids because the rules under test are about those forms. No
 * fixture states what stood on a real lot.
 */
import type { Era, Feature, FeatureCollection, PolygonalGeometry, PresentLayer, Project, Source, SourceRegistry, TileSidecar } from '../../evidence';
import { E0, N0, P1911, P1935, AERIAL, makeCollection, makeFeature, makeSource, obs, rect, link } from '../../evidence/testing/fixtures';
import type { ReportInputs } from '../buildReport';

export { E0, N0, P1911, P1935, AERIAL, makeFeature, makeCollection, obs, rect, link };

export const LOT_ID = 'lot_a';
export const FAR_LOT_ID = 'lot_far';
export const PRESENT_LOTS = 'present_toronto_property_boundaries_2026';
export const PRESENT_BUILDINGS = 'present_toronto_building_outlines_2026';
export const PRESENT_ADDRESSES = 'present_toronto_address_points_2026';

/** The lot: 20 m by 30 m. */
export const LOT_GEOMETRY: PolygonalGeometry = { type: 'Polygon', coordinates: [rect(E0, N0, 20, 30)] };

export function presentSource(id: string): Source {
  return makeSource(id, 2026, 2026, { type: 'present_day_reference', title: `synthetic ${id}` });
}

export function registry(): SourceRegistry {
  return {
    schema_version: '1.1.0',
    sources: [
      makeSource(P1911, 1911, 1914, { years_label: '1911, revised to 1914' }),
      makeSource(P1935, 1931, 1935, { years_label: '1931, revised to 1935' }),
      makeSource(AERIAL, 1947, 1947, { type: 'aerial_photograph' }),
      presentSource(PRESENT_LOTS),
      presentSource(PRESENT_BUILDINGS),
      presentSource(PRESENT_ADDRESSES),
    ],
  };
}

export const ERAS: Era[] = [
  { id: '1911', label: '1911 (revised to 1914)', year_from: 1911, year_to: 1914 },
  { id: '1935', label: '1935', year_from: 1931, year_to: 1935 },
  { id: '1947', label: '1947', year_from: 1947, year_to: 1947 },
  { id: 'today', label: 'Today', year_from: 2026, year_to: 2026 },
];

export function project(): Project {
  return {
    schema_version: '1.1.0',
    crs: 'EPSG:26917',
    origin: { easting: E0, northing: N0 },
    origin_note: 'synthetic',
    bounds: { min_e: E0 - 1000, min_n: N0 - 1000, max_e: E0 + 1000, max_n: N0 + 1000 },
    eras: ERAS,
  } as unknown as Project;
}

function layer(source: string, features: PresentLayer['features']): PresentLayer {
  return {
    type: 'FeatureCollection',
    schema_version: '1.1.0',
    crs: 'EPSG:26917',
    source,
    ckan_package_id: 'synthetic',
    ckan_resource_id: 'synthetic',
    resource_url: 'https://example.invalid/x',
    retrieved_at: '2026-11-12T00:00:00Z',
    last_refreshed: '2026-11-12',
    source_sha256: '0'.repeat(64),
    id_field: 'ID',
    clip_bounds: { min_e: E0 - 1000, min_n: N0 - 1000, max_e: E0 + 1000, max_n: N0 + 1000 },
    attribution_line: 'Synthetic.',
    features,
  } as unknown as PresentLayer;
}

export function lotsLayer(): PresentLayer {
  return layer(PRESENT_LOTS, [
    { type: 'Feature', id: LOT_ID, geometry: LOT_GEOMETRY, properties: {} },
    { type: 'Feature', id: FAR_LOT_ID, geometry: { type: 'Polygon', coordinates: [rect(E0 + 5000, N0 + 5000, 20, 30)] }, properties: {} },
  ] as PresentLayer['features']);
}

export function buildingsLayer(count = 1): PresentLayer {
  const features = Array.from({ length: count }, (_, i) => ({
    type: 'Feature',
    id: `outline_${i}`,
    geometry: { type: 'Polygon', coordinates: [rect(E0 + 4 + i * 2, N0 + 4, 10, 10)] },
    properties: {},
  }));
  return layer(PRESENT_BUILDINGS, features as PresentLayer['features']);
}

export function addressesLayer(): PresentLayer {
  return layer(PRESENT_ADDRESSES, [
    { type: 'Feature', id: 'a1', geometry: { type: 'Point', coordinates: [E0 + 10, N0 + 15] }, properties: { ADDRESS_FULL: '1 Synthetic St' } },
    { type: 'Feature', id: 'a2', geometry: { type: 'Point', coordinates: [E0 + 900, N0 + 900] }, properties: { ADDRESS_FULL: '2 Elsewhere St' } },
  ] as PresentLayer['features']);
}

/** A plate collection that maps and fully reviews a 400 m square around the lot. */
export function plateCollection(origin: string, features: Feature[], covers?: Array<'building' | 'water' | 'land_use'>): FeatureCollection {
  const square: PolygonalGeometry = { type: 'Polygon', coordinates: [rect(E0 - 200, N0 - 200, 400, 400)] };
  const c = makeCollection(origin, features);
  c.mapped_area = { geometry: square, method: 'map_area' } as FeatureCollection['mapped_area'];
  c.reviewed_areas = [
    { geometry: square, method: 'person', confirmed_by: 'synthetic reviewer', confirmed_at: '2026-11-12T10:00:00Z', ...(covers ? { covers } : {}) },
  ] as FeatureCollection['reviewed_areas'];
  return c;
}

/** A mapped plate with no reviewed area. */
export function mappedOnly(origin: string, features: Feature[]): FeatureCollection {
  const c = plateCollection(origin, features);
  delete c.reviewed_areas;
  return c;
}

export function aerialSidecar(): TileSidecar {
  return {
    schema_version: '1.1.0',
    source: AERIAL,
    image: `${AERIAL}.jpg`,
    width_px: 100,
    height_px: 100,
    corners: {
      top_left: [E0 - 100, N0 + 100],
      top_right: [E0 + 100, N0 + 100],
      bottom_right: [E0 + 100, N0 - 100],
      bottom_left: [E0 - 100, N0 - 100],
    },
    transform: 'supplied',
    alignment_error_m: 4,
    source_pixel_size_m: 0.5,
    tile_pixel_size_m: 2,
    attribution_line: 'Synthetic.',
  } as unknown as TileSidecar;
}

export function inputs(collections: FeatureCollection[], over: Partial<ReportInputs> = {}): ReportInputs {
  return {
    lotId: LOT_ID,
    eraId: null,
    canon: {
      collections,
      registry: registry(),
      project: project(),
      sidecars: [],
      lots: lotsLayer(),
      addresses: addressesLayer(),
      buildings: buildingsLayer(),
    },
    workspace: null,
    dataVersion: 'abcdef0123456789'.repeat(4),
    linkDataVersion: null,
    siteOrigin: 'https://buried.example',
    ...over,
  };
}

/** A building on the lot, drawn on both plates and linked; the second plate's drawing is the same set. */
export function linkedBuildingOnLot(): FeatureCollection[] {
  const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true, 'clear', 'match_auto')], { seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
  const b = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin'), obs(P1911, true, 'clear', 'match_auto')], { seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
  link(a, b);
  return [plateCollection(P1911, [a]), plateCollection(P1935, [b])];
}
