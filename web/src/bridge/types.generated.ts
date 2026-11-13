/* eslint-disable */
/**
 * GENERATED FILE. Do not edit by hand.
 * Source: data/schema/bridge.schema.json. Regenerate with `npm run gen:bridge-types` (from web/).
 * All positions are EPSG:26917 metres, easting first, never longitude/latitude.
 */

/**
 * The Envelope: exactly one of the message definitions below.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "bridgeMessage".
 */
export type BridgeMessage =
  | SceneInitMessage
  | SceneLoadEraMessage
  | SceneAddFeaturesMessage
  | SceneSetDepthMessage
  | SceneFocusLotMessage
  | SceneClearLotMessage
  | SceneSetDrapeModeMessage
  | SceneSetLanternMessage
  | SceneShowEvidenceMessage
  | DebugMarkersMessage
  | DebugSetCameraMessage
  | ReadyMessage
  | EraLoadedMessage
  | FeatureClickedMessage
  | CameraChangedMessage
  | ErrorMessage;
/**
 * Polygon or MultiPolygon.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "polygonalGeometry".
 */
export type PolygonalGeometry = PolygonGeometry | MultiPolygonGeometry;
/**
 * A ring of at least four positions whose first and last positions are equal (checked by both parsers).
 *
 * @minItems 4
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "ring".
 */
export type Ring = [Position, Position, Position, Position, ...Position[]];
/**
 * One position in EPSG:26917 metres: [easting, northing]. Never longitude/latitude: a pair such as [-79.35, 43.65] fails the easting minimum. Exactly two numbers.
 *
 * @minItems 2
 * @maxItems 2
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "position".
 */
export type Position = [number, number];
/**
 * <bld|wtr|use>_<origin source id>_<4 digits>.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "featureId".
 */
export type FeatureId = string;
/**
 * Polygon, MultiPolygon, LineString or MultiLineString, positions only, in EPSG:26917 metres.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "geometry".
 */
export type Geometry =
  PolygonGeometry | MultiPolygonGeometry | LineStringGeometry | MultiLineStringGeometry;
/**
 * A source id, built as in structure.md: lowercase snake_case.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sourceId".
 */
export type SourceId = string;

/**
 * One property per definition in the Bridge Schema.
 */
export interface BridgeSchemaTypes {
  bridgeMessage?: BridgeMessage;
  cameraChangedMessage?: CameraChangedMessage;
  cameraChangedPayload?: CameraChangedPayload;
  cameraPoint?: CameraPoint;
  canvasSize?: CanvasSize;
  debugMarkersMessage?: DebugMarkersMessage;
  debugMarkersPayload?: DebugMarkersPayload;
  debugSetCameraMessage?: DebugSetCameraMessage;
  debugSetCameraPayload?: DebugSetCameraPayload;
  drape?: Drape;
  drapeCorners?: DrapeCorners;
  eraLoadedMessage?: EraLoadedMessage;
  eraLoadedPayload?: EraLoadedPayload;
  eraRef?: EraRef;
  errorMessage?: ErrorMessage;
  errorPayload?: ErrorPayload;
  featureClickedMessage?: FeatureClickedMessage;
  featureClickedPayload?: FeatureClickedPayload;
  featureId?: FeatureId;
  geometry?: Geometry;
  lineStringGeometry?: LineStringGeometry;
  markerEntry?: MarkerEntry;
  multiLineStringGeometry?: MultiLineStringGeometry;
  multiPolygonGeometry?: MultiPolygonGeometry;
  originPoint?: OriginPoint;
  polygonGeometry?: PolygonGeometry;
  polygonalGeometry?: PolygonalGeometry;
  position?: Position;
  presentBuilding?: PresentBuilding;
  readyMessage?: ReadyMessage;
  readyPayload?: ReadyPayload;
  rect?: Rect1;
  ring?: Ring;
  sceneAddFeaturesMessage?: SceneAddFeaturesMessage;
  sceneAddFeaturesPayload?: SceneAddFeaturesPayload;
  sceneBounds?: SceneBounds;
  sceneClearLotMessage?: SceneClearLotMessage;
  sceneClearLotPayload?: SceneClearLotPayload;
  sceneFeature?: SceneFeature;
  sceneFocusLotMessage?: SceneFocusLotMessage;
  sceneFocusLotPayload?: SceneFocusLotPayload;
  sceneInitMessage?: SceneInitMessage;
  sceneInitPayload?: SceneInitPayload;
  sceneLoadEraMessage?: SceneLoadEraMessage;
  sceneLoadEraPayload?: SceneLoadEraPayload;
  sceneSetDepthMessage?: SceneSetDepthMessage;
  sceneSetDepthPayload?: SceneSetDepthPayload;
  sceneSetDrapeModeMessage?: SceneSetDrapeModeMessage;
  sceneSetDrapeModePayload?: SceneSetDrapeModePayload;
  sceneSetLanternMessage?: SceneSetLanternMessage;
  sceneSetLanternPayload?: SceneSetLanternPayload;
  sceneShowEvidenceMessage?: SceneShowEvidenceMessage;
  sceneShowEvidencePayload?: SceneShowEvidencePayload;
  screenPoint?: ScreenPoint1;
  sourceId?: SourceId;
}
/**
 * Shell to Player. Always the first message.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneInitMessage".
 */
