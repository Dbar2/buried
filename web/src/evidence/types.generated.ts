/* eslint-disable */
/**
 * GENERATED FILE. Do not edit by hand.
 * Source: data/schema/evidence.schema.json. Regenerate with `npm run gen:types` (from web/).
 * All coordinates are EPSG:26917 metres, easting first, never longitude/latitude.
 */

/**
 * MAJOR.MINOR.PATCH. A change to this schema bumps it here and in every contract file it affects.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "schemaVersion".
 */
export type SchemaVersion = string;
/**
 * A source id, built as in structure.md: lowercase snake_case.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "sourceId".
 */
export type SourceId = string;
/**
 * An RFC 3339 date-time.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "dateTime".
 */
export type IsoDateTime = string;
/**
 * A closed ring of EPSG:26917 positions (at least four, first equal to last is checked by the Validator).
 *
 * @minItems 4
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "linearRing".
 */
export type LinearRing = [Position, Position, Position, Position, ...Position[]];
/**
 * One position in EPSG:26917 metres: [easting, northing]. Never longitude/latitude: a pair such as [-79.35, 43.65] fails the easting minimum. Exactly two numbers.
 *
 * @minItems 2
 * @maxItems 2
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "position".
 */
export type Position = [number, number];
/**
 * Polygon or MultiPolygon in EPSG:26917 metres.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "polygonalGeometry".
 */
export type PolygonalGeometry = PolygonGeometry1 | MultiPolygonGeometry;
/**
 * An ISO 8601 calendar date.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "date".
 */
export type IsoDate = string;
/**
 * <bld|wtr|use>_<origin source id>_<4 digits>.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "featureId".
 */
export type FeatureId = string;
/**
 * Polygon, MultiPolygon, LineString or MultiLineString in EPSG:26917 metres. Lines are allowed for water features only (enforced in feature).
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "featureGeometry".
 */
export type FeatureGeometry =
  PolygonGeometry1 | MultiPolygonGeometry | LineStringGeometry | MultiLineStringGeometry;
/**
 * [x, y] integer pixel vertex on a source raster (GDAL convention: (0, 0) is the top-left corner of the top-left pixel).
 *
 * @minItems 2
 * @maxItems 2
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "pixelPoint".
 */
export type PixelPoint = [number, number];

/**
 * One property per contract file shape in the Schema.
 */
export interface ContractFiles {
  alignmentRecord?: AlignmentRecord;
  attributeRead?: AttributeRead;
  attributes?: Attributes;
  bounds?: Bounds;
  controlPoint?: ControlPoint;
  controlPoints?: ControlPoints;
  coverageArea?: CoverageArea;
  cropPx?: CropPx;
  date?: IsoDate;
  dateTime?: IsoDateTime;
  era?: Era;
  feature?: Feature;
  featureCollection?: FeatureCollection;
  featureGeometry?: FeatureGeometry;
  featureId?: FeatureId;
  lineStringGeometry?: LineStringGeometry;
  linearRing?: LinearRing;
  link?: Link;
  mapArea?: MapArea;
  multiLineStringGeometry?: MultiLineStringGeometry;
  multiPolygonGeometry?: MultiPolygonGeometry;
  observation?: Observation;
  pixelPoint?: PixelPoint;
  pointGeometry?: PointGeometry;
  polygonGeometry?: PolygonGeometry1;
  polygonalGeometry?: PolygonalGeometry;
  position?: Position;
  presentFeature?: PresentFeature;
  presentLayer?: PresentLayer;
  project?: Project;
  provenance?: Provenance;
  residual?: Residual;
  reviewState?: ReviewState;
  schemaVersion?: SchemaVersion;
  source?: Source;
  sourceId?: SourceId;
  sourceRegistry?: SourceRegistry;
  tileSidecar?: TileSidecar;
}
/**
 * data/alignment/<source id>.json, written by buried align-check. alignment_error_m = ceil_0.1(max(2.0, 2 x error_basis_m)).
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "alignmentRecord".
 */
export interface AlignmentRecord {
  schema_version: SchemaVersion;
  source: SourceId;
  /**
   * @minItems 1
   */
  reference_sources: [SourceId, ...SourceId[]];
  control_file: string;
  control_sha256: string;
  measured_at: IsoDateTime;
  tool_version: string;
  status: 'measured';
  source_pixel_size_m: number;
  supplied?: {
    crs: string;
    operation: string;
    /**
     * @minItems 3
     */
    residuals: [Residual, Residual, Residual, ...Residual[]];
    rmse_m: number;
    max_residual_m: number;
  };
  refined?: {
    /**
     * [a, b, c, d, e, f]: E = a x + b y + c, N = d x + e y + f, pixel to EPSG:26917.
     *
     * @minItems 6
     * @maxItems 6
     */
    affine: [number, number, number, number, number, number];
    /**
     * @minItems 4
     */
    residuals: [Residual, Residual, Residual, Residual, ...Residual[]];
    rmse_in_sample_m: number;
    rmse_loo_m: number;
    max_residual_m: number;
  };
  chosen: 'supplied' | 'refined';
  error_basis: 'supplied_rmse' | 'refined_loo_rmse';
  error_basis_m: number;
  error_rule: {
    multiplier: 2;
    floor_m: 2;
    round_up_to_m: 0.1;
  };
  alignment_error_m: number;
  outliers: string[];
  control_hull?: PolygonGeometry;
  control_hull_area_m2?: number;
}
/**
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "residual".
 */
