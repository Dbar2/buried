import { describe, expect, it } from 'vitest';
import { indexSources } from '../evidence';
import type { TileSidecar } from '../evidence';
import { ERA_1911, ERA_1935_EDITION as ERA_1935, ERA_1947, ERA_TODAY, makeSource } from '../evidence/testing/fixtures';
import { drapeForSource, drapesForEra, sourceCoversEra, toDrape } from './drapes';

function tile(source: string, image = `${source}.jpg`): TileSidecar {
  return {
    schema_version: '1.0.0',
    source,
    image,
    width_px: 3428,
    height_px: 4096,
    corners: {
      top_left: [632273.5, 4835125.25],
      top_right: [632592.5, 4835225.75],
      bottom_right: [632714.5, 4834837.5],
      bottom_left: [632396.5, 4834737.25],
    },
    transform: 'supplied',
    alignment_error_m: 4.3,
    source_pixel_size_m: 0.059,
    tile_pixel_size_m: 0.099,
    attribution_line: 'Synthetic.',
  };
}

const sources = indexSources({
  schema_version: '1.0.0',
  sources: [
    makeSource('fip_v3_1911_229', 1911, 1914),
    makeSource('fip_v3_1935_229', 1931, 1935),
    makeSource('fip_v3_1935_232', 1931, 1935, { attribution_status: 'to_be_confirmed' }),
    makeSource('present_toronto_intersections_2026', 2026, 2026, { type: 'present_day_reference' }),
  ],
});

describe('drapesForEra (requirement 8.2)', () => {
  const tiles = [tile('fip_v3_1935_229'), tile('fip_v3_1911_229'), tile('fip_v3_1935_232')];

  it('drapes a tile in the era its source covers, and only there', () => {
    expect(drapesForEra(ERA_1911, sources, tiles).map((d) => d.sourceId)).toEqual(['fip_v3_1911_229']);
    expect(drapesForEra(ERA_1935, sources, tiles).map((d) => d.sourceId)).toEqual(['fip_v3_1935_229']);
    expect(drapesForEra(ERA_1947, sources, tiles)).toEqual([]);
    expect(drapesForEra(ERA_TODAY, sources, tiles)).toEqual([]);
  });

  it('never drapes a source whose rights are not confirmed (requirement 21.1)', () => {
    expect(drapesForEra(ERA_1935, sources, tiles).map((d) => d.sourceId)).not.toContain('fip_v3_1935_232');
    expect(sourceCoversEra(sources, 'fip_v3_1935_232', ERA_1935)).toBe(false);
  });

  it('never drapes a tile for a source that is not in the registry', () => {
    expect(drapesForEra(ERA_1911, sources, [tile('fip_v3_1911_999')])).toEqual([]);
  });

  it('needs the source to contain the whole era', () => {
    const wide = { id: 'x', label: 'x', year_from: 1911, year_to: 1935 };
    expect(drapesForEra(wide, sources, tiles)).toEqual([]);
  });

  it('sorts by source id, which is the draw order', () => {
    const both = indexSources({
      schema_version: '1.0.0',
      sources: [makeSource('b_plate', 1931, 1935), makeSource('a_plate', 1931, 1935)],
    });
    expect(drapesForEra(ERA_1935, both, [tile('b_plate'), tile('a_plate')]).map((d) => d.sourceId)).toEqual(['a_plate', 'b_plate']);
  });
});

describe('toDrape', () => {
  it('serves the image from /data/tiles/ and renames the corners without changing them', () => {
    const t = tile('fip_v3_1911_229');
    const d = toDrape(t);
    expect(d.url).toBe('/data/tiles/fip_v3_1911_229.jpg');
    expect(d.corners).toEqual({
      topLeft: t.corners.top_left,
      topRight: t.corners.top_right,
      bottomRight: t.corners.bottom_right,
      bottomLeft: t.corners.bottom_left,
    });
    expect([d.widthPx, d.heightPx]).toEqual([3428, 4096]);
  });

  it('finds the drape of one source for Show Evidence', () => {
    expect(drapeForSource('fip_v3_1935_229', [tile('fip_v3_1911_229'), tile('fip_v3_1935_229')])?.sourceId).toBe('fip_v3_1935_229');
    expect(drapeForSource('fip_v3_1947_x', [tile('fip_v3_1911_229')])).toBeNull();
  });
});
