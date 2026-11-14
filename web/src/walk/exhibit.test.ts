import { beforeAll, describe, expect, it } from 'vitest';
import { findBySlug, loadFinds } from '../block/finds';
import type { ResolvedFind } from '../block/finds';
import { loadData } from '../data/loadData';
import { findBannedWords } from '../evidence';
import { buildGateModel } from '../explorer/gateModel';
import type { GateModel } from '../explorer/gateModel';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { BACK_TO_THE_STREET, IMAGINED_LINE, exhibitView, fromPlanLine, storeysInWords } from './exhibit';

let model: GateModel;
let finds: ResolvedFind[];

beforeAll(async () => {
  const fetchText = diskFetch(REPOSITORY_DATA);
  const data = await loadData(fetchText);
  model = buildGateModel(data);
  finds = (await loadFinds(fetchText, data)).finds;
});

const ctx = () => ({ model, siteOrigin: 'https://buried.example' });

describe('storeys in words', () => {
  it('writes one storey and the plural', () => {
    expect(storeysInWords(1)).toBe('one storey');
    expect(storeysInWords(3)).toBe('three storeys');
    expect(storeysInWords(12)).toBe('12 storeys');
  });

  it('says nothing when the plan gives none', () => {
    expect(storeysInWords(undefined)).toBeNull();
    expect(storeysInWords(0)).toBeNull();
    expect(storeysInWords(2.5)).toBeNull();
    expect(fromPlanLine(undefined)).toBe('From the plan: the outline, the name.');
    expect(fromPlanLine(2)).toBe('From the plan: the outline, two storeys, the name.');
  });
});

describe('the exhibit of the overall factory', () => {
  it('reads "Glove & Overall Factory" as lettered, with the exhibit kicker', () => {
    const view = exhibitView(findBySlug(finds, 'overall-factory')!, ctx());
    expect(view.card.kicker).toBe('EXHIBIT. LETTERED ON THE 1911 PLAN');
    expect(view.card.lines[0]).toBe('Glove & Overall Factory');
    expect(view.card.lines).toContain('Hamilton Carhartt Mfr. Ltd.');
  });

  it('keeps the crop, "Seen on", the position line and the record\'s own status line', () => {
    const view = exhibitView(findBySlug(finds, 'overall-factory')!, ctx());
    expect(view.card.crop).not.toBeNull();
    expect(view.card.seenOn).toBe('Seen on: 1911 plan, sheet 229');
    expect(view.card.position).toMatch(/^Positioned within about \d+(\.\d)? m$/);
    expect(view.card.status).toMatch(/^Status: /);
    expect(view.card.status).not.toMatch(/confirmed/i);
  });

  it('says what comes from the plan and what is imagined, then offers one button', () => {
    const view = exhibitView(findBySlug(finds, 'overall-factory')!, ctx());
    expect(view.fromPlan).toMatch(/^From the plan: the outline, (\w+ storeys?, )?the name\.$/);
    expect(view.imagined).toBe('Imagined: the brick, the windows, the sign paint.');
    expect(view.imagined).toBe(IMAGINED_LINE);
    expect(view.back).toBe('Back to the street');
    expect(view.back).toBe(BACK_TO_THE_STREET);
  });

  it('offers no card actions of its own: the panel has one button', () => {
    const view = exhibitView(findBySlug(finds, 'overall-factory')!, ctx());
    expect(view.card.actions).toEqual({ showOriginalSheet: false, share: false, fullRecord: false, showOnMap: false });
    expect(view.card.fullRecordHref).toBeNull();
    expect(view.card.shareLink).toBeNull();
    expect(view.card.rulerLine).toBeNull();
  });
});

describe('every plaque of the corner has an exhibit', () => {
  it.each(['overall-factory', 'bank', 'machine-shop'])('%s: lettered lines, a crop and no banned word', (slug) => {
    const view = exhibitView(findBySlug(finds, slug)!, ctx());
    expect(view.card.lines.length).toBeGreaterThan(0);
    expect(view.card.crop).not.toBeNull();
    const text = [view.card.kicker, ...view.card.lines, view.card.seenOn, view.card.position, view.card.status, view.fromPlan, view.imagined, view.back].join(' ');
    expect(findBannedWords(text)).toEqual([]);
  });

  it('reads the bank and the machine shop as lettered', () => {
    expect(exhibitView(findBySlug(finds, 'bank')!, ctx()).card.lines[0]).toBe('Bank of Nova Scotia');
    expect(exhibitView(findBySlug(finds, 'machine-shop')!, ctx()).card.lines[0]).toBe('Machine Shop');
  });
});
