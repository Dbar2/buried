import { describe, expect, it } from 'vitest';
import { findSlugFor, lotIdFor, lotLink, placeLink, routeFor } from './placeLink';

describe('routeFor', () => {
  it('opens the landing at / with no query and at /place without a lot', () => {
    expect(routeFor('/', '')).toBe('landing');
    expect(routeFor('/', '?')).toBe('landing');
    expect(routeFor('/place', '')).toBe('landing');
    expect(routeFor('/place', '?')).toBe('landing');
    expect(routeFor('/place', '?lot=')).toBe('landing');
    expect(routeFor('/place', '?era=1911')).toBe('landing');
  });

  it('opens the Result at /lot/<id> and at /place with a lot', () => {
    expect(routeFor('/lot/5451729', '')).toBe('lot');
    expect(routeFor('/lot/5451729/', '?v=0123456789ab')).toBe('lot');
    expect(routeFor('/place', '?lot=x')).toBe('lot');
    expect(routeFor('/place', '?lot=x&era=1911')).toBe('lot');
    expect(routeFor('/place/', '?lot=x')).toBe('lot');
    expect(routeFor('/lot', '')).toBe('landing');
    expect(routeFor('/lot/a/b', '')).toBe('landing');
  });

  it('opens the How page at /how', () => {
    expect(routeFor('/how', '')).toBe('how');
    expect(routeFor('/how/', '')).toBe('how');
  });

  it('opens the Block page at /block and at /find/<slug>', () => {
    expect(routeFor('/block', '')).toBe('block');
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

  it('keeps the other pages, with or without a trailing slash', () => {
    expect(routeFor('/report/', '?lot=x')).toBe('report');
    expect(routeFor('/report', '')).toBe('report');
    expect(routeFor('/studio', '')).toBe('studio');
    expect(routeFor('/sources', '')).toBe('sources');
  });

  it('does not route /walk', () => {
    expect(routeFor('/walk', '')).toBe('landing');
    expect(routeFor('/walk', '?debug=1')).toBe('explorer');
  });

  it('does not take /find on its own, or a deeper path, for a find', () => {
    expect(routeFor('/find', '')).toBe('landing');
    expect(routeFor('/find/a/b', '')).toBe('landing');
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

describe('lotIdFor', () => {
  it('reads the lot from /lot/<id> and from /place?lot=<id>, and from nothing else', () => {
    expect(lotIdFor('/lot/5451729', '')).toBe('5451729');
    expect(lotIdFor('/lot/a%20b/', '?v=x')).toBe('a b');
    expect(lotIdFor('/place', '?lot=5451729&era=1911')).toBe('5451729');
    expect(lotIdFor('/place', '')).toBeNull();
    expect(lotIdFor('/lot', '')).toBeNull();
    expect(lotIdFor('/lot/%E0%A4%A', '')).toBeNull();
    expect(lotIdFor('/report', '?lot=x')).toBeNull();
  });
});

describe('links', () => {
  it('placeLink names the lot and, when asked, the era, and encodes both', () => {
    expect(placeLink('a b')).toBe('/place?lot=a%20b');
    expect(placeLink('lot_1', '1911')).toBe('/place?lot=lot_1&era=1911');
  });

  it('lotLink is /lot/<id>, encoded', () => {
    expect(lotLink('5451729')).toBe('/lot/5451729');
    expect(lotLink('a/b')).toBe('/lot/a%2Fb');
  });
});
