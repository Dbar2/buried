import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { BRIDGE_TYPES_PATH, generateBridgeTypes } from '../../scripts/genBridgeTypes';

describe('generated bridge types', () => {
  it('match the Bridge Schema: regenerating changes nothing (requirement 4.4)', async () => {
    let committed: string;
    try {
      committed = await readFile(BRIDGE_TYPES_PATH, 'utf8');
    } catch {
      throw new Error('web/src/bridge/types.generated.ts is missing; run `npm run gen:bridge-types` from web/');
    }
    const regenerated = await generateBridgeTypes();
    expect(regenerated).toBe(committed);
  });

  it('are marked as generated, say the coordinates are EPSG:26917 and define the message union', async () => {
    const text = await readFile(BRIDGE_TYPES_PATH, 'utf8');
    expect(text).toContain('GENERATED FILE. Do not edit by hand.');
    expect(text).toContain('EPSG:26917');
    expect(text).toContain('export type BridgeMessage');
  });

  it('give a position as two numbers', async () => {
    const text = await readFile(BRIDGE_TYPES_PATH, 'utf8');
    expect(text).toContain('export type Position = [number, number];');
  });
});
