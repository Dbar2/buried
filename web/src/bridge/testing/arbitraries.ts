/**
 * fast-check generators for every bridge message in the gate subset. They produce messages that are
 * valid under the Bridge Schema and the semantic rules (closed rings, unique ids, era indexes 0 to
 * n-1). The same generators, with a fixed seed, write data/schema/bridge_fixtures/generated/ for the
 * Player's EditMode tests (web/scripts/genBridgeSamples.ts), so both sides parse the same messages.
 *
 * Numbers are whole multiples of 0.001 so they survive a JSON round trip exactly in both languages,
 * and never -0.
 */
import fc from 'fast-check';
import { ALL_MESSAGE_TYPES, BRIDGE_VERSION } from '../bridge';
import type { MessageType } from '../bridge';
import type { BridgeMessage } from '../types.generated';

type Arb<T> = fc.Arbitrary<T>;

const milli = (min: number, max: number): Arb<number> =>
  fc.integer({ min: Math.round(min * 1000), max: Math.round(max * 1000) }).map((i) => (i === 0 ? 0 : i / 1000));

const easting = milli(166000, 834000);
const northing = milli(0, 9400000);
const positionArb: Arb<[number, number]> = fc.tuple(easting, northing);

const toMilli = (i: number): number => (i === 0 ? 0 : i / 1000);
/** An interval [min, max] with min < max, in whole millimetres, inside [lo, hi] (metres). */
const intervalIn = (lo: number, hi: number): Arb<[number, number]> =>
  fc
    .tuple(fc.integer({ min: Math.round(lo * 1000), max: Math.round(hi * 1000) - 1 }), fc.integer({ min: 1, max: 1_000_000 }))
    .map(([a, w]) => [a, Math.min(a + w, Math.round(hi * 1000))] as [number, number])
    .map(([a, b]) => [toMilli(a), toMilli(b)] as [number, number]);
const subInterval = (outer: [number, number]): Arb<[number, number]> =>
  fc
    .tuple(fc.integer({ min: Math.round(outer[0] * 1000), max: Math.round(outer[1] * 1000) - 1 }), fc.integer({ min: 1, max: 1_000_000 }))
    .map(([a, w]) => [toMilli(a), toMilli(Math.min(a + w, Math.round(outer[1] * 1000)))] as [number, number]);

/** bounds and an initialView inside it, both with min < max. */
const boundsAndViewArb = fc
  .tuple(intervalIn(166000, 834000), intervalIn(0, 9400000))
  .chain(([e, n]) =>
    fc.tuple(subInterval(e), subInterval(n)).map(([ve, vn]) => ({
      bounds: { minE: e[0], minN: n[0], maxE: e[1], maxN: n[1] },
      initialView: { minE: ve[0], minN: vn[0], maxE: ve[1], maxN: vn[1] },
    })),
  );

const idPart = fc.stringMatching(/^[a-z0-9]{1,6}$/);
/** A source id or era id: lowercase snake_case. */
export const sourceIdArb: Arb<string> = fc.array(idPart, { minLength: 1, maxLength: 4 }).map((parts) => parts.join('_'));
export const eraIdArb = sourceIdArb;
export const featureIdArb: Arb<string> = fc
  .tuple(fc.constantFrom('bld', 'wtr', 'use'), sourceIdArb, fc.integer({ min: 0, max: 9999 }))
  .map(([kind, source, n]) => `${kind}_${source}_${String(n).padStart(4, '0')}`);

const heightArb = milli(0.001, 1000);
const ringArb: Arb<[number, number][]> = fc
  .array(positionArb, { minLength: 3, maxLength: 6 })
  .map((points) => [...points, points[0] as [number, number]]);
const polygonCoordinates = fc.array(ringArb, { minLength: 1, maxLength: 2 });
const lineArb = fc.array(positionArb, { minLength: 2, maxLength: 5 });

const polygonGeometry = polygonCoordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
const multiPolygonGeometry = fc
  .array(polygonCoordinates, { minLength: 1, maxLength: 2 })
  .map((coordinates) => ({ type: 'MultiPolygon', coordinates }));
const lineStringGeometry = lineArb.map((coordinates) => ({ type: 'LineString', coordinates }));
const multiLineStringGeometry = fc
  .array(lineArb, { minLength: 1, maxLength: 2 })
  .map((coordinates) => ({ type: 'MultiLineString', coordinates }));

