import { describe, expect, it } from 'vitest';
import { plateTitle } from './plateTitle';

describe('plateTitle', () => {
  it('leads with the plate and edition', () => {
    expect(plateTitle({ id: 'fip_v3_1911_229', title: 'x', years_label: '1911, revised to 1914' })).toBe('Plate 229, 1911 edition, revised to 1914');
  });

  it('keeps the 1931 date of the 1935 edition', () => {
    expect(plateTitle({ id: 'fip_v3_1935_232', title: 'x', years_label: '1931, revised to 1935' })).toBe('Plate 232, 1935 edition (1931, revised to 1935)');
  });

  it('works without a label and falls back to the registry title for other sources', () => {
    expect(plateTitle({ id: 'fip_v3_1911_232', title: 'x' })).toBe('Plate 232, 1911 edition');
    expect(plateTitle({ id: 'aerial_1947_a', title: 'An aerial' })).toBe('An aerial');
  });
});
