import { describe, expect, it } from 'vitest';
import { placeLink, routeFor } from './placeLink';

describe('routeFor', () => {
  it('opens the landing at / with no query and the Explorer when the link carries one', () => {
    expect(routeFor('/', '')).toBe('landing');
    expect(routeFor('/', '?')).toBe('landing');
    expect(routeFor('/', '?era=1911&debug=1')).toBe('explorer');
    expect(routeFor('/explorer', '')).toBe('explorer');
  });

  it('knows the other pages, with or without a trailing slash', () => {
    expect(routeFor('/place', '?lot=x')).toBe('place');
    expect(routeFor('/report/', '?lot=x')).toBe('report');
    expect(routeFor('/studio', '')).toBe('studio');
    expect(routeFor('/sources', '')).toBe('sources');
  });
});

describe('placeLink', () => {
  it('names the lot and, when asked, the era, and encodes both', () => {
    expect(placeLink('a b')).toBe('/place?lot=a%20b');
    expect(placeLink('lot_1', '1911')).toBe('/place?lot=lot_1&era=1911');
  });
});
