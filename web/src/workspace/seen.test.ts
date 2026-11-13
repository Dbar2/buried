import { describe, expect, it } from 'vitest';
import type { Era } from '../evidence';
import { eraForYears, unseenIds } from './seen';

const eras: Era[] = [
  { id: '1911', label: '1911 (revised to 1914)', year_from: 1911, year_to: 1914 },
  { id: '1935', label: '1935', year_from: 1931, year_to: 1935 },
  { id: '1947', label: '1947', year_from: 1947, year_to: 1947 },
  { id: 'today', label: 'Today', year_from: 2026, year_to: 2026 },
] as Era[];

describe('unseen workspace features', () => {
  it('keeps only the ids not yet seen, in order', () => {
    expect(unseenIds(['a', 'b', 'c'], new Set(['b']))).toEqual(['a', 'c']);
    expect(unseenIds([], new Set(['b']))).toEqual([]);
  });
});

describe('the era View in Explorer opens', () => {
  it('is the era inside the source years', () => {
    expect(eraForYears(eras, 1911, 1914)?.id).toBe('1911');
    expect(eraForYears(eras, 1931, 1935)?.id).toBe('1935');
  });

  it('is the earliest when several fit', () => {
    expect(eraForYears(eras, 1900, 1950)?.id).toBe('1911');
  });

  it('is null when no era lies inside the years', () => {
    expect(eraForYears(eras, 1920, 1925)).toBeNull();
    expect(eraForYears(eras, 1912, 1914)).toBeNull();
  });
});
