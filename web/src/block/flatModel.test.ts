import { beforeAll, describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { buildGateModel } from '../explorer/gateModel';
import type { GateModel } from '../explorer/gateModel';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { flatFootprints, flatPresent, flatTileFor, flatViewportPoint } from './flatModel';
import type { Pt } from './sheetTransform';

let model: GateModel;
beforeAll(async () => {
  model = buildGateModel(await loadData(diskFetch(REPOSITORY_DATA)));
});

describe('the Flat sheet\'s layers', () => {
  it('uses each plan\'s own tile, and the 1911 tile at Today', () => {
    expect(flatTileFor(model, '1911')!.src).toBe('/data/tiles/fip_v3_1911_229.jpg');
    expect(flatTileFor(model, '1935')!.src).toBe('/data/tiles/fip_v3_1935_229.jpg');
    expect(flatTileFor(model, 'today')!.src).toBe('/data/tiles/fip_v3_1911_229.jpg');
    expect(flatTileFor(model, 'no-such-era')).toBeNull();
  });

  it('draws the era\'s list as footprints with a confidence and a name, and today\'s buildings as rings', () => {
    const footprints = flatFootprints(model, '1911');
    expect(footprints.length).toBe(model.lists.get('1911')!.features.length);
    expect(footprints.length).toBeGreaterThan(0);
    for (const f of footprints) {
      expect(['documented', 'estimated', 'unknown']).toContain(f.confidence);
      expect(f.rings.length).toBeGreaterThan(0);
      expect(f.name.length).toBeGreaterThan(0);
    }
    expect(flatFootprints(model, 'today')).toEqual([]);
    expect(flatPresent(model).length).toBe(model.present.length);
  });
});

describe('flatViewportPoint', () => {
  it('puts the tile\'s corners at the corners of the fitted tile, centred in a wider box', () => {
    const tile = flatTileFor(model, '1911')!;
    const box = { w: 1600, h: 900 };
    const tl = flatViewportPoint(tile, tile.corners.top_left as Pt, box);
    const br = flatViewportPoint(tile, tile.corners.bottom_right as Pt, box);
    const scale = Math.min(box.w / tile.widthPx, box.h / tile.heightPx);
    const offsetX = (box.w - tile.widthPx * scale) / 2;
    expect(tl.x).toBeCloseTo(offsetX, 3);
    expect(tl.y).toBeCloseTo(0, 3);
    expect(br.x).toBeCloseTo(offsetX + tile.widthPx * scale, 3);
    expect(br.y).toBeCloseTo(tile.heightPx * scale, 3);
    expect(tl.onScreen).toBe(true);
  });

  it('is off screen outside the box and for an empty box', () => {
    const tile = flatTileFor(model, '1911')!;
    expect(flatViewportPoint(tile, [0, 0], { w: 800, h: 600 }).onScreen).toBe(false);
    expect(flatViewportPoint(tile, tile.corners.top_left as Pt, { w: 0, h: 0 }).onScreen).toBe(false);
  });
});
