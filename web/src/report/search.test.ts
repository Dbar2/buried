import { describe, expect, it } from 'vitest';
import type { PresentLayer } from '../evidence';
import { searchAddresses } from './search';

const layer = (addresses: string[]): PresentLayer =>
  ({
    features: addresses.map((a, i) => ({ id: String(i + 1), geometry: { type: 'Point', coordinates: [i, i] }, properties: { ADDRESS_FULL: a } })),
  }) as unknown as PresentLayer;

describe('searchAddresses ranking', () => {
  const l = layer(['112 Eastern Ave', '12 Eastern Ave', '120 Eastern Ave', 'Rear 12 Eastern Ave']);

  it('puts an exact match first, then prefix matches, then the rest', () => {
    expect(searchAddresses(l, '12 Eastern Ave').map((h) => h.text)).toEqual(['12 Eastern Ave', '112 Eastern Ave', 'Rear 12 Eastern Ave']);
    expect(searchAddresses(l, '12').map((h) => h.text)).toEqual(['12 Eastern Ave', '120 Eastern Ave', '112 Eastern Ave', 'Rear 12 Eastern Ave']);
  });

  it('ignores case and surrounding space in the query', () => {
    expect(searchAddresses(l, '  12 EASTERN ave ')[0]!.text).toBe('12 Eastern Ave');
  });

  it('needs two characters and a layer', () => {
    expect(searchAddresses(l, '1')).toEqual([]);
    expect(searchAddresses(undefined, '12 Eastern')).toEqual([]);
  });
});
