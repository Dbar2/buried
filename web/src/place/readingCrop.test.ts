/**
 * Session 032: the evidence card shows the crop the lettering was read from, and a land-use area is
 * drawn hatched in the pictures. Synthetic geometry only.
 */
import { describe, expect, it } from 'vitest';
import type { EraFeature, TileSidecar } from '../evidence';
import { buildReport } from '../report/buildReport';
import type { Report } from '../report/buildReport';
import { E0, N0, P1911, P1935, inputs, makeFeature, obs, plateCollection } from '../report/testing/fixtures';
import { buildPlaceCard, cardCrop, readingCrop } from './placeCard';

const SIDECAR = {
  schema_version: '1.1.0',
  source: P1911,
  image: `${P1911}.jpg`,
  width_px: 2000,
  height_px: 1000,
  crop_px: { x: 1000, y: 500, width: 4000, height: 2000 },
  corners: {
    top_left: [E0 - 100, N0 + 100],
    top_right: [E0 + 100, N0 + 100],
    bottom_right: [E0 + 100, N0 - 100],
    bottom_left: [E0 - 100, N0 - 100],
  },
  transform: 'supplied',
  alignment_error_m: 4,
  source_pixel_size_m: 0.05,
  tile_pixel_size_m: 0.1,
  attribution_line: 'Synthetic.',
} as unknown as TileSidecar;

function area(readCrop = { x: 1400, y: 900, width: 400, height: 100 }) {
  const f = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { kind: 'land_use', seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
  f.properties.attributes = { use: 'Coal yard' };
  f.properties.provenance.attribute_reads = [{ attribute: 'use', crop_px: readCrop, read_by: 'person', confirmed_by: 'synthetic reviewer', confirmed_at: '2026-11-12T10:00:00Z' }];
  return f;
}

describe('the crop a use was read from', () => {
  it('maps the record crop, in plate pixels, onto the tile by proportion', () => {
    const r = readingCrop(area(), [SIDECAR], 'the 1911 plan');
    expect(r).toMatchObject({ image: `${P1911}.jpg`, sx: 200, sy: 200, sw: 200, sh: 50 });
    expect(r?.label).toContain('the 1911 plan');
  });

  it('is absent when the record has no read of a use, or the source has no tile, or the crop is off the tile', () => {
    const noRead = area();
    delete noRead.properties.provenance.attribute_reads;
    expect(readingCrop(noRead, [SIDECAR], 'x')).toBeNull();
    expect(readingCrop(area(), [], 'x')).toBeNull();
    expect(readingCrop(area({ x: 100, y: 900, width: 400, height: 100 }), [SIDECAR], 'x')).toBeNull();
    expect(readingCrop(area(), [{ ...SIDECAR, crop_px: undefined } as unknown as TileSidecar], 'x')).toBeNull();
  });
});

describe('the evidence card for an area', () => {
  const feature = area();
  const entry = {
    id: feature.id,
    kind: 'land_use',
    geometry: feature.geometry,
    positionErrorM: feature.properties.position_error_m,
    confidence: 'documented',
    confidenceReason: 'Area and use traced by a person',
    attributes: { use: 'Coal yard' },
  } as unknown as EraFeature;
  const sources = new Map(inputs([]).canon.registry.sources.map((s) => [s.id, s]));

  it('has the lettering crop and a hatched outline crop', () => {
    const card = buildPlaceCard(entry, feature, sources as never, [SIDECAR]);
    expect(card.reading).not.toBeNull();
    expect(card.crop?.hatch).toBe(true);
    expect(card.rows.find((r) => r.key === 'use')?.value).toBe('Coal yard');
  });

  it('draws a building outline plain, not hatched', () => {
    expect(cardCrop(feature.geometry, P1911, [SIDECAR], 'building')?.hatch).toBeUndefined();
  });
});

describe('the picture of an era', () => {
  it('carries the area for hatching, and the area is not in the sentences about buildings', () => {
    const f = area();
    const model = buildReport(inputs([plateCollection(P1911, [f], ['building', 'land_use']), plateCollection(P1935, [])], { canon: { ...inputs([]).canon, collections: [plateCollection(P1911, [f], ['building', 'land_use']), plateCollection(P1935, [])], sidecars: [SIDECAR] } }));
    const report = model as Report;
    const band = report.coreSample.find((b) => b.eraId === '1911');
    expect(band?.crop.kind).toBe('tile');
    if (band?.crop.kind === 'tile') expect(band.crop.areas).toHaveLength(1);
    expect(band?.sentences.map((s) => s.text).join(' ')).not.toMatch(/sits? on this lot|sit near/);
  });
});
