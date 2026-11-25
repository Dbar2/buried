/**
 * Task 9 (spec 08), with the maintainer's decision 3 of session 051: the Unity Player (about 81 MB Brotli while
 * the parked walk model is in it, measured 2026-11-25: data 75.5 MB, wasm 5.8 MB, framework 0.07 MB) is over the
 * 30 MB limit, so "See this block in 3D" is not shown. The routes stay, so shared /find/<slug> links keep working.
 */
import { describe, expect, it } from 'vitest';
import { routeFor } from '../place/placeLink';
import { BLOCK_LINK_SHOWN } from './LotPage';

describe('the block link', () => {
  it('is off until the Player is rebuilt under the limit', () => {
    expect(BLOCK_LINK_SHOWN).toBe(false);
  });

  it('keeps /block and /find/<slug> routed', () => {
    expect(routeFor('/block', '')).toBe('block');
    expect(routeFor('/find/overall-factory', '')).toBe('block');
  });
});
