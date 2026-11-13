import { beforeAll, describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { findBannedWords } from '../evidence';
import { buildGateModel } from '../explorer/gateModel';
import type { GateModel } from '../explorer/gateModel';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { lotForPoint } from '../report/search';
import {
  anchorFeatureIds,
  eraPlanSources,
  findCardView,
  fullRecordHref,
  ghostCardView,
  rulerStops,
  readingForEra,
  sceneFeatureFor,
  tagItems,
} from './blockModel';
import type { CardContext } from './blockModel';
import { findBySlug, loadFinds } from './finds';
import type { ResolvedFind } from './finds';

let model: GateModel;
let finds: ResolvedFind[];

beforeAll(async () => {
  const fetchText = diskFetch(REPOSITORY_DATA);
  const data = await loadData(fetchText);
  model = buildGateModel(data);
  finds = (await loadFinds(fetchText, data)).finds;
});

const ctx = (over: Partial<CardContext> = {}): CardContext => ({
  model,
  eraId: '1911',
  siteOrigin: 'https://buried.example',
  anchorOffScreen: false,
  canShowOriginal: true,
  lotFor: lotForPoint,
  ...over,
});

describe('the ruler', () => {
  it('has three stops, Today, 1935, 1911, and no 1947', () => {
    const stops = rulerStops(model);
    expect(stops.map((s) => s.id)).toEqual(['today', '1935', '1911']);
    expect(stops.map((s) => s.label)).toEqual(['Today', '1935', '1911']);
    expect(stops.map((s) => s.announcement)).toEqual(['Now showing today', 'Now showing the 1931-35 plan', 'Now showing the 1911 plan']);
  });

  it('names the plans loaded for an era, and none for Today', () => {
    const [today, , y1911] = [model.order.find((e) => e.id === 'today')!, 0, model.order.find((e) => e.id === '1911')!];
    expect(eraPlanSources(model, today)).toBeNull();
    expect(eraPlanSources(model, y1911)!.map((s) => s.id)).toEqual(['fip_v3_1911_229']);
  });
});

describe('tags and anchors', () => {
  it('makes one tag per find, by slug, in find order', () => {
    expect(tagItems(finds).map((t) => t.id).slice(0, 3)).toEqual(['overall-factory', 'bank', 'coal-yard']);
    expect(tagItems(finds)[0]!.text).toBe('Overall factory');
  });

  it('asks for every reading\'s feature once, and picks the reading the era draws', () => {
    const ids = anchorFeatureIds(finds);
    expect(new Set(ids).size).toBe(ids.length);
    const factory = findBySlug(finds, 'overall-factory')!;
    expect(ids).toContain('bld_fip_v3_1911_229_0101');
    expect(ids).toContain('bld_fip_v3_1935_229_0064');
    expect(sceneFeatureFor(factory, '1911', model)).toBe('bld_fip_v3_1911_229_0101');
    expect(sceneFeatureFor(factory, '1935', model)).toBe('bld_fip_v3_1935_229_0064');
    expect(readingForEra(factory, 'today', model)).toBeUndefined();
    expect(sceneFeatureFor(factory, 'today', model)).toBe('bld_fip_v3_1911_229_0101');
  });
});

describe('the card of a find (requirement 4.2)', () => {
  it('opens on the earliest plan, in order, quoting the lettering and the draft status', () => {
    const view = findCardView(findBySlug(finds, 'overall-factory')!, ctx());
    expect(view.kicker).toBe('LETTERED ON THE 1911 PLAN');
    expect(view.lines).toEqual(['Glove & Overall Factory', 'Hamilton Carhartt Mfr. Ltd.']);
    expect(view.seenOn).toBe('Seen on: 1911 plan, sheet 229');
    expect(view.position).toMatch(/^Positioned within about \d+\.\d m$/);
    expect(view.status).toBe('Status: draft, not yet reviewed');
    expect(view.rulerLine).toBeNull();
    expect(view.actions).toEqual({ showOriginalSheet: true, share: true, fullRecord: true, showOnMap: false });
    expect(view.shareLink).toBe('https://buried.example/find/overall-factory');
  });

  it('crops the untouched tile where the lettering is', () => {
    const view = findCardView(findBySlug(finds, 'overall-factory')!, ctx());
    expect(view.crop).not.toBeNull();
    expect(view.crop!.src).toBe('/data/tiles/fip_v3_1911_229.jpg');
    expect(view.crop!.rect.width).toBeGreaterThan(0);
    expect(view.crop!.rect.x + view.crop!.rect.width).toBeLessThanOrEqual(view.crop!.tileWidth);
    expect(view.crop!.alt).toBe('The lettering as drawn on the 1911 plan, sheet 229');
  });

  it('adds the ruler line when the ruler moves (requirement 5.3)', () => {
    const factory = findBySlug(finds, 'overall-factory')!;
    expect(findCardView(factory, ctx({ eraId: '1935' })).rulerLine).toBe('On the 1931-35 plan this factory is lettered “Glove & Overall Fac.”.');
    expect(findCardView(factory, ctx({ eraId: 'today' })).rulerLine).toBeNull();
    // The bank has no 1935 reading: the plan is loaded, so the card says nothing was recorded.
    expect(findCardView(findBySlug(finds, 'bank')!, ctx({ eraId: '1935' })).rulerLine).toBe('No lettering recorded here from the 1931-35 plan.');
  });

  it('offers "Show on the map" only when told the anchor is off screen, and no "Full record" before the lot finder loads', () => {
    const bank = findBySlug(finds, 'bank')!;
    expect(findCardView(bank, ctx({ anchorOffScreen: true })).actions.showOnMap).toBe(true);
    expect(findCardView(bank, ctx({ lotFor: null })).fullRecordHref).toBeNull();
  });

  it('links "Full record" to the report of the lot that holds the feature', () => {
    const bank = findBySlug(finds, 'bank')!;
    const href = findCardView(bank, ctx()).fullRecordHref;
    expect(href).toMatch(/^\/report\?lot=[^&]+&era=1911$/);
    expect(fullRecordHref(model, bank.primary.feature, '1911', lotForPoint)).toBe(href);
  });

  it('carries no banned word, for any find', () => {
    for (const find of finds) {
      const view = findCardView(find, ctx());
      expect(findBannedWords([view.kicker, ...view.lines, view.seenOn, view.position, view.status, view.rulerLine ?? ''].join(' ')), find.find.slug).toEqual([]);
    }
  });
});

describe('the card of a ghost that is no find (requirement 4.5)', () => {
  const ghostId = (): string => {
    const isFind = (id: string) => finds.some((f) => f.readings.some((r) => r.reading.feature_id === id));
    return model.lists.get('1911')!.features.map((f) => f.id).find((id) => !isFind(id)) as string;
  };

  it('says "drawn on", offers no share, and titles the building from the record', () => {
    const view = ghostCardView(ghostId(), ctx())!;
    expect(view.kicker).toBe('DRAWN ON THE 1911 PLAN');
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]).toMatch(/^(One|Two|Three|Four|Five|Six)-storey building$|^(Building|Area) on the 1911 plan$/);
    expect(view.actions.share).toBe(false);
    expect(view.shareLink).toBeNull();
    expect(view.status).toBe('Status: draft, not yet reviewed');
  });

  it('gives no card for a feature the model does not hold', () => {
    expect(ghostCardView('bld_fip_v3_1911_229_9999', ctx())).toBeNull();
  });
});
