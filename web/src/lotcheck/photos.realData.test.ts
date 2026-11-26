/**
 * The pictures on the committed data (session 055): which imagined views each lot may show, and that the photographs
 * hold every lot in the coverage area. An imagined view is offered only for a lettered use ON the lot (rule 4).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PolygonalGeometry } from '../evidence';
import { ringsOf } from '../report/cropPlan';
import { layerChoices, onLotFeatureIds, parseImagined, parsePhotos, viewsOnLot } from './photos';
import { checkLot, realWorld } from './testing/realWorld';

const read = (path: string): unknown => JSON.parse(readFileSync(resolve(__dirname, '../../public/lotcheck', path), 'utf8'));

describe('the pictures on the committed data', () => {
  const photos = parsePhotos(read('aerial/aerial.json'));
  const { views } = parseImagined(read('imagined/imagined.json'));

  it('2A Percy St is offered the coal yard view, and the Then choices are the plans, the 1939 photo and that view', async () => {
    const w = await realWorld();
    const c = checkLot(w, '5451729');
    if (c.kind !== 'check') throw new Error('no check');
    const offered = viewsOnLot(onLotFeatureIds(c.rows), views);
    expect(offered.map((v) => v.slug)).toEqual(['coal-yard']);
    const lot = ringsOf(w.lots.features.find((f) => f.id === '5451729')?.geometry as PolygonalGeometry);
    const plans = c.compare.planSourceIds.map((id) => ({ sourceId: id, planName: id, label: id }));
    const choices = layerChoices({ plans, lot, photos, onLotViews: offered });
    expect(choices.then.map((t) => t.label)).toEqual(['fip_v3_1911_229', 'fip_v3_1935_229', '1939 photo', 'Imagined, about 1911']);
    expect(choices.now.map((n) => n.label)).toEqual(['Today, photo', 'Today, outlines']);
  });

  it('for every lot: an offered view is about a use on the lot; a lot with industrial use only next to it is offered none; the photographs hold the lot', async () => {
    const w = await realWorld();
    let offeredLots = 0;
    let nextDoorLots = 0;
    let heldLots = 0;
    let total = 0;
    const examples: Record<string, string> = {};
    for (const lotFeature of w.lots.features) {
      const c = checkLot(w, lotFeature.id);
      if (c.kind !== 'check') continue;
      total += 1;
      examples[c.verdict.tag] ??= `${lotFeature.id} ${c.title.text}`;
      const on = onLotFeatureIds(c.rows);
      const offered = viewsOnLot(on, views);
      for (const v of offered) expect(v.featureIds.some((id) => on.has(id)), `${lotFeature.id} ${v.slug}`).toBe(true);
      if (offered.length > 0) offeredLots += 1;
      if (c.verdict.tag === 'industrial_next') {
        nextDoorLots += 1;
        expect(offered, `${lotFeature.id} is next to a recorded site only`).toEqual([]);
      }
      const lot = ringsOf(lotFeature.geometry as PolygonalGeometry);
      const choices = layerChoices({ plans: [], lot, photos, onLotViews: offered });
      if (choices.todayPhoto !== null && choices.thenPhotos.length > 0) heldLots += 1;
    }
    console.info('pictures on the committed data', JSON.stringify({ lots: total, withImagined: offeredLots, nextDoorOnly: nextDoorLots, photosHoldLot: heldLots }), JSON.stringify(examples));
    expect(offeredLots).toBeGreaterThan(0);
    expect(nextDoorLots).toBeGreaterThan(0);
  });
});
