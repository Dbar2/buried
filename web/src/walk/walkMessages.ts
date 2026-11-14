/**
 * The walk test's bridge messages (bridge 0.9.0, spec 07). Pure: no bridge, no DOM. Property names are snake_case as the
 * Schema writes them (`reduced_motion`, `yaw_deg`). East and north are project-local metres, the frame of the manifest.
 */
import type { MessageOf } from '../bridge/bridge';

/** `walk/enter`: build the corner and put the visitor at the spawn point. */
export function buildWalkEnter(reducedMotion: boolean): MessageOf<'walk/enter'> {
  return { type: 'walk/enter', payload: { reduced_motion: reducedMotion } };
}

/** `walk/resume`: the exhibit panel was closed. */
export function buildWalkResume(): MessageOf<'walk/resume'> {
  return { type: 'walk/resume', payload: {} };
}

/** `walk/exit`: leave the walk. */
export function buildWalkExit(): MessageOf<'walk/exit'> {
  return { type: 'walk/exit', payload: {} };
}

/** `walk/teleport` (tests only, behind `?debug=1`): the heading is wrapped into [0, 360). */
export function buildWalkTeleport(east: number, north: number, yawDeg: number): MessageOf<'walk/teleport'> {
  const yaw = ((yawDeg % 360) + 360) % 360;
  return { type: 'walk/teleport', payload: { east, north, yaw_deg: yaw >= 360 ? 0 : yaw } };
}