export interface SceneInitMessage {
  type: 'scene/init';
  payload: SceneInitPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneInitPayload".
 */
export interface SceneInitPayload {
  bridgeVersion: '0.6.0';
  origin: OriginPoint;
  bounds: SceneBounds;
  initialView: Rect;
  /**
   * At least one era. Indexes are exactly 0 to n-1, each once; 0 is Today.
   *
   * @minItems 1
   * @maxItems 64
   */
  eras: [EraRef, ...EraRef[]];
  /**
   * Today's buildings, each with a fixed display height.
   */
  present: PresentBuilding[];
  reducedMotion: boolean;
  debug: boolean;
}
/**
 * The project origin (E0, N0) in EPSG:26917 metres, read by the Shell from data/project.json.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "originPoint".
 */
export interface OriginPoint {
  easting: number;
  northing: number;
}
/**
 * The project bounds in EPSG:26917 metres. Each corner must be within 4000 m of the origin.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneBounds".
 */
export interface SceneBounds {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}
/**
 * The rectangle the default camera pose frames, centred on the canvas. It lies inside bounds (checked by both parsers).
 */
export interface Rect {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}
/**
 * An era by id and index only. The Player never sees what years an era covers.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "eraRef".
 */
export interface EraRef {
  id: string;
  index: number;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "presentBuilding".
 */
export interface PresentBuilding {
  id: string;
  geometry: PolygonalGeometry;
  heightM: number;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "polygonGeometry".
 */
export interface PolygonGeometry {
  type: 'Polygon';
  /**
   * @minItems 1
   */
  coordinates: [Ring, ...Ring[]];
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "multiPolygonGeometry".
 */
export interface MultiPolygonGeometry {
  type: 'MultiPolygon';
  /**
   * @minItems 1
   */
  coordinates: [[Ring, ...Ring[]], ...[Ring, ...Ring[]][]];
}
/**
 * Shell to Player. Replaces one era's content.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneLoadEraMessage".
 */
export interface SceneLoadEraMessage {
  type: 'scene/loadEra';
  payload: SceneLoadEraPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneLoadEraPayload".
 */
export interface SceneLoadEraPayload {
  eraId: string;
  features: SceneFeature[];
  drapes: Drape[];
}
/**
 * What the Player needs to draw one feature of an era. A building has polygon geometry; water may be any of the four geometry types.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneFeature".
 */
export interface SceneFeature {
  id: FeatureId;
  kind: 'building' | 'water';
  geometry: Geometry;
  confidence: 'documented' | 'estimated' | 'unknown';
  heightM: number;
  /**
   * Optional (bridge 0.5.0). The recorded storey count of a building: the Player draws one line per storey. Absent: no count is recorded and no storey lines are drawn; heightM is the display height either way. Never invented.
   */
  storeys?: number;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
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
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
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
 * A tile from data/tiles/ placed on the ground by its four corners.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "drape".
 */
export interface Drape {
  sourceId: SourceId;
  url: string;
  corners: DrapeCorners;
  widthPx: number;
  heightPx: number;
  clip?: PolygonGeometry1;
  /**
   * Optional (bridge 0.5.0). plate: the lit display tones the greyscale scan toward `ink` paper. aerial: lit but not recoloured. Absent: plate.
   */
  kind?: 'plate' | 'aerial';
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "drapeCorners".
 */
export interface DrapeCorners {
  topLeft: Position;
  topRight: Position;
  bottomRight: Position;
  bottomLeft: Position;
}
/**
 * Optional (bridge 0.3.0). The plate's map area as a closed Polygon in EPSG:26917 metres, from the tile sidecar's map_area. The drape shows only inside it. Absent: the four corners bound the drape.
 */
export interface PolygonGeometry1 {
  type: 'Polygon';
  /**
   * @minItems 1
   */
  coordinates: [Ring, ...Ring[]];
}
/**
 * Shell to Player. Adds features to an era that was already loaded; they rise from the ground (fade only under reduced motion). The Shell sends only features the era does not hold yet.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneAddFeaturesMessage".
 */
export interface SceneAddFeaturesMessage {
  type: 'scene/addFeatures';
  payload: SceneAddFeaturesPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneAddFeaturesPayload".
 */
export interface SceneAddFeaturesPayload {
  eraId: string;
  features: SceneFeature[];
}
/**
 * Shell to Player. Which era is shown.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneSetDepthMessage".
 */
export interface SceneSetDepthMessage {
  type: 'scene/setDepth';
  payload: SceneSetDepthPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneSetDepthPayload".
 */
export interface SceneSetDepthPayload {
  /**
   * 0 is Today. An integer is an era; a fraction is a transition. The Player also refuses a depth past the last era it was told about.
   */
  depth: number;
}
/**
 * Shell to Player (0.5.0; 0.6.0 drops the lamp). Pins a lot: outlined on the ground in `lantern` in every era, the lit map sheet's light pool moves to it, and the camera flies to frame it (eased, 900 ms; a cut under reduced motion). Nothing else marks the lot. A second scene/focusLot replaces the first.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneFocusLotMessage".
 */
export interface SceneFocusLotMessage {
  type: 'scene/focusLot';
  payload: SceneFocusLotPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneFocusLotPayload".
 */
export interface SceneFocusLotPayload {
  /**
   * Polygon or MultiPolygon.
   */
  lot: PolygonGeometry | MultiPolygonGeometry;
}
/**
 * Shell to Player (0.5.0). Unpins the lot and restores the default view (eased, or a cut under reduced motion). With no lot pinned it does nothing.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneClearLotMessage".
 */
export interface SceneClearLotMessage {
  type: 'scene/clearLot';
  payload: SceneClearLotPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneClearLotPayload".
 */
export interface SceneClearLotPayload {}
/**
 * Shell to Player (0.5.0). Switches drapes between the lit display (the default: toned toward `ink` paper under the light pool) and the untouched scan ("view original scan"). Affects the Explorer scene only.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneSetDrapeModeMessage".
 */
export interface SceneSetDrapeModeMessage {
  type: 'scene/setDrapeMode';
  payload: SceneSetDrapeModePayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneSetDrapeModePayload".
 */
export interface SceneSetDrapeModePayload {
  mode: 'lit' | 'original';
  /**
   * A source id, built as in structure.md: lowercase snake_case.
   */
  sourceId?: string;
}
/**
 * Shell to Player (0.6.0). The Lantern: while on, a circular lens at `center` (radius a fraction of the canvas height) shows the era named by eraId (its lit plate and ghosts) inside it and Today outside it, with a thin `ink` ring on its edge. Honoured at Today only; the Shell does not send it at another depth. Off removes the lens. Reduced motion: it appears and disappears without easing.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneSetLanternMessage".
 */
export interface SceneSetLanternMessage {
  type: 'scene/setLantern';
  payload: SceneSetLanternPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneSetLanternPayload".
 */
export interface SceneSetLanternPayload {
  on: boolean;
  center: ScreenPoint;
  /**
   * The lens radius as a fraction of the canvas height.
   */
  radius: number;
  /**
   * The era shown inside the lens. It must be listed in scene/init (else era_not_initialised).
   */
  eraId: string;
}
/**
 * The lens centre in normalised canvas coordinates: x from the left edge, y from the top edge, each 0 to 1.
 */
export interface ScreenPoint {
  x: number;
  y: number;
}
/**
 * Shell to Player (0.6.0). Show Evidence for one ghost: while on, that ghost is nearly transparent with its outline kept, and the given source's untouched scan (never the lit display) is drawn beneath its footprint and a few metres around it, at full opacity. Every other drape keeps its lit look. Off restores the lit sheet. The camera does not move.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneShowEvidenceMessage".
 */
export interface SceneShowEvidenceMessage {
  type: 'scene/showEvidence';
  payload: SceneShowEvidencePayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "sceneShowEvidencePayload".
 */
export interface SceneShowEvidencePayload {
  featureId: FeatureId;
  on: boolean;
  drape?: Drape1;
}
/**
 * A tile from data/tiles/ placed on the ground by its four corners.
 */
export interface Drape1 {
  sourceId: SourceId;
  url: string;
  corners: DrapeCorners;
  widthPx: number;
  heightPx: number;
  clip?: PolygonGeometry1;
  /**
   * Optional (bridge 0.5.0). plate: the lit display tones the greyscale scan toward `ink` paper. aerial: lit but not recoloured. Absent: plate.
   */
  kind?: 'plate' | 'aerial';
}
/**
 * Shell to Player. Only honoured when scene/init had debug: true.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "debugMarkersMessage".
 */
export interface DebugMarkersMessage {
  type: 'debug/markers';
  payload: DebugMarkersPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "debugMarkersPayload".
 */
export interface DebugMarkersPayload {
  /**
   * @maxItems 16
   */
  markers:
    | []
    | [MarkerEntry]
    | [MarkerEntry, MarkerEntry]
    | [MarkerEntry, MarkerEntry, MarkerEntry]
    | [MarkerEntry, MarkerEntry, MarkerEntry, MarkerEntry]
    | [MarkerEntry, MarkerEntry, MarkerEntry, MarkerEntry, MarkerEntry]
    | [MarkerEntry, MarkerEntry, MarkerEntry, MarkerEntry, MarkerEntry, MarkerEntry]
    | [MarkerEntry, MarkerEntry, MarkerEntry, MarkerEntry, MarkerEntry, MarkerEntry, MarkerEntry]
    | [
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry
      ]
    | [
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry
      ]
    | [
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry
      ]
    | [
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry
      ]
    | [
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry
      ]
    | [
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry
      ]
    | [
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry
      ]
    | [
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry
      ]
    | [
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry,
        MarkerEntry
      ];
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "markerEntry".
 */
export interface MarkerEntry {
  id: string;
  position: Position;
}
/**
 * Shell to Player. Sets the camera pose exactly. Only honoured when scene/init had debug: true; otherwise refused with debug_disabled.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "debugSetCameraMessage".
 */
export interface DebugSetCameraMessage {
  type: 'debug/setCamera';
  payload: DebugSetCameraPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "debugSetCameraPayload".
 */
export interface DebugSetCameraPayload {
  target: Position;
  distanceM: number;
  pitchDeg: number;
  headingDeg: number;
}
/**
 * Player to Shell. Sent once, after the first rendered frame.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "readyMessage".
 */
export interface ReadyMessage {
  type: 'ready';
  payload: ReadyPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "readyPayload".
 */
export interface ReadyPayload {
  bridgeVersion: '0.6.0';
  unityVersion: string;
}
/**
 * Player to Shell. An era's meshes are built and its drape textures have loaded or failed.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "eraLoadedMessage".
 */
export interface EraLoadedMessage {
  type: 'eraLoaded';
  payload: EraLoadedPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "eraLoadedPayload".
 */
export interface EraLoadedPayload {
  eraId: string;
  featureCount: number;
  drapeCount: number;
  failedDrapes: SourceId[];
}
/**
 * Player to Shell. A click on a drawn feature.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "featureClickedMessage".
 */
export interface FeatureClickedMessage {
  type: 'featureClicked';
  payload: FeatureClickedPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "featureClickedPayload".
 */
export interface FeatureClickedPayload {
  featureId: FeatureId;
  eraId: string;
}
/**
 * Player to Shell. The camera pose, at most 10 times a second while it moves, once when it stops, after scene/init, and after every scene/setDepth.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "cameraChangedMessage".
 */
export interface CameraChangedMessage {
  type: 'cameraChanged';
  payload: CameraChangedPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "cameraChangedPayload".
 */
export interface CameraChangedPayload {
  eye: CameraPoint;
  target: CameraPoint;
  /**
   * Vertical field of view in degrees.
   */
  fovDeg: number;
  /**
   * Projection times view, 16 numbers, column-major: element (row r, column c) is at index c * 4 + r. Unity world space (x east, y up, z north), OpenGL clip conventions: x and y of clip / w run from -1 (left, bottom) to 1 (right, top).
   *
   * @minItems 16
   * @maxItems 16
   */
  viewProjection: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number
  ];
  canvas: CanvasSize;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "cameraPoint".
 */
export interface CameraPoint {
  easting: number;
  northing: number;
  heightM: number;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "canvasSize".
 */
export interface CanvasSize {
  widthPx: number;
  heightPx: number;
}
/**
 * Player to Shell. A refusal or a failure.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "errorMessage".
 */
export interface ErrorMessage {
  type: 'error';
  payload: ErrorPayload;
}
/**
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "errorPayload".
 */
export interface ErrorPayload {
  code:
    | 'invalid_message'
    | 'unknown_type'
    | 'bridge_version_mismatch'
    | 'bounds_too_far'
    | 'era_not_initialised'
    | 'texture_load_failed'
    | 'mesh_build_failed'
    | 'debug_disabled';
  message: string;
  messageType: string | null;
}
/**
 * An axis-aligned rectangle in EPSG:26917 metres. minE < maxE and minN < maxN (checked by both parsers).
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "rect".
 */
export interface Rect1 {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}
/**
 * A point on the canvas in normalised coordinates: x from the left edge, y from the top edge, each 0 to 1.
 *
 * This interface was referenced by `BridgeSchemaTypes`'s JSON-Schema
 * via the `definition` "screenPoint".
 */
export interface ScreenPoint1 {
  x: number;
  y: number;
}
