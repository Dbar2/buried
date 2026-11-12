import { describe, expect, it } from 'vitest';
import { SAMPLES_PER_TYPE, generateSamples, listGenerated, readGenerated } from '../../scripts/genBridgeSamples';
import { ALL_MESSAGE_TYPES } from './bridge';

describe('generated bridge samples', () => {
  it('match the generators: regenerating changes nothing', async () => {
    const committed = await listGenerated();
    if (committed.length === 0) {
      throw new Error('data/schema/bridge_fixtures/generated/ is empty; run `npm run gen:bridge-samples` from web/');
    }
    const fresh = generateSamples();
    expect(committed).toEqual([...fresh.keys()].sort());
    for (const [path, text] of fresh) {
      expect(await readGenerated(path), path).toBe(text);
    }
  });

  it('cover every message type, 50 each', () => {
    const fresh = generateSamples();
    for (const type of ALL_MESSAGE_TYPES) {
      const directory = type.replace('/', '_');
      const count = [...fresh.keys()].filter((p) => p.startsWith(`${directory}/`)).length;
      expect(count, type).toBe(SAMPLES_PER_TYPE);
    }
  });
});
