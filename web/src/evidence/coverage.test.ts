import { describe, expect, it } from 'vitest';
import { reviewedAreaCovers } from './coverage';
import type { CoverageArea } from './types.generated';

const base: CoverageArea = {
  geometry: {
    type: 'Polygon',
    coordinates: [[[500000, 4000000], [500010, 4000000], [500010, 4000010], [500000, 4000000]]],
  },
  method: 'person',
};

describe('reviewedAreaCovers (requirement 28.2)', () => {
  it('reads an area without covers as buildings only', () => {
    expect(reviewedAreaCovers(base)).toEqual(['building']);
  });

  it('returns the kinds the area names, in the order given', () => {
    expect(reviewedAreaCovers({ ...base, covers: ['water', 'building'] })).toEqual(['water', 'building']);
    expect(reviewedAreaCovers({ ...base, covers: ['building', 'water', 'land_use'] })).toEqual([
      'building',
      'water',
      'land_use',
    ]);
  });

  it('does not let a caller change the area through the result', () => {
    const area: CoverageArea = { ...base, covers: ['water'] };
    reviewedAreaCovers(area).push('building');
    expect(area.covers).toEqual(['water']);
    const plain = reviewedAreaCovers(base);
    plain.push('water');
    expect(reviewedAreaCovers(base)).toEqual(['building']);
  });
});