const polygonalGeometry = fc.oneof(polygonGeometry, multiPolygonGeometry);
const anyGeometry = fc.oneof(polygonGeometry, multiPolygonGeometry, lineStringGeometry, multiLineStringGeometry);

const confidenceArb = fc.constantFrom('documented', 'estimated', 'unknown');
/** The recorded storey count, present about half the time (bridge 0.5.0). */
const storeysArb = fc.option(fc.integer({ min: 1, max: 100 }), { nil: undefined });

const sceneFeatureArb = fc
  .tuple(
    fc.oneof(
      fc.record({ id: featureIdArb, kind: fc.constant('building'), geometry: polygonalGeometry, confidence: confidenceArb, heightM: heightArb }),
      fc.record({ id: featureIdArb, kind: fc.constant('land_use'), geometry: polygonalGeometry, confidence: confidenceArb, heightM: heightArb }),
      fc.record({ id: featureIdArb, kind: fc.constant('water'), geometry: anyGeometry, confidence: confidenceArb, heightM: heightArb }),
    ),
    storeysArb,
  )
  .map(([feature, storeys]) => (storeys === undefined ? feature : { ...feature, storeys }));

const tileUrl = sourceIdArb.map((id) => `/data/tiles/${id}.jpg`);
const drapeBaseArb = fc.record({
  sourceId: sourceIdArb,
  url: tileUrl,
  corners: fc.record({
    topLeft: positionArb,
    topRight: positionArb,
    bottomRight: positionArb,
    bottomLeft: positionArb,
  }),
  widthPx: fc.integer({ min: 1, max: 16384 }),
  heightPx: fc.integer({ min: 1, max: 16384 }),
});
/** A drape, with a clip polygon about half the time (bridge 0.3.0) and a kind about half the time (0.5.0). */
const drapeArb = fc
  .tuple(drapeBaseArb, fc.option(polygonGeometry, { nil: undefined }), fc.option(fc.constantFrom('plate', 'aerial'), { nil: undefined }))
  .map(([drape, clip, kind]) => ({ ...drape, ...(clip ? { clip } : {}), ...(kind ? { kind } : {}) }));

const eraRefsArb = fc.integer({ min: 1, max: 6 }).chain((n) =>
  fc
    .tuple(
      fc.uniqueArray(eraIdArb, { minLength: n, maxLength: n }),
      fc.shuffledSubarray(Array.from({ length: n }, (_, i) => i), { minLength: n, maxLength: n }),
    )
    .map(([ids, indexes]) => ids.map((id, i) => ({ id, index: indexes[i] as number }))),
);

const presentBuildingArb = fc.record({
  id: fc.stringMatching(/^[a-z0-9_]{1,12}$/),
  geometry: polygonalGeometry,
  heightM: heightArb,
});

const message = (type: MessageType, payload: Arb<unknown>): Arb<BridgeMessage> =>
  payload.map((p) => ({ type, payload: p }) as unknown as BridgeMessage);

