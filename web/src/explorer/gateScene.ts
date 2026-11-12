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

type InitPayload = MessageOf<'scene/init'>['payload'];

export function buildSceneInit(
  project: Project,
  order: readonly EraInfo[],
  flags: { reducedMotion: boolean; debug: boolean },
): MessageOf<'scene/init'> {
  const { origin, bounds } = project;
  return {
    type: 'scene/init',
    payload: {
      bridgeVersion: BRIDGE_VERSION as InitPayload['bridgeVersion'],
      origin: { easting: origin.easting, northing: origin.northing },
      bounds: { minE: bounds.min_e, minN: bounds.min_n, maxE: bounds.max_e, maxN: bounds.max_n },
      eras: eraRefs(order),
      // Today's buildings are drawn from task group 3 on.
      present: [],
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

export function buildMarkers(markers: readonly GateMarker[]): MessageOf<'debug/markers'> {
  return { type: 'debug/markers', payload: { markers: markers.map((m) => ({ id: m.id, position: m.position })) } };
}
