/* eslint-disable */
/**
 * GENERATED FILE. Do not edit by hand.
 * Source: data/schema/studio_api.schema.json (with the definitions it takes from
 * data/schema/evidence.schema.json). Regenerate with `npx tsx scripts/genStudioApiTypes.ts`
 * (from web/). All coordinates are EPSG:26917 metres, easting first, never longitude/latitude.
 */

/**
 * An RFC 3339 date-time.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "dateTime".
 */
export type IsoDateTime = string;
/**
 * @minItems 3
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "pixelPolygon".
 */
export type PixelPolygon = [PixelPoint, PixelPoint, PixelPoint, ...PixelPoint[]];
/**
 * [x, y] integer pixel vertex on a source raster (GDAL convention: (0, 0) is the top-left corner of the top-left pixel).
 *
 * @minItems 2
 * @maxItems 2
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "pixelPoint".
 */
export type PixelPoint = [number, number];
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "confidenceClass".
 */
export type ConfidenceClass = 'documented' | 'estimated' | 'unknown';
/**
 * The Service API version this schema describes.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "apiVersion".
 */
export type ApiVersion = '1.0.0';
/**
 * SHA-256 (lowercase hex) of the canon contract files, by the rule in spec 04 design 'Data version'.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "dataVersion".
 */
export type DataVersion = string;
/**
 * SHA-256 (lowercase hex) of the raster file's bytes: the key of the Service's raster cache.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "plateRef".
 */
export type PlateRef = string;
/**
 * A source id, built as in structure.md: lowercase snake_case.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "sourceId".
 */
export type SourceId = string;
/**
 * An ISO 8601 calendar date.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "date".
 */
export type IsoDate = string;
/**
 * A contract file as text, in the canonical serialisation. Stored and exported verbatim.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "canonicalText".
 */
export type CanonicalText = string;
/**
 * MAJOR.MINOR.PATCH. A change to this schema bumps it here and in every contract file it affects.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "schemaVersion".
 */
export type SchemaVersion = string;
/**
 * One position in EPSG:26917 metres: [easting, northing]. Never longitude/latitude: a pair such as [-79.35, 43.65] fails the easting minimum. Exactly two numbers.
 *
 * @minItems 2
 * @maxItems 2
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "position".
 */
export type Position = [number, number];
/**
 * A closed ring of EPSG:26917 positions (at least four, first equal to last is checked by the Validator).
 *
 * @minItems 4
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "linearRing".
 */
export type LinearRing = [Position, Position, Position, Position, ...Position[]];
/**
 * Polygon or MultiPolygon in EPSG:26917 metres.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "polygonalGeometry".
 */
export type PolygonalGeometry = PolygonGeometry2 | MultiPolygonGeometry;
/**
 * One decision of the v2 file. The Service builds accept, reject and land-use trace; merge, split and the other traces are in the contract and are refused by name until spec 04 task 2.1 is done.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "decisionV2".
 */
export type DecisionV2 =
  AcceptDecisionV2 | RejectDecisionV2 | MergeDecisionV2 | SplitDecisionV2 | TraceDecisionV2;
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "labelField".
 */
export type LabelField = 'storeys' | 'use' | 'street_number';
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "errorCode".
 */
export type ErrorCode =
  | 'invalid_request'
  | 'version_mismatch'
  | 'data_version_mismatch'
  | 'not_allowed'
  | 'too_large'
  | 'rate_limited'
  | 'not_found'
  | 'no_georeferencing'
  | 'validation_failed'
  | 'upstream_failed'
  | 'timeout';
/**
 * <bld|wtr|use>_<origin source id>_<4 digits>.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "featureId".
 */
export type FeatureId = string;
/**
 * Polygon, MultiPolygon, LineString or MultiLineString in EPSG:26917 metres. Lines are allowed for water features only (enforced in feature).
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "featureGeometry".
 */
export type FeatureGeometry =
  PolygonGeometry2 | MultiPolygonGeometry | LineStringGeometry | MultiLineStringGeometry;
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "unitInterval".
 */
export type UnitInterval = number;
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "sha256".
 */
export type Sha256 = string;
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "publishResponse".
 */
export type PublishResponse =
  | {
      ok: true;
      evidence_file_text: CanonicalText;
      counts: PublishCounts;
      new_feature_ids: FeatureId[];
    }
  | {
      ok: false;
      /**
       * @minItems 1
       */
      errors: [PublishError, ...PublishError[]];
    };

/**
 * One property per definition in the Service API Schema and the shared Schema.
 */
