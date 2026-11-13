/**
 * Finding radii in metres (spec 05 design "Finding radii"). Screening distances chosen for a dense
 * block of narrow lots, not measured values. Changing one is a reviewed change to the design.
 */
/** Buildings: the lot and its immediate neighbours' edges. */
export const STRUCTURE_RADIUS_M = 10;
/** Uses: roughly the neighbouring lots and the street in front. */
export const LAND_USE_RADIUS_M = 30;
/** Water: past water near a lot is worth a question. */
export const WATER_RADIUS_M = 100;

export type GroupId = 'water' | 'land_use' | 'structures';

export const RADIUS_M: Record<GroupId, number> = {
  water: WATER_RADIUS_M,
  land_use: LAND_USE_RADIUS_M,
  structures: STRUCTURE_RADIUS_M,
};
