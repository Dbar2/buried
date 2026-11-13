import { describe, expect, it } from 'vitest';
import { findSlugFor, placeLink, routeFor } from './placeLink';

describe('routeFor', () => {
  it('opens the block page at / with no query and at /find/<slug>', () => {
    expect(routeFor('/', '')).toBe('block');
    expect(routeFor('/', '?')).toBe('block');
    expect(routeFor('/find/overall-factory', '')).toBe('block');
    expect(routeFor('/find/overall-factory/', '')).toBe('block');
    expect(routeFor('/find/bank', '?utm=x')).toBe('block');
  });

  it('opens the Explorer for / with any Explorer query, and at /explorer', () => {
    expect(routeFor('/', '?era=1911&debug=1')).toBe('explorer');
    expect(routeFor('/', '?lot=abc')).toBe('explorer');
    expect(routeFor('/', '?lanternEra=1935')).toBe('explorer');
    expect(routeFor('/', '?showEvidence=bld_fip_v3_1911_229_0001')).toBe('explorer');
    expect(routeFor('/', '?markers=0&debug=1')).toBe('explorer');
    expect(routeFor('/explorer', '')).toBe('explorer');
    expect(routeFor('/explorer', '?era=1935')).toBe('explorer');
  });

  it('opens the place page for /place with a lot, and the address search for /place without one', () => {
    expect(routeFor('/place', '?lot=x')).toBe('place');
    expect(routeFor('/place', '?lot=x&era=1911')).toBe('place');
    expect(routeFor('/place/', '?lot=x')).toBe('place');
    expect(routeFor('/place', '')).toBe('search');
    expect(routeFor('/place', '?')).toBe('search');
    expect(routeFor('/place', '?lot=')).toBe('search');
    expect(routeFor('/place', '?era=1911')).toBe('search');
  });

  it('keeps the other pages, with or without a trailing slash', () => {
    expect(routeFor('/report/', '?lot=x')).toBe('report');
    expect(routeFor('/report', '')).toBe('report');
    expect(routeFor('/studio', '')).toBe('studio');
    expect(routeFor('/sources', '')).toBe('sources');
  });

  it('does not take /find on its own, or a deeper path, for a find', () => {
    expect(routeFor('/find', '')).toBe('block');
    expect(routeFor('/find/a/b', '')).toBe('block');
    expect(routeFor('/find', '?era=1911')).toBe('explorer');
  });
});

describe('findSlugFor', () => {
  it('reads the slug of /find/<slug> and nothing else', () => {
    expect(findSlugFor('/find/overall-factory')).toBe('overall-factory');
    expect(findSlugFor('/find/overall-factory/')).toBe('overall-factory');
    expect(findSlugFor('/find/a%20b')).toBe('a b');
    expect(findSlugFor('/find')).toBeNull();
    expect(findSlugFor('/find/a/b')).toBeNull();
    expect(findSlugFor('/place')).toBeNull();
    expect(findSlugFor('/find/%E0%A4%A')).toBeNull();
  });
});

describe('placeLink', () => {
  it('names the lot and, when asked, the era, and encodes both', () => {
    expect(placeLink('a b')).toBe('/place?lot=a%20b');
    expect(placeLink('lot_1', '1911')).toBe('/place?lot=lot_1&era=1911');
  });
});
