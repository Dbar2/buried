import type { CoverageArea } from './types.generated';

export type CoverageKind = 'building' | 'water' | 'land_use';

/**
 * The kinds of feature a reviewed area attests are all published inside it (spec 01
 * requirements 28.2 and 28.3). An area without `covers` attests buildings only. Returns a new
 * array in the order the file gives, so callers cannot change the area by changing the result.
 */
export function reviewedAreaCovers(area: Pick<CoverageArea, 'covers'>): CoverageKind[] {
  return area.covers === undefined ? ['building'] : [...area.covers];
}
