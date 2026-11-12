import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { TYPES_PATH, generateTypes } from '../../scripts/genTypes';

describe('generated types', () => {
  it('match the Schema: regenerating changes nothing (requirement 9.1)', async () => {
    const committed = await readFile(TYPES_PATH, 'utf8');
    const regenerated = await generateTypes();
    expect(regenerated).toBe(committed);
  });

  it('are marked as generated and say the coordinates are EPSG:26917', async () => {
    const text = await readFile(TYPES_PATH, 'utf8');
    expect(text).toContain('GENERATED FILE. Do not edit by hand.');
    expect(text).toContain('EPSG:26917');
  });

  it('give a position as two numbers, not unknowns', async () => {
    const text = await readFile(TYPES_PATH, 'utf8');
    expect(text).toContain('export type Position = [number, number];');
    expect(text).not.toMatch(/\bunknown\b(?!')/);
  });
});