export interface Residual {
  id: string;
  dx_m: number;
  dy_m: number;
  r_m: number;
}
/**
 * The convex hull of the control points' reference positions, EPSG:26917 metres, 3 decimals. The error figure is measured inside it. Required of records written after schema 1.1.0 (checked by the Validator, which accepts a record without it only at schema_version 1.0.0).
 */
export interface PolygonGeometry {
  type: 'Polygon';
  /**
   * @minItems 1
   */
  coordinates: [LinearRing, ...LinearRing[]];
}
/**
 * Where on the origin source one attribute was read, and by whom. A read by label_assist names the provider and model that proposed the text; a person confirmed it.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "attributeRead".
 */
export interface AttributeRead {
  attribute: 'use' | 'material' | 'storeys' | 'street_number';
  crop_px: CropPx;
  read_by: 'person' | 'label_assist';
  provider?: string;
  model_id?: string;
  confirmed_by: string;
  confirmed_at: IsoDateTime;
}
/**
 * An integer pixel rectangle on a source raster at full resolution (GDAL convention).
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "cropPx".
 */
export interface CropPx {
  x: number;
  y: number;
  width: number;
  height: number;
}
/**
 * Attributes read from the source. Each is optional and never guessed. material is set only from lettering or the legend, and then provenance.attribute_reads has its read.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "attributes".
 */
export interface Attributes {
  use?: string;
  material?: string;
  storeys?: number;
  /**
   * The street number as printed on the source.
   */
  street_number?: string;
}
/**
 * A rectangle in EPSG:26917 metres.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "bounds".
 */
export interface Bounds {
  min_e: number;
  min_n: number;
  max_e: number;
  max_n: number;
}
/**
 * One control point: a pixel on the plate paired with a present-day feature. reference is EPSG:26917 metres, copied from the present layer.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "controlPoint".
 */
export interface ControlPoint {
  id: string;
  description: string;
  /**
   * [x, y] in the full-resolution raster, GDAL convention.
   *
   * @minItems 2
   * @maxItems 2
   */
  pixel: [number, number];
  reference: Position;
  reference_source: SourceId;
  reference_kind: 'intersection' | 'building_corner';
  reference_feature_id: string;
  reference_vertex?: {
    polygon: number;
    vertex: number;
  };
}
/**
 * data/control/<source id>.json.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "controlPoints".
 */
export interface ControlPoints {
  schema_version: SchemaVersion;
  source: SourceId;
  pixel_convention: 'gdal_corner';
  /**
   * @minItems 3
   */
  points: [ControlPoint, ControlPoint, ControlPoint, ...ControlPoint[]];
}
/**
 * A Polygon or MultiPolygon in EPSG:26917 metres with the method that produced it. A reviewed area (method person) is a person's statement that every feature of the kinds it covers (buildings when covers is absent) that the origin source draws inside it is published in the file. method map_area is the plate's map area polygon through the chosen transform (mapped_area only).
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "coverageArea".
 */
export interface CoverageArea {
  geometry: PolygonalGeometry;
  method: 'neatline' | 'raster_footprint' | 'map_area' | 'person';
  /**
   * Reviewed areas only. The kinds of feature the person attests are all published inside the area. Absent means ["building"].
   *
   * @minItems 1
   */
  covers?: ['building' | 'water' | 'land_use', ...('building' | 'water' | 'land_use')[]];
  /**
   * Integer pixel vertices on the origin source (GDAL convention).
   *
   * @minItems 3
   */
  pixel_polygon?: [[number, number], [number, number], [number, number], ...[number, number][]];
  confirmed_by?: string;
  confirmed_at?: IsoDateTime;
}
/**
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "polygonGeometry".
 */
export interface PolygonGeometry1 {
  type: 'Polygon';
  /**
   * @minItems 1
   */
  coordinates: [LinearRing, ...LinearRing[]];
}
/**
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "multiPolygonGeometry".
 */
export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  /**
   * @minItems 1
   */
  coordinates: [[LinearRing, ...LinearRing[]], ...[LinearRing, ...LinearRing[]][]];
}
/**
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "era".
 */
