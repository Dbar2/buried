/**
 * The extraction region (spec 04 design "Extract"): a rectangle of plate pixels inside the map area,
 * at most 300 m on a side (the Service refuses more; the limit is shown here so the person knows
 * before asking). Pure.
 */
import type { Rect } from '../plate/plateView';

export const MAX_REGION_SIDE_M = 300;
/** The default region stays a little under the limit so rounding never tips it over. */
export const DEFAULT_REGION_SIDE_M = 295;

export function regionSizeM(region: Rect, pixelSizeM: number): { width: number; height: number } {
  return { width: region.width * pixelSizeM, height: region.height * pixelSizeM };
}

/** Why the region cannot be used, or null. */
export function regionProblem(region: Rect, pixelSizeM: number): string | null {
  const { width, height } = regionSizeM(region, pixelSizeM);
  const longest = Math.max(width, height);
  if (longest > MAX_REGION_SIDE_M) {
    return `The region is ${Math.round(longest)} m on a side. The limit is ${MAX_REGION_SIDE_M} m, so choose a smaller one.`;
  }
  return null;
}

/** The largest default region inside the map area's crop, centred on it. */
export function defaultRegion(crop: Rect, pixelSizeM: number): Rect {
  const side = Math.floor(DEFAULT_REGION_SIDE_M / pixelSizeM);
  const width = Math.min(crop.width, side);
  const height = Math.min(crop.height, side);
  return {
    x: crop.x + Math.floor((crop.width - width) / 2),
    y: crop.y + Math.floor((crop.height - height) / 2),
    width,
    height,
  };
}

/** The proposals to draw per 40 ms tick so that the whole draw-on takes at most two seconds. */
export function drawStep(count: number): number {
  return Math.max(1, Math.ceil(count / 50));
}
