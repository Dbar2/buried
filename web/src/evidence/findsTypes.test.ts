import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { FINDS_TYPES_PATH, generateFindsTypes } from '../../scripts/genTypes';

describe('generated finds types', () => {
  it('match the finds Schema: regenerating changes nothing (spec 06 task P1)', async () => {
    const committed = await readFile(FINDS_TYPES_PATH, 'utf8');
    expect(await generateFindsTypes()).toBe(committed);
  });

  it('give a crop as an object of four numbers, not an array', async () => {
    const text = await readFile(FINDS_TYPES_PATH, 'utf8');
    expect(text).toContain('crop_px: CropPx;');
    expect(text).toContain('export interface CropPx {');
  });
});