export interface Era {
  id: string;
  label: string;
  year_from: number;
  year_to: number;
}
/**
 * One building (bld), water feature (wtr) or land-use area (use). Geometry is EPSG:26917 metres.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "feature".
 */
export interface Feature {
  type: 'Feature';
  id: FeatureId;
  geometry: FeatureGeometry;
  properties: {
    kind: 'building' | 'water' | 'land_use';
    /**
     * About how far, in metres, the true position may be from where the feature is drawn. A conservative estimate, not an absolute bound.
     */
    position_error_m: number;
    attributes: Attributes;
    /**
     * @minItems 1
     */
    observations: [Observation, ...Observation[]];
    confidence: 'documented' | 'estimated' | 'unknown';
    confidence_reason: string;
    provenance: Provenance;
    status: 'published' | 'rejected' | 'merged';
    status_reason?: string;
    merged_into?: FeatureId;
    same_as?: Link[];
  };
}
/**
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "lineStringGeometry".
 */
export interface LineStringGeometry {
  type: 'LineString';
  /**
   * @minItems 2
   */
  coordinates: [Position, Position, ...Position[]];
}
/**
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "multiLineStringGeometry".
 */
export interface MultiLineStringGeometry {
  type: 'MultiLineString';
  /**
   * @minItems 1
   */
  coordinates: [[Position, Position, ...Position[]], ...[Position, Position, ...Position[]][]];
}
/**
 * What one source shows at the feature's location. No year: the year range comes from the source in the registry.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "observation".
 */
export interface Observation {
  source: SourceId;
  present: boolean;
  visibility: 'clear' | 'obscured' | 'not_covered';
  method: 'origin' | 'match_auto' | 'person';
  matched_feature?: FeatureId;
  confirmed_by?: string;
  confirmed_at?: IsoDateTime;
  note?: string;
}
/**
 * Where a feature came from, who confirmed it and how far off its outline may be. Pixel coordinates use the GDAL convention: (0, 0) is the top-left corner of the top-left pixel of the full-resolution source raster.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "provenance".
 */
export interface Provenance {
  origin_source: SourceId;
  crop_px: CropPx;
  alignment_error_m: number;
  digitising_error_m: number;
  confirmed_by: string;
  confirmed_at: IsoDateTime;
  review: ReviewState;
  proposal_id?: string;
  extraction_params_id?: string;
  /**
   * One entry per attribute read from lettering or the legend on the origin source, with the crop it was read from. A material needs one.
   */
  attribute_reads?: AttributeRead[];
  /**
   * The fill tone extraction observed on the scan. A fact about the image, not an attribute: no consumer presents it as a material.
   */
  tone_class?: 'light' | 'mid' | 'dark' | 'hatched' | 'mixed';
}
/**
 * Whether a named person has reviewed the feature. reviewed: a person looked at the feature against its source and named themselves (by) and the day (on). draft_rule: drawn by rule-based extraction and published, not reviewed. draft_hand: traced by hand and published, not reviewed. A draft carries no by or on. This is not the publishing record: confirmed_by and confirmed_at say who accepted the proposal into the file and are never printed as a status.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "reviewState".
 */
export interface ReviewState {
  state: 'reviewed' | 'draft_rule' | 'draft_hand';
  by?: string;
  on?: IsoDate;
}
/**
 * A link to a feature from another source that shows the same thing. Linking is not merging.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "link".
 */
export interface Link {
  feature: FeatureId;
  method: 'match_auto' | 'person';
  confirmed_by?: string;
  confirmed_at?: IsoDateTime;
}
/**
 * An evidence file: data/evidence/<origin source id>.geojson. GeoJSON-shaped but in EPSG:26917 metres, not WGS84; do not hand it to a library that assumes lon/lat.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "featureCollection".
 */
export interface FeatureCollection {
  type: 'FeatureCollection';
  schema_version: SchemaVersion;
  crs: 'EPSG:26917';
  origin_source: SourceId;
  /**
   * Where the origin source draws the ground: the plate's map area through the chosen transform, its neatline, or the raster footprint under the chosen transform.
   */
  mapped_area?: CoverageArea & {
    method?: 'neatline' | 'raster_footprint' | 'map_area';
  };
  /**
   * Areas where a person attests that every feature of the kinds in covers (buildings when covers is absent) that the origin source draws is published.
   */
  reviewed_areas?: (CoverageArea & {
    method?: 'person';
  })[];
  features: Feature[];
}
/**
 * data/control/map_area/<source id>.json: a person's statement of where map content is on a plate image. Margins, title blocks, scale bars, north arrows, archive labels and rulers lie outside it. Code never detects it silently.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "mapArea".
 */
