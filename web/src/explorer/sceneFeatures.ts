/**
 * Scene features: the part of an Era list entry the Player needs to draw it (spec 03 requirement
 * 6.4, design.md "Scene features and heights"). One function copies id, kind, geometry and
 * confidence unchanged and adds a display height. Dates, phrases and sources stay in the Shell.
 */
import type { PayloadOf } from '../bridge/bridge';
import type { EraFeature, EraFeatureList } from '../evidence';

export type SceneFeature = PayloadOf<'scene/loadEra'>['features'][number];

/** Display height per recorded storey. */
export const STOREY_HEIGHT_M = 3.5;
/** A building with no recorded storeys is drawn one storey high. */
export const UNRECORDED_HEIGHT_M = 3.5;
/** A water line is drawn at least this wide, and as wide as twice its position error. */
export const WATER_RIBBON_MIN_M = 2.0;
/**
 * A land-use area is drawn as a flat sheet on the ground (bridge 0.7.0, session 034). The Schema asks for a
 * `heightM` above 0, so the Shell sends this thickness in metres; the Player draws the sheet flat whatever it is sent.
 */
export const AREA_SHEET_M = 0.05;

/** The scene feature for an Era list entry: a building, water, or (bridge 0.7.0) a land-use area drawn flat. */
export function toSceneFeature(entry: EraFeature): SceneFeature {
  let heightM: number;
  if (entry.kind === 'building') {
    heightM = entry.attributes.storeys !== undefined ? entry.attributes.storeys * STOREY_HEIGHT_M : UNRECORDED_HEIGHT_M;
  } else if (entry.kind === 'land_use') {
    heightM = AREA_SHEET_M;
  } else {
    heightM = Math.max(WATER_RIBBON_MIN_M, 2 * entry.positionErrorM);
  }
  const feature: SceneFeature = {
    id: entry.id,
    kind: entry.kind,
    geometry: entry.geometry as SceneFeature['geometry'],
    confidence: entry.confidence,
    heightM,
  };
  // Bridge 0.5.0: a recorded storey count goes with the building so the Player draws one line per
  // storey. Never a count that was not recorded (an unrecorded building has none and no lines).
  if (entry.kind === 'building') {
    const storeys = entry.attributes.storeys;
    if (storeys !== undefined && Number.isInteger(storeys) && storeys >= 1 && storeys <= 100) feature.storeys = storeys;
  }
  return feature;
}

/** Every scene feature of an Era list, in the list's order. */
export function sceneFeaturesFor(list: EraFeatureList): SceneFeature[] {
  return list.features.map(toSceneFeature);
}
