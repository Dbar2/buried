/**
 * The three ground control points the gate test checks (spec 03 design.md "Gate verification", step 2).
 *
 * Pick three control points of the first file whose `reference_feature_id` also appears in the second
 * file (the same intersection on both plates). If fewer than three are shared, use the first three of
 * the first file. The marker's id is the control point's id and its position is the `reference`
 * coordinate, EPSG:26917 metres, copied unchanged.
 *
 * The Shell sends these as debug markers when the page is opened with ?debug=1, and the Playwright
 * test calls this same function on the files from disk to check what was sent.
 */
import type { ControlPoints } from '../evidence';

export type GateMarker = { id: string; position: [number, number] };

export function pickGateMarkers(first: ControlPoints, second?: ControlPoints): GateMarker[] {
  const inSecond = new Set((second?.points ?? []).map((p) => p.reference_feature_id));
  const shared = first.points.filter((p) => inSecond.has(p.reference_feature_id));
  const chosen = shared.length >= 3 ? shared.slice(0, 3) : first.points.slice(0, 3);
  return chosen.map((p) => ({ id: p.id, position: [p.reference[0], p.reference[1]] }));
}
