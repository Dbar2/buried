import { describe, expect, it } from 'vitest';
import type { TileSidecar } from '../evidence';
import { evidenceCommand } from './showEvidence';

const tile = {
  source: 'fip_v3_1911_229',
  image: 'fip_v3_1911_229.jpg',
  width_px: 3428,
  height_px: 4096,
  corners: {
    top_left: [632273.9, 4835125],
    top_right: [632592.4, 4835225.6],
    bottom_right: [632714.8, 4834837.7],
    bottom_left: [632396.4, 4834737.1],
  },
} as unknown as TileSidecar;

const model = {
  features: new Map([['bld_fip_v3_1911_229_0001', { properties: { provenance: { origin_source: 'fip_v3_1911_229' } } }]]),
  lists: new Map([
    ['today', { features: [] }],
    ['1911', { features: [{ id: 'bld_fip_v3_1911_229_0001' }] }],
  ]),
  order: [
    { id: 'today', index: 0 },
    { id: '1911', index: 1 },
  ],
  tiles: [tile],
};

describe('Show Evidence', () => {
  it('names the ghost and the drape of its origin source while its era is on screen', () => {
    const command = evidenceCommand(model, 'bld_fip_v3_1911_229_0001', 1);
    expect(command?.featureId).toBe('bld_fip_v3_1911_229_0001');
    expect(command?.drape.sourceId).toBe('fip_v3_1911_229');
    expect(command?.drape.url).toBe('/data/tiles/fip_v3_1911_229.jpg');
  });

  it('ends when the depth leaves the era, at Today, or mid-transition', () => {
    expect(evidenceCommand(model, 'bld_fip_v3_1911_229_0001', 0)).toBeNull();
    expect(evidenceCommand(model, 'bld_fip_v3_1911_229_0001', null)).toBeNull();
  });

  it('sends nothing for a feature the era does not draw, an unknown one, or a source with no tile', () => {
    expect(evidenceCommand(model, null, 1)).toBeNull();
    expect(evidenceCommand(model, 'bld_nothing_0001', 1)).toBeNull();
    expect(evidenceCommand({ ...model, lists: new Map([['1911', { features: [] }]]) }, 'bld_fip_v3_1911_229_0001', 1)).toBeNull();
    expect(evidenceCommand({ ...model, tiles: [] }, 'bld_fip_v3_1911_229_0001', 1)).toBeNull();
  });
});