export const messageArbitraries: Readonly<Record<MessageType, Arb<BridgeMessage>>> = {
  'scene/init': message(
    'scene/init',
    fc
      .record({
        bridgeVersion: fc.constant(BRIDGE_VERSION),
        origin: fc.record({ easting, northing }),
        view: boundsAndViewArb,
        eras: eraRefsArb,
        present: fc.uniqueArray(presentBuildingArb, { selector: (b) => b.id, maxLength: 3 }),
        reducedMotion: fc.boolean(),
        debug: fc.boolean(),
      })
      .map(({ view, ...rest }) => ({
        bridgeVersion: rest.bridgeVersion,
        origin: rest.origin,
        bounds: view.bounds,
        initialView: view.initialView,
        eras: rest.eras,
        present: rest.present,
        reducedMotion: rest.reducedMotion,
        debug: rest.debug,
      })),
  ),
  'scene/loadEra': message(
    'scene/loadEra',
    fc.record({
      eraId: eraIdArb,
      features: fc.uniqueArray(sceneFeatureArb, { selector: (f) => f.id, maxLength: 4 }),
      drapes: fc.uniqueArray(drapeArb, { selector: (d) => d.sourceId, maxLength: 2 }),
    }),
  ),
  'scene/addFeatures': message(
    'scene/addFeatures',
    fc.record({
      eraId: eraIdArb,
      features: fc.uniqueArray(sceneFeatureArb, { selector: (f) => f.id, maxLength: 4 }),
    }),
  ),
  'scene/setDepth': message('scene/setDepth', fc.record({ depth: milli(0, 64) })),
  'scene/focusLot': message('scene/focusLot', fc.record({ lot: polygonalGeometry })),
  'scene/clearLot': message('scene/clearLot', fc.constant({})),
  'scene/setDrapeMode': message(
    'scene/setDrapeMode',
    fc
      .tuple(fc.constantFrom('lit', 'original'), fc.option(sourceIdArb, { nil: undefined }))
      .map(([mode, sourceId]) => (sourceId === undefined ? { mode } : { mode, sourceId })),
  ),
  'scene/setLantern': message(
    'scene/setLantern',
    fc.record({
      on: fc.boolean(),
      center: fc.record({ x: milli(0, 1), y: milli(0, 1) }),
      radius: milli(0.05, 0.5),
      eraId: eraIdArb,
    }),
  ),
  'scene/showEvidence': message(
    'scene/showEvidence',
    fc.oneof(
      fc.record({ featureId: featureIdArb, on: fc.constant(true), drape: drapeArb }),
      fc.record({ featureId: featureIdArb, on: fc.constant(false) }),
    ),
  ),
  'scene/setAnchors': message(
    'scene/setAnchors',
    fc.record({ feature_ids: fc.uniqueArray(featureIdArb, { maxLength: 5 }) }),
  ),
  'scene/anchors': message(
    'scene/anchors',
    fc.record({
      width: milli(0.001, 16384),
      height: milli(0.001, 16384),
      anchors: fc.uniqueArray(
        fc.record({ feature_id: featureIdArb, x: milli(-100000, 100000), y: milli(-100000, 100000), on_screen: fc.boolean() }),
        { selector: (a) => a.feature_id, maxLength: 5 },
      ),
    }),
  ),
  'scene/raise': message(
    'scene/raise',
    fc.record({ era_id: eraIdArb, first_feature_id: featureIdArb, animate: fc.boolean() }),
  ),
  'scene/raised': message('scene/raised', fc.record({ era_id: eraIdArb })),
  'scene/frameFeature': message('scene/frameFeature', fc.record({ feature_id: featureIdArb })),
  'debug/markers': message(
    'debug/markers',
    fc.record({
      markers: fc.uniqueArray(
        fc.record({ id: fc.stringMatching(/^[a-z0-9_]{1,10}$/), position: positionArb }),
        { selector: (m) => m.id, maxLength: 16 },
      ),
    }),
  ),
  'debug/setCamera': message(
    'debug/setCamera',
    fc.record({
      target: positionArb,
      distanceM: milli(30, 3000),
      pitchDeg: milli(20, 80),
      headingDeg: milli(0, 359.999),
    }),
  ),
  ready: message(
    'ready',
    fc.record({ bridgeVersion: fc.constant(BRIDGE_VERSION), unityVersion: fc.stringMatching(/^[0-9a-z.]{1,12}$/) }),
  ),
  eraLoaded: message(
    'eraLoaded',
    fc.record({
      eraId: eraIdArb,
      featureCount: fc.integer({ min: 0, max: 5000 }),
      drapeCount: fc.integer({ min: 0, max: 20 }),
      failedDrapes: fc.array(sourceIdArb, { maxLength: 3 }),
    }),
  ),
  featureClicked: message('featureClicked', fc.record({ featureId: featureIdArb, eraId: eraIdArb })),
  cameraChanged: message(
    'cameraChanged',
    fc.record({
      eye: fc.record({ easting, northing, heightM: milli(-1000, 100000) }),
      target: fc.record({ easting, northing, heightM: milli(-1000, 100000) }),
      fovDeg: milli(0.001, 179.999),
      viewProjection: fc.array(milli(-10000, 10000), { minLength: 16, maxLength: 16 }),
      canvas: fc.record({ widthPx: fc.integer({ min: 1, max: 16384 }), heightPx: fc.integer({ min: 1, max: 16384 }) }),
    }),
  ),
  error: message(
    'error',
    fc.record({
      code: fc.constantFrom(
        'invalid_message',
        'unknown_type',
        'bridge_version_mismatch',
        'bounds_too_far',
        'era_not_initialised',
        'texture_load_failed',
        'mesh_build_failed',
        'debug_disabled',
      ),
      message: fc.stringMatching(/^[ -~]{0,40}$/),
      messageType: fc.option(fc.constantFrom(...ALL_MESSAGE_TYPES), { nil: null }),
    }),
  ),
};

/** Any message of any type. */
export const anyMessage: Arb<BridgeMessage> = fc.oneof(...Object.values(messageArbitraries));
