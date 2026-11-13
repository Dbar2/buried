/**
 * Session 029: the 2D fallback shows the same records as the era list, and the list view is its text
 * equivalent. On the committed data, for every era, the fallback's footprints are the era list's
 * features, in the list's order, and the list view has one row each.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { findBannedWords } from '../evidence';
import { boundsOf } from '../report/cropPlan';
import { featureRows } from './featureList';
import { FeatureList } from './FeatureListPanel';
import { fallbackPlan, fallbackReason } from './sceneFallback';
import { buildGateModel } from './gateModel';
import type { GateModel } from './gateModel';
import { lotPolygon } from './pinnedLot';
import { diskFetch, REPOSITORY_DATA } from './testing/diskFetch';
import { NO_WEBGL2_MESSAGE } from './webgl';

let model: GateModel;

beforeAll(async () => {
  model = buildGateModel(await loadData(diskFetch(REPOSITORY_DATA)));
});

describe('the 2D fallback', () => {
  it('draws exactly the features of the era list, in order, for every era', () => {
    expect(model.order.length).toBeGreaterThan(1);
    for (const era of model.order) {
      const list = model.lists.get(era.id)!;
      const plan = fallbackPlan(model, era.id, null);
      expect(plan.footprints.map((f) => f.id), era.id).toEqual(list.features.map((f) => f.id));
      expect(plan.footprints.length, era.id).toBe(featureRows(list, model.features).length);
      expect(plan.eraId).toBe(era.id);
    }
  });

  it('has at least one era with footprints, so the count check is not empty', () => {
    expect(model.order.some((era) => (model.lists.get(era.id)?.features.length ?? 0) > 0)).toBe(true);
  });

  it('frames every footprint and the lot', () => {
    const lots = model.lots?.features ?? [];
    expect(lots.length).toBeGreaterThan(0);
    const lot = lotPolygon(model.lots, String(lots[0]!.id));
    expect(lot).not.toBeNull();
    for (const era of model.order) {
      const plan = fallbackPlan(model, era.id, lot);
      const w = plan.window;
      const inside = (b: ReturnType<typeof boundsOf>) =>
        b.minE >= w.minE && b.minN >= w.minN && b.maxE <= w.minE + w.side && b.maxN <= w.minN + w.side;
      for (const entry of model.lists.get(era.id)!.features) expect(inside(boundsOf(entry.geometry)), `${era.id} ${entry.id}`).toBe(true);
      expect(inside(boundsOf(lot!)), era.id).toBe(true);
      expect(plan.lot).not.toBeNull();
    }
  });

  it("uses the era's own tiles, and today's outlines only at Today", () => {
    for (const era of model.order) {
      const plan = fallbackPlan(model, era.id, null);
      const wanted = (model.drapes.get(era.id) ?? []).map((d) => d.sourceId).filter((id) => model.tiles.some((t) => t.source === id));
      expect(plan.tiles.map((t) => t.sourceId), era.id).toEqual(wanted);
      if (era.index !== 0) expect(plan.present, era.id).toEqual([]);
    }
    const today = fallbackPlan(model, model.order[0]!.id, null);
    expect(today.tiles).toEqual([]);
  });

  it('gives one plain sentence for the reason, with no banned word', () => {
    const noWebgl = fallbackReason(false, null, NO_WEBGL2_MESSAGE);
    const failed = fallbackReason(true, 'the 3D view did not report that it was ready within 30 seconds', NO_WEBGL2_MESSAGE);
    expect(noWebgl).toContain('WebGL 2 is not available');
    expect(failed).toMatch(/^The 3D view did not load: /);
    for (const text of [noWebgl, failed]) {
      expect(text).toContain('The map below shows the same records.');
      expect(findBannedWords(text)).toEqual([]);
    }
  });
});

describe('the list view', () => {
  it('has one row per feature of the era, with the label, position and the record\'s Confirmed by line', () => {
    for (const era of model.order) {
      const list = model.lists.get(era.id)!;
      const rows = featureRows(list, model.features);
      expect(rows.length).toBe(list.features.length);
      const html = renderToStaticMarkup(<FeatureList rows={rows} eraLabel={era.label} open onToggle={() => {}} onChoose={() => {}} selectedId={null} />);
      expect((html.match(/data-testid="feature-row-/g) ?? []).length, era.id).toBe(rows.length);
      for (const row of rows) {
        expect(['Documented', 'Estimated', 'Unknown']).toContain(row.confidenceLabel);
        expect(row.position).toMatch(/^Positioned within about \d+(\.\d)? m$/);
        expect(row.confirmedBy).toMatch(/^Confirmed by: .+, \d{4}-\d{2}-\d{2}\.$/);
        expect(html).toContain(row.position);
        expect(findBannedWords(`${row.name} ${row.confidenceLabel} ${row.dates} ${row.confirmedBy}`)).toEqual([]);
      }
    }
  });

  it('says how many features there are on the toggle, and says so when there are none', () => {
    const closed = renderToStaticMarkup(<FeatureList rows={[]} eraLabel="1947" open={false} onToggle={() => {}} onChoose={() => {}} selectedId={null} />);
    expect(closed).toContain('List the features (0)');
    expect(closed).toContain('aria-expanded="false"');
    const empty = renderToStaticMarkup(<FeatureList rows={[]} eraLabel="1947" open onToggle={() => {}} onChoose={() => {}} selectedId={null} />);
    expect(empty).toContain('Nothing is drawn for 1947.');
  });

  it('marks the open feature with aria-current', () => {
    const era = model.order.find((e) => (model.lists.get(e.id)?.features.length ?? 0) > 0)!;
    const rows = featureRows(model.lists.get(era.id), model.features);
    const html = renderToStaticMarkup(<FeatureList rows={rows} eraLabel={era.label} open onToggle={() => {}} onChoose={() => {}} selectedId={rows[0]!.id} />);
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1);
  });
});
