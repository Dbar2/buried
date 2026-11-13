/**
 * Builds the bridge messages the gate sends. Pure: no bridge, no DOM. Every message that carries
 * features takes them from an Era list (featuresForEra) through toSceneFeature, so the Player is
 * never sent a feature outside its evidence window (spec 03 requirements 6.2 and 6.3).
 */
import type { MessageOf } from '../bridge/bridge';
import { BRIDGE_VERSION } from '../bridge/bridge';
import type { EraFeatureList, Project } from '../evidence';
import type { Drape } from './drapes';
import type { EraInfo } from './eraOrder';
import { eraRefs } from './eraOrder';
import type { GateMarker } from './gateMarkers';
import { sceneFeaturesFor } from './sceneFeatures';
import type { Rect } from './initialView';
import type { PresentBuilding } from './presentBuildings';

type InitPayload = MessageOf<'scene/init'>['payload'];

export function buildSceneInit(
  project: Project,
  order: readonly EraInfo[],
  view: Rect,
  present: readonly PresentBuilding[],
  flags: { reducedMotion: boolean; debug: boolean },
): MessageOf<'scene/init'> {
  const { origin, bounds } = project;
  return {
    type: 'scene/init',
    payload: {
      bridgeVersion: BRIDGE_VERSION as InitPayload['bridgeVersion'],
      origin: { easting: origin.easting, northing: origin.northing },
      bounds: { minE: bounds.min_e, minN: bounds.min_n, maxE: bounds.max_e, maxN: bounds.max_n },
      initialView: { minE: view.minE, minN: view.minN, maxE: view.maxE, maxN: view.maxN },
      // The type says "at least one"; serialiseMessage enforces it (and the 64 limit) with the Schema.
      eras: eraRefs(order) as InitPayload['eras'],
      present: [...present],
      reducedMotion: flags.reducedMotion,
      debug: flags.debug,
    },
  };
}

export function buildLoadEra(era: Pick<EraInfo, 'id'>, list: EraFeatureList, drapes: readonly Drape[]): MessageOf<'scene/loadEra'> {
  return {
    type: 'scene/loadEra',
    payload: { eraId: era.id, features: sceneFeaturesFor(list), drapes: [...drapes] },
  };
}

export function buildSetDepth(depth: number): MessageOf<'scene/setDepth'> {
  return { type: 'scene/setDepth', payload: { depth } };
}

/** debug/setCamera, for the look and drape placement tests. The Player refuses it without debug. */
export function buildSetCamera(pose: {
  target: readonly [number, number];
  distanceM: number;
  pitchDeg: number;
  headingDeg: number;
}): MessageOf<'debug/setCamera'> {
  return {
    type: 'debug/setCamera',
    payload: {
      target: [pose.target[0], pose.target[1]],
      distanceM: pose.distanceM,
      pitchDeg: pose.pitchDeg,
      headingDeg: pose.headingDeg,
    },
  };
}

export function buildMarkers(markers: readonly GateMarker[]): MessageOf<'debug/markers'> {
  // The generated type is a tuple union up to 16 entries; the Schema's maxItems check runs at send.
  const entries = markers.map((m) => ({ id: m.id, position: m.position })) as MessageOf<'debug/markers'>['payload']['markers'];
  return { type: 'debug/markers', payload: { markers: entries } };
}