export interface StudioApi {
  acceptDecisionV2?: AcceptDecisionV2;
  alignRequest?: AlignRequest;
  alignResponse?: AlignResponse;
  alignmentRecord?: AlignmentRecord;
  apiVersion?: ApiVersion;
  attributeRead?: AttributeRead;
  attributeReadDecision?: AttributeReadDecision;
  attributes?: Attributes;
  bounds?: Bounds;
  canonicalText?: CanonicalText;
  confidenceClass?: ConfidenceClass;
  controlPoint?: ControlPoint;
  controlPoints?: ControlPoints;
  coverageArea?: CoverageArea;
  cropPx?: CropPx;
  dataVersion?: DataVersion;
  date?: IsoDate;
  dateTime?: IsoDateTime;
  decisionV2?: DecisionV2;
  decisionsV1?: DecisionsV1;
  decisionsV2?: DecisionsV2;
  era?: Era;
  errorBody?: ErrorBody;
  errorCode?: ErrorCode;
  extractRequest?: ExtractRequest;
  extractResponse?: ExtractResponse;
  feature?: Feature;
  featureCollection?: FeatureCollection;
  featureGeometry?: FeatureGeometry;
  featureId?: FeatureId;
  healthResponse?: HealthResponse;
  imageInfo?: ImageInfo;
  indexPlate?: IndexPlate;
  labelField?: LabelField;
  labelRead?: LabelRead;
  labelsRequest?: LabelsRequest;
  labelsResponse?: LabelsResponse;
  limits?: Limits;
  lineStringGeometry?: LineStringGeometry;
  linearRing?: LinearRing;
  link?: Link;
  mapArea?: MapArea;
  matchRequest?: MatchRequest;
  matchResponse?: MatchResponse;
  mergeDecisionV2?: MergeDecisionV2;
  multiLineStringGeometry?: MultiLineStringGeometry;
  multiPolygonGeometry?: MultiPolygonGeometry;
  observation?: Observation;
  pixelPoint?: PixelPoint;
  pixelPolygon?: PixelPolygon;
  pixelRegion?: PixelRegion;
  plateRef?: PlateRef;
  platesFetchRequest?: PlatesFetchRequest;
  platesFetchResponse?: PlatesFetchResponse;
  platesIndexResponse?: PlatesIndexResponse;
  pointGeometry?: PointGeometry;
  polygonGeometry?: PolygonGeometry2;
  polygonalGeometry?: PolygonalGeometry;
  position?: Position;
  presentFeature?: PresentFeature;
  presentLayer?: PresentLayer;
  project?: Project;
  proposalFeature?: ProposalFeature;
  proposalFile?: ProposalFile;
  provenance?: Provenance;
  publishCounts?: PublishCounts;
  publishError?: PublishError;
  publishRequest?: PublishRequest;
  publishResponse?: PublishResponse;
  registeredPlate?: RegisteredPlate;
  registeredPlatesResponse?: RegisteredPlatesResponse;
  rejectDecisionV2?: RejectDecisionV2;
  residual?: Residual;
  reviewedAreaDecision?: ReviewedAreaDecision;
  schemaVersion?: SchemaVersion;
  sha256?: Sha256;
  source?: Source;
  sourceId?: SourceId;
  sourceRegistry?: SourceRegistry;
  splitDecisionV2?: SplitDecisionV2;
  splitPartV2?: SplitPartV2;
  tileSidecar?: TileSidecar;
  traceDecisionV2?: TraceDecisionV2;
  unitInterval?: UnitInterval;
  uploadResponse?: UploadResponse;
  workspaceState?: WorkspaceState;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "acceptDecisionV2".
 */
export interface AcceptDecisionV2 {
  type: 'accept';
  proposal_id: string;
  confirmed_by: string;
  confirmed_at: IsoDateTime;
  pixel_polygon?: PixelPolygon;
  attributes?: Attributes;
  attribute_reads?: AttributeReadDecision[];
  confidence?: ConfidenceClass;
  confidence_reason?: string;
  position_error_m?: number;
}
/**
 * Attributes read from the source. Each is optional and never guessed. material is set only from lettering or the legend, and then provenance.attribute_reads has its read.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * Where on the plate a reviewer read one attribute. confirmed_by and confirmed_at come from the decision that carries it.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "attributeReadDecision".
 */
export interface AttributeReadDecision {
  attribute: 'use' | 'material' | 'storeys' | 'street_number';
  crop_px: CropPx;
  read_by: 'person' | 'label_assist';
  provider?: string;
  model_id?: string;
}
/**
 * An integer pixel rectangle on a source raster at full resolution (GDAL convention).
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "cropPx".
 */
export interface CropPx {
  x: number;
  y: number;
  width: number;
  height: number;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "alignRequest".
 */
export interface AlignRequest {
  api_version: ApiVersion;
  data_version: DataVersion;
  plate_ref: PlateRef;
  source: Source;
  control_file_text: CanonicalText;
}
/**
 * One archival item or present-day dataset, registered once. year_from is null only for a present_day_reference source whose CKAN last-refresh year has not been read yet; evidence cannot cite such a source.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "alignResponse".
 */
export interface AlignResponse {
  control_file_text: CanonicalText;
  alignment_record_text: CanonicalText;
  min_feature_position_error_m: number;
  digitising_error_m: number;
  tile_sidecar: TileSidecar;
}
/**
 * data/tiles/<source id>.json. Corner coordinates are EPSG:26917 metres.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
  map_area?: PolygonGeometry;
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
export interface PolygonGeometry {
  type: 'Polygon';
  /**
   * @minItems 1
   */
  coordinates: [LinearRing, ...LinearRing[]];
}
/**
 * data/alignment/<source id>.json, written by buried align-check. alignment_error_m = ceil_0.1(max(2.0, 2 x error_basis_m)).
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
  control_hull?: PolygonGeometry1;
  control_hull_area_m2?: number;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
export interface PolygonGeometry1 {
  type: 'Polygon';
  /**
   * @minItems 1
   */
  coordinates: [LinearRing, ...LinearRing[]];
}
/**
 * Where on the origin source one attribute was read, and by whom. A read by label_assist names the provider and model that proposed the text; a person confirmed it.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * A rectangle in EPSG:26917 metres.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "polygonGeometry".
 */
