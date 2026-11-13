import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { liveLink, parseReportLink, resolveEra, shareLink, versionPrefix } from './links';
import { ERAS } from './testing/fixtures';

const ORIGIN = 'https://buried.example';

describe('R11 share links round-trip', () => {
  it('gives back the lot id, era id and 12-hex prefix, with no other parameter', () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ minLength: 1, maxLength: 30 }), fc.stringOf(fc.constantFrom(...'abcdefghijklmnop0123456789-_'), { minLength: 1, maxLength: 12 }), fc.hexaString({ minLength: 12, maxLength: 64 }), (lot, era, version) => {
        const hex = version.toLowerCase();
        const link = shareLink(ORIGIN, lot, era, hex);
        const parsed = parseReportLink(link.slice(link.indexOf('?')));
        expect(parsed).toEqual({ lotId: lot, eraId: era, version: hex.slice(0, 12) });
        const names = link.slice(link.indexOf('?') + 1).split('&').map((p) => p.split('=')[0]);
        expect(names).toEqual(['lot', 'era', 'v']);
      }),
      { numRuns: 200 },
    );
  });

  it('ignores unknown parameters, falls back to the earliest era, and drops a lot it cannot decode', () => {
    expect(parseReportLink('?lot=a%20b&era=1935&v=0123456789ab&x=1')).toEqual({ lotId: 'a b', eraId: '1935', version: '0123456789ab' });
    expect(resolveEra(ERAS, null)).toBe('1911');
    expect(resolveEra(ERAS, 'nope')).toBe('1911');
    expect(resolveEra(ERAS, '1947')).toBe('1947');
    expect(parseReportLink('?lot=%E0%A4%A').lotId).toBeNull();
    expect(parseReportLink('?era=1935').lotId).toBeNull();
  });

  it('carries no workspace data: a live link has only the lot and era', () => {
    expect(liveLink(ORIGIN, 'lot_a', '1935')).toBe('https://buried.example/?lot=lot_a&era=1935');
    expect(versionPrefix('not hex')).toBe('');
    expect(shareLink(ORIGIN, 'lot_a', '1911', 'zz')).toBe('https://buried.example/report?lot=lot_a&era=1911');
  });
});
