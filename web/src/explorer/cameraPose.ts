/**
 * The camera pose a debug-only form can send as `debug/setCamera` (spec 03 task 17.4, design.md
 * "Drape placement check"). Pure. The form exists only with ?debug=1; the Player refuses the message
 * without debug anyway. Positions are EPSG:26917 metres, easting first.
 */
export type CameraPose = {
  target: [number, number];
  distanceM: number;
  pitchDeg: number;
  headingDeg: number;
};

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A pose from text like {"target":[632500,4835000],"distanceM":170,"pitchDeg":80,"headingDeg":0}, or null. */
export function parseCameraPose(text: string): CameraPose | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v).sort();
  if (keys.join(',') !== 'distanceM,headingDeg,pitchDeg,target') return null;
  const target = v.target;
  if (!Array.isArray(target) || target.length !== 2 || !finite(target[0]) || !finite(target[1])) return null;
  if (!finite(v.distanceM) || !(v.distanceM > 0)) return null;
  if (!finite(v.pitchDeg) || v.pitchDeg < 0 || v.pitchDeg > 90) return null;
  if (!finite(v.headingDeg)) return null;
  return { target: [target[0], target[1]], distanceM: v.distanceM, pitchDeg: v.pitchDeg, headingDeg: v.headingDeg };
}