export interface PolygonGeometry2 {
  type: 'Polygon';
  /**
   * @minItems 1
   */
  coordinates: [LinearRing, ...LinearRing[]];
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "rejectDecisionV2".
 */
export interface RejectDecisionV2 {
  type: 'reject';
  proposal_id: string;
  confirmed_by: string;
  confirmed_at: IsoDateTime;
  reason?: string;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "mergeDecisionV2".
 */
export interface MergeDecisionV2 {
  type: 'merge';
  /**
   * @minItems 2
   */
  proposal_ids: [string, string, ...string[]];
  pixel_polygon: PixelPolygon;
  confirmed_by: string;
  confirmed_at: IsoDateTime;
  attributes?: Attributes;
  attribute_reads?: AttributeReadDecision[];
  confidence?: ConfidenceClass;
  confidence_reason?: string;
  position_error_m?: number;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "splitDecisionV2".
 */
export interface SplitDecisionV2 {
  type: 'split';
  proposal_id: string;
  confirmed_by: string;
  confirmed_at: IsoDateTime;
  /**
   * @minItems 2
   */
  parts: [SplitPartV2, SplitPartV2, ...SplitPartV2[]];
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "splitPartV2".
 */
export interface SplitPartV2 {
  pixel_polygon: PixelPolygon;
  attributes?: Attributes;
  attribute_reads?: AttributeReadDecision[];
  confidence?: ConfidenceClass;
  confidence_reason?: string;
  position_error_m?: number;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "traceDecisionV2".
 */
export interface TraceDecisionV2 {
  type: 'trace';
  kind: 'building' | 'water' | 'land_use';
  /**
   * A Polygon (a building, water or a land-use area) or a LineString (water only) in integer full-resolution pixels.
   */
  pixel_geometry: {
    type: 'Polygon' | 'LineString';
    coordinates: unknown[];
  };
  confirmed_by: string;
  confirmed_at: IsoDateTime;
  attributes?: Attributes;
  attribute_reads?: AttributeReadDecision[];
  confidence: ConfidenceClass;
  confidence_reason: string;
  position_error_m?: number;
}
/**
 * Spec 02's decisions file (design 'Decisions file'): accept or reject, read as the same decisions. confirmed_by and confirmed_at may be absent; such an accept is not published.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "decisionsV1".
 */
export interface DecisionsV1 {
  source: SourceId;
  version?: 1;
  decisions: {
    proposal_id: string;
    decision: 'accept' | 'reject';
    confirmed_by?: string;
    confirmed_at?: string;
    pixel_polygon?: PixelPolygon;
    attributes?: Attributes;
    attribute_reads?: unknown[];
    confidence?: 'documented' | 'estimated' | 'unknown';
    confidence_reason?: string;
    position_error_m?: number;
  }[];
  reviewed_areas?: ReviewedAreaDecision[];
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "reviewedAreaDecision".
 */
export interface ReviewedAreaDecision {
  pixel_polygon: PixelPolygon;
  confirmed_by: string;
  confirmed_at: IsoDateTime;
  /**
   * @minItems 1
   */
  covers?: ['building' | 'water' | 'land_use', ...('building' | 'water' | 'land_use')[]];
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "decisionsV2".
 */
export interface DecisionsV2 {
  version: 2;
  source: SourceId;
  decisions: DecisionV2[];
  reviewed_areas: ReviewedAreaDecision[];
  label_reads?: LabelRead[];
  street_numbers?: {
    review_item_id: string;
    text: string;
    label_read_index?: number;
    confirmed_by: string;
    confirmed_at: IsoDateTime;
  }[];
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "labelRead".
 */
export interface LabelRead {
  review_item_id: string;
  field: LabelField;
  crop_px: CropPx;
  provider: string;
  model_id: string;
  proposed_text: string | null;
  status: 'proposed' | 'not_legible' | 'unavailable';
  confirmed_text: string | null;
  confirmed_by: string;
  confirmed_at: IsoDateTime;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "era".
 */
export interface Era {
  id: string;
  label: string;
  year_from: number;
  year_to: number;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "errorBody".
 */
export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details: unknown[];
  };
}
/**
 * alignment_record_text is optional: without it the canon alignment record is used. The map area is the canon map area file.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "extractRequest".
 */
export interface ExtractRequest {
  api_version: ApiVersion;
  data_version: DataVersion;
  plate_ref: PlateRef;
  source: Source;
  alignment_record_text?: CanonicalText;
  region_px: PixelRegion;
}
/**
 * A full-resolution pixel rectangle on a plate (GDAL corner convention).
 */
export interface PixelRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "extractResponse".
 */
export interface ExtractResponse {
  proposal_file_text: CanonicalText;
  dropped: {
    touching_region_border: number;
    outside_project_bounds: number;
  };
}
/**
 * One building (bld), water feature (wtr) or land-use area (use). Geometry is EPSG:26917 metres.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "provenance".
 */
export interface Provenance {
  origin_source: SourceId;
  crop_px: CropPx;
  alignment_error_m: number;
  digitising_error_m: number;
  confirmed_by: string;
  confirmed_at: IsoDateTime;
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
 * A link to a feature from another source that shows the same thing. Linking is not merging.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "healthResponse".
 */
export interface HealthResponse {
  api_version: ApiVersion;
  service_version: string;
  data_version: DataVersion;
  label_provider: 'bedrock' | 'none';
  limits: Limits;
  test_mode?: true;
}
/**
 * Per-address hourly limits by endpoint group, and the daily label cap.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "limits".
 */
export interface Limits {
  [k: string]: number;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "imageInfo".
 */
export interface ImageInfo {
  width_px: number;
  height_px: number;
  full_width_px: number;
  full_height_px: number;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "indexPlate".
 */
export interface IndexPlate {
  edition: '1911' | '1935';
  plate: number;
  name: string;
  source_id: SourceId;
  footprint: PolygonGeometry2;
  in_bounds: boolean;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "labelsRequest".
 */
export interface LabelsRequest {
  api_version: ApiVersion;
  plate_ref: PlateRef;
  crop_px: CropPx;
  field: LabelField;
  consent: boolean;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "labelsResponse".
 */
export interface LabelsResponse {
  status: 'proposed' | 'not_legible' | 'unavailable';
  reason?: string;
  provider: 'bedrock' | 'none';
  model_id?: string;
  crop_px: CropPx;
  text?: string;
}
/**
 * data/control/map_area/<source id>.json: a person's statement of where map content is on a plate image. Margins, title blocks, scale bars, north arrows, archive labels and rulers lie outside it. Code never detects it silently.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "matchRequest".
 */
export interface MatchRequest {
  api_version: ApiVersion;
  data_version: DataVersion;
  workspace: WorkspaceState;
  match_decisions: {};
}
/**
 * Every workspace file the overlay needs, as canonical text where the file is exported verbatim.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "workspaceState".
 */
export interface WorkspaceState {
  sources: Source[];
  control_files: CanonicalText[];
  alignment_records: CanonicalText[];
  evidence_files: CanonicalText[];
  tile_sidecars: TileSidecar[];
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "matchResponse".
 */
export interface MatchResponse {
  evidence_files: {
    source: SourceId;
    text: CanonicalText;
  }[];
  review: {}[];
  suggested_for_canon: {}[];
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "platesFetchRequest".
 */
export interface PlatesFetchRequest {
  api_version: ApiVersion;
  source_id: SourceId;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "platesFetchResponse".
 */
export interface PlatesFetchResponse {
  plate_ref: PlateRef;
  source_id: SourceId;
  inspect: {};
  image: ImageInfo;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "platesIndexResponse".
 */
export interface PlatesIndexResponse {
  plates: IndexPlate[];
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "pointGeometry".
 */
export interface PointGeometry {
  type: 'Point';
  coordinates: Position;
}
/**
 * A present-day City of Toronto feature in EPSG:26917 metres. Reference data, not evidence: it carries no observations.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "presentFeature".
 */
export interface PresentFeature {
  type: 'Feature';
  id: string;
  geometry: PointGeometry | PolygonGeometry2 | MultiPolygonGeometry;
  properties: {
    [k: string]: string | number | boolean | null;
  };
}
/**
 * data/present/<source id>.geojson: a present-day layer clipped to the project bounds, in EPSG:26917 metres.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
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
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "proposalFeature".
 */
export interface ProposalFeature {
  type: 'Feature';
  id: string;
  geometry: PolygonGeometry2;
  properties: {
    tone_class: 'light' | 'mid' | 'dark' | 'hatched' | 'mixed';
    /**
     * @minItems 3
     */
    pixel_polygon: [PixelPoint, PixelPoint, PixelPoint, ...PixelPoint[]];
    crop_px: CropPx;
    area_m2: number;
    quality: {
      score: UnitInterval;
      outline_closure: UnitInterval;
      fill_uniformity: UnitInterval;
      text_clear: UnitInterval;
      edge_clear: UnitInterval;
      shape_fidelity: UnitInterval;
    };
    weaknesses: string[];
  };
}
/**
 * What `buried extract` writes (spec 02 design 'Proposal file'), plus region_px when a region was searched.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "proposalFile".
 */
export interface ProposalFile {
  type: 'FeatureCollection';
  crs: 'EPSG:26917';
  source: SourceId;
  params_id: string;
  params_sha256: Sha256;
  alignment_record_sha256: Sha256;
  map_area_sha256: Sha256;
  /**
   * @minItems 3
   */
  map_area_px: [PixelPoint, PixelPoint, PixelPoint, ...PixelPoint[]];
  map_area_geometry: PolygonGeometry2;
  region_px?: PixelRegion;
  features: ProposalFeature[];
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "publishCounts".
 */
export interface PublishCounts {
  accepted: number;
  published_now: number;
  already_published: number;
  rejected: number;
  undecided: number;
  unconfirmed: number;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "publishError".
 */
export interface PublishError {
  path: string;
  feature_id?: string;
  review_item_id?: string;
  pointer: string;
  reason: string;
}
/**
 * In this version of the Service, workspace must be empty (no workspace sources, files or evidence): publishing a workspace source is not built yet. source_id names a canon plate, and the evidence file already in canon for it is the one extended.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "publishRequest".
 */
export interface PublishRequest {
  api_version: ApiVersion;
  data_version: DataVersion;
  dry_run: boolean;
  source_id: SourceId;
  workspace: WorkspaceState;
  proposal_file_text: CanonicalText;
  decisions: DecisionsV2 | DecisionsV1;
}
/**
 * A plate in the canon registry, with what the Studio needs to start on it. plate_ref and raster_available describe the raster the Service holds locally; the Service holds no result of any plate.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "registeredPlate".
 */
export interface RegisteredPlate {
  source: Source;
  /**
   * The published tile's sidecar, or null if the plate has no tile.
   */
  tile_sidecar: TileSidecar | null;
  has_alignment_record: boolean;
  has_map_area: boolean;
  raster_available: boolean;
  plate_ref: PlateRef | null;
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "registeredPlatesResponse".
 */
export interface RegisteredPlatesResponse {
  api_version: ApiVersion;
  data_version: DataVersion;
  plates: RegisteredPlate[];
}
/**
 * data/sources.json.
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "sourceRegistry".
 */
export interface SourceRegistry {
  schema_version: SchemaVersion;
  sources: Source[];
}
/**
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "uploadResponse".
 */
export interface UploadResponse {
  plate_ref: PlateRef;
  georeferenced: boolean;
  inspect: {} | null;
  image: ImageInfo;
}
/**
 * An integer pixel rectangle on a source raster at full resolution (GDAL convention).
 *
 * This interface was referenced by `StudioApi`'s JSON-Schema
 * via the `definition` "pixelRegion".
 */
export interface CropPx2 {
  x: number;
  y: number;
  width: number;
  height: number;
}
