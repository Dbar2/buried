/**
 * Session 029: the evidence card says what the record says and nothing more. On the committed data,
 * every card for every feature of every era has the record's own status line ("Status: draft, not yet
 * reviewed" or "reviewed by"), no derived
 * review claim, no banned word, and a crop only from the feature's own origin source.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { findBannedWords, positionPhrase, reviewStatusLine } from '../evidence';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { buildGateModel } from '../explorer/gateModel';
import type { GateModel } from '../explorer/gateModel';
import { boundsOf } from '../report/cropPlan';
import { buildPlaceCard, cardHeading } from './placeCard';

let model: GateModel;

beforeAll(async () => {
  model = buildGateModel(await loadData(diskFetch(REPOSITORY_DATA)));
});

function everyCard() {
  const out: Array<{ eraId: string; card: ReturnType<typeof buildPlaceCard>; id: string }> = [];
  for (const [eraId, list] of model.lists) {
    for (const entry of list.features) {
      const feature = model.features.get(entry.id)!;
      out.push({ eraId, id: entry.id, card: buildPlaceCard(entry, feature, model.sources, model.tiles) });
    }
  }
  return out;
}

describe('the place card on the committed data', () => {
  it('has cards to check', () => {
    expect(everyCard().length).toBeGreaterThan(0);
  });

  it("prints the record's review status, never its confirmed_by", () => {
    for (const { id, card } of everyCard()) {
      const p = model.features.get(id)!.properties.provenance;
      const row = card.rows.find((r) => r.key === 'status')!;
      expect(row.value, id).toBe(reviewStatusLine(p.review));
      expect(row.value, id).not.toContain(p.confirmed_by);
    }
  });

  it('makes no review claim beyond that line', () => {
    for (const { id, card } of everyCard()) {
      const text = [card.heading, card.cropLabel, ...card.rows.map((r) => r.value), card.source.name, card.source.attributionLine].join(' ');
      expect(text, id).not.toMatch(/checked by a person/i);
      expect(text, id).not.toMatch(/\bconfirmed\b/i);
      // Every claim of review in the card is the one status row.
      expect((text.match(/\b(reviewed|verified|checked) by\b/gi) ?? []).length, id).toBe(card.rows.find((r) => r.key === 'status')!.value.includes('reviewed by') ? 1 : 0);
    }
  });

  it('carries no banned word and words the position with the Evidence Library phrase', () => {
    for (const { id, card } of everyCard()) {
      const text = [card.heading, card.cropLabel, ...card.rows.map((r) => r.value), card.source.attributionLine].join(' ');
      expect(findBannedWords(text), id).toEqual([]);
      const entry = [...model.lists.values()].flatMap((l) => l.features).find((e) => e.id === id)!;
      expect(card.rows.find((r) => r.key === 'position')!.value).toBe(positionPhrase(entry.positionErrorM));
    }
  });

  it('shows a use or storeys row only when the record has the attribute', () => {
    for (const { id, card } of everyCard()) {
      const entry = [...model.lists.values()].flatMap((l) => l.features).find((e) => e.id === id)!;
      expect(card.rows.some((r) => r.key === 'use'), id).toBe(entry.attributes.use !== undefined);
      expect(card.rows.some((r) => r.key === 'storeys'), id).toBe(entry.attributes.storeys !== undefined);
      if (entry.attributes.use !== undefined) expect(card.rows.find((r) => r.key === 'use')!.value).toBe(entry.attributes.use);
    }
  });

  it("crops the feature's own source tile, around the building, with its outline", () => {
    const withCrop = everyCard().filter((c) => c.card.crop !== null);
    expect(withCrop.length).toBeGreaterThan(0);
    for (const { id, card } of withCrop) {
      const crop = card.crop!;
      const feature = model.features.get(id)!;
      expect(crop.tile.sourceId, id).toBe(feature.properties.provenance.origin_source);
      const b = boundsOf(feature.geometry);
      const w = crop.window;
      expect(w.minE, id).toBeLessThan(b.minE);
      expect(w.minN, id).toBeLessThan(b.minN);
      expect(w.minE + w.side, id).toBeGreaterThan(b.maxE);
      expect(w.minN + w.side, id).toBeGreaterThan(b.maxN);
      expect(crop.lot.length, id).toBeGreaterThan(0);
      expect(card.source.id, id).toBe(feature.properties.provenance.origin_source);
    }
  });

  it('says plainly when the source has no picture, and workspace cards say where they come from', () => {
    const first = [...model.lists.values()].flatMap((l) => l.features)[0]!;
    const feature = model.features.get(first.id)!;
    const card = buildPlaceCard(first, feature, model.sources, [], 'workspace');
    expect(card.crop).toBeNull();
    expect(card.cropLabel).toMatch(/no picture loaded/);
    expect(card.rows.find((r) => r.key === 'origin')!.value).toBe("From your workspace. Not part of Buried's published records.");
    expect(card.workspace).toBe(true);
  });

  it('does not reproduce a use that holds a banned word', () => {
    const first = [...model.lists.values()].flatMap((l) => l.features)[0]!;
    const feature = model.features.get(first.id)!;
    const card = buildPlaceCard({ ...first, attributes: { ...first.attributes, use: 'Clean room' } }, feature, model.sources, model.tiles);
    const text = [card.heading, ...card.rows.map((r) => r.value)].join(' ');
    expect(findBannedWords(text)).toEqual([]);
  });
});

describe('cardHeading', () => {
  it('splits a recorded use at the semicolon and leaves the bracketed note out of the heading', () => {
    expect(cardHeading('Coal & Wood Yard; J. W. Corson & Co. (as lettered on the plate)', 'Land use')).toEqual({
      heading: 'Coal & Wood Yard',
      subtitle: ['J. W. Corson & Co.'],
    });
    expect(cardHeading('Bank of Nova Scotia; offices on 2nd', 'Building')).toEqual({ heading: 'Bank of Nova Scotia', subtitle: ['offices on 2nd'] });
  });

  it('keeps a use with no semicolon whole, minus the note', () => {
    expect(cardHeading('COAL & WOOD YARD', 'Land use')).toEqual({ heading: 'COAL & WOOD YARD', subtitle: [] });
    expect(cardHeading('Coal Yard (as lettered on the plate)', 'Land use')).toEqual({ heading: 'Coal Yard', subtitle: [] });
  });

  it('uses the kind when there is no use or it holds a banned word', () => {
    expect(cardHeading(undefined, 'Building')).toEqual({ heading: 'Building', subtitle: [] });
    expect(cardHeading('Clean room', 'Building')).toEqual({ heading: 'Building', subtitle: [] });
  });

  it("takes a find's lettered lines when the feature belongs to a find", () => {
    expect(cardHeading('Bank of Nova Scotia; offices on 2nd', 'Building', ['Bank of Nova Scotia', 'Off. 2nd'])).toEqual({
      heading: 'Bank of Nova Scotia',
      subtitle: ['Off. 2nd'],
    });
  });

  it('puts the heading of every committed card through the same rule, with no bracketed note in it', () => {
    for (const { id, card } of everyCard()) {
      expect(card.heading, id).not.toMatch(/as lettered on the plate/i);
      expect(card.heading, id).not.toContain(';');
    }
  });
});
