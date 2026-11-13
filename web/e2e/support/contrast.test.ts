import { describe, expect, it } from 'vitest';
import { contrastRatio, luminance, parseCssColour, worstContrast } from './contrast';

describe('contrast on pixels', () => {
  it('matches the ratios design.md states for the palette', () => {
    const parchment = luminance([0xe8, 0xdc, 0xc1]);
    const soot = luminance([0x12, 0x17, 0x15]);
    expect(contrastRatio(parchment, soot)).toBeCloseTo(13.3, 0);
    expect(contrastRatio(luminance([0xa9, 0x9f, 0x8a]), soot)).toBeCloseTo(6.9, 0);
  });

  it('is symmetric and 1 for equal colours', () => {
    expect(contrastRatio(0.3, 0.3)).toBe(1);
    expect(contrastRatio(0.2, 0.7)).toBe(contrastRatio(0.7, 0.2));
  });

  it('reads the colours a browser computes', () => {
    expect(parseCssColour('rgb(232, 220, 193)')).toEqual([232, 220, 193]);
    expect(parseCssColour('rgba(18, 23, 21, 0.5)')).toEqual([18, 23, 21]);
    expect(parseCssColour('transparent')).toBeNull();
  });

  it('finds the pixel nearest the text colour as the worst case', () => {
    // 2 x 1 image: one soot pixel and one pixel close to the parchment of the text.
    const data = new Uint8Array([0x12, 0x17, 0x15, 255, 0xc0, 0xb8, 0xa0, 255]);
    const worst = worstContrast({ width: 2, height: 1, data }, [0xe8, 0xdc, 0xc1]);
    expect(worst.at).toEqual({ x: 1, y: 0 });
    expect(worst.ratio).toBeLessThan(2);
  });
});