export interface MapArea {
  schema_version: SchemaVersion;
  source: SourceId;
  pixel_convention: 'gdal_corner';
  /**
   * Integer pixel vertices of one simple polygon in full-resolution pixels, at least four, the first vertex not repeated at the end.
   *
   * @minItems 4
   */
  pixel_polygon: [PixelPoint, PixelPoint, PixelPoint, PixelPoint, ...PixelPoint[]];
  /**
   * What lies outside the polygon, for example "margin, title block, archive labels, ruler".
   */
  excluded: string;
  /**
   * Integer pixel polylines a person marked where the paper was folded.
   */
  fold_lines?: [PixelPoint, PixelPoint, ...PixelPoint[]][];
  confirmed_by: string;
  confirmed_at: IsoDateTime;
}
/**
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "pointGeometry".
 */
export interface PointGeometry {
  type: 'Point';
  coordinates: Position;
}
/**
 * A present-day City of Toronto feature in EPSG:26917 metres. Reference data, not evidence: it carries no observations.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "presentFeature".
 */
export interface PresentFeature {
  type: 'Feature';
  id: string;
  geometry: PointGeometry | PolygonGeometry1 | MultiPolygonGeometry;
  properties: {
    [k: string]: string | number | boolean | null;
  };
}
/**
 * data/present/<source id>.geojson: a present-day layer clipped to the project bounds, in EPSG:26917 metres.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "presentLayer".
 */
export interface PresentLayer {
  type: 'FeatureCollection';
  schema_version: SchemaVersion;
  crs: 'EPSG:26917';
  source: SourceId;
  ckan_package_id: string;
  ckan_resource_id: string;
  resource_url: string;
  retrieved_at: IsoDateTime;
  last_refreshed: IsoDate;
  source_sha256: string;
  id_field: string;
  clip_bounds: Bounds;
  attribution_line: string;
  features: PresentFeature[];
}
/**
 * data/project.json: the project origin, bounds and eras. Coordinates are EPSG:26917 metres.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "project".
 */
export interface Project {
  schema_version: SchemaVersion;
  crs: 'EPSG:26917';
  /**
   * The project origin (E0, N0) in EPSG:26917 metres. Frozen once evidence is published.
   */
  origin: {
    easting: number;
    northing: number;
  };
  origin_note: string;
  bounds: Bounds;
  /**
   * @minItems 1
   */
  eras: [Era, ...Era[]];
}
/**
 * One archival item or present-day dataset, registered once. year_from is null only for a present_day_reference source whose CKAN last-refresh year has not been read yet; evidence cannot cite such a source.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "source".
 */
export interface Source {
  id: SourceId;
  type: 'fire_insurance_plan' | 'aerial_photograph' | 'present_day_reference' | 'historical_map';
  title: string;
  year_from: number | null;
  year_to: number;
  url: string;
  licence_note: string;
  attribution_line: string;
  attribution_status: 'confirmed' | 'to_be_confirmed';
  rights_checked_on: IsoDate | null;
  held_out: boolean;
  /**
   * Display only, for example "1931, revised to 1935". The date logic never reads it. The Validator checks it states exactly year_from and year_to and no other year.
   */
  years_label?: string;
  /**
   * The institution that holds the original, when it differs from the distributor.
   */
  holding?: string;
}
/**
 * data/sources.json.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "sourceRegistry".
 */
export interface SourceRegistry {
  schema_version: SchemaVersion;
  sources: Source[];
}
/**
 * data/tiles/<source id>.json. Corner coordinates are EPSG:26917 metres.
 *
 * This interface was referenced by `ContractFiles`'s JSON-Schema
 * via the `definition` "tileSidecar".
 */
export interface TileSidecar {
  schema_version: SchemaVersion;
  source: SourceId;
  image: string;
  width_px: number;
  height_px: number;
  corners: {
    top_left: Position;
    top_right: Position;
    bottom_right: Position;
    bottom_left: Position;
  };
  transform: 'supplied' | 'refined';
  alignment_error_m: number;
  source_pixel_size_m: number;
  tile_pixel_size_m: number;
  attribution_line: string;
  crop_px?: CropPx1;
  map_area?: PolygonGeometry2;
  /**
   * File name next to the sidecar of a downsampled copy of the whole raster, for the Sources page. Never draped.
   */
  full_image?: string;
  full_width_px?: number;
  full_height_px?: number;
}
/**
 * An integer pixel rectangle on a source raster at full resolution (GDAL convention).
 */
export interface CropPx1 {
  x: number;
  y: number;
  width: number;
  height: number;
}
/**
 * The plate's map area polygon in EPSG:26917 metres (its pixel polygon through the chosen transform), so the Explorer can clip the drape to it.
 */
export interface PolygonGeometry2 {
  type: 'Polygon';
  /**
   * @minItems 1
   */
  coordinates: [LinearRing, ...LinearRing[]];
}
