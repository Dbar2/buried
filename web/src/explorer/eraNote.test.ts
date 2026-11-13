import { describe, expect, it } from 'vitest';
import type { Drape } from './drapes';
import { noImageryNote } from './eraNote';

const aerial: Drape = {
  sourceId: 'aerial_1947_x',
  url: '/data/tiles/aerial_1947_x.jpg',
  corners: { topLeft: [0, 1], topRight: [1, 1], bottomRight: [1, 0], bottomLeft: [0, 0] },
  widthPx: 10,
  heightPx: 10,
};

describe('noImageryNote', () => {
  it('names an empty past era plainly', () => {
    expect(noImageryNote({ index: 1, label: '1947' }, { features: [] }, [])).toBe('No 1947 imagery loaded yet');
    expect(noImageryNote({ index: 1, label: '1947' }, undefined, undefined)).toBe('No 1947 imagery loaded yet');
  });

  it('says nothing about Today or an era with a drape or a feature', () => {
    expect(noImageryNote({ index: 0, label: 'Today' }, { features: [] }, [])).toBeNull();
    expect(noImageryNote({ index: 1, label: '1947' }, { features: [] }, [aerial])).toBeNull();
    expect(noImageryNote({ index: 2, label: '1935' }, { features: [{} as never] }, [])).toBeNull();
    expect(noImageryNote(undefined, { features: [] }, [])).toBeNull();
  });
});
