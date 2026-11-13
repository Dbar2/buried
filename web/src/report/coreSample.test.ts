/**
 * The picture core sample's sentences and crops (session 024): plain names for sources, the
 * automatic/checked facts read from provenance, and no id or plate number in a band's body text.
 */
import { describe, expect, it } from 'vitest';
import { checkSentence, findBannedWords } from '../evidence';
import { loadData } from '../data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { buildReport, PRESENT_SOURCES } from './buildReport';
import type { Report } from './buildReport';
import { inputs, linkedBuildingOnLot, LOT_ID } from './testing/fixtures';

const BODY_FORBIDDEN = /[a-z]+_[a-z0-9_]+|\bplate\b|\b2(29|32)\b/;

function bands(collections = linkedBuildingOnLot()): Report['coreSample'] {
  const model = buildReport(inputs(collections));
  if (model.kind !== 'report') throw new Error(model.kind);
  return model.coreSample;
}

describe('band sentences', () => {
  it('keep ids and plate numbers out of the body and still pass the sentence check', () => {
    for (const band of bands()) {
      for (const s of band.sentences) {
        expect(s.text, s.text).not.toMatch(BODY_FORBIDDEN);
        expect(findBannedWords(s.text)).toEqual([]);
        expect(checkSentence(s.text, s.pack)).toEqual({ ok: true });
      }
      if (band.coverage.covered) expect(band.sourceIds.length, `${band.eraId} cites a source`).toBeGreaterThan(0);
    }
  });

  it('say "From the 1947 photograph" style text only with a source named in sourceIds, never a finding', () => {
    for (const band of bands()) {
      for (const s of band.sentences.filter((x) => x.text.startsWith('From '))) {
        expect(s.text).toMatch(/^From the \d{4}(-\d{2})? (plan|photograph|map)( and the [\d-]+ (plan|photograph|map))*\. Not yet reviewed\.$/);
      }
    }
  });

  it('never turns confidence into a claim that a person checked the outline', () => {
    const collections = linkedBuildingOnLot();
    const features = collections.flatMap((c) => c.features);
    for (const f of features) {
      f.properties.confidence = 'estimated';
      f.properties.provenance.extraction_params_id = 'v1';
      f.properties.provenance.confirmed_by = 'A. Reader';
      f.properties.provenance.confirmed_at = '2026-11-12T10:00:00Z';
    }
    const texts = bands(collections).flatMap((b) => b.sentences.map((s) => s.text));
    expect(texts.some((t) => /traced automatically from the \d{4}(-\d{2})? plan sits on this lot\.$/.test(t))).toBe(true);
    expect(texts).toContain('Confirmed by: A. Reader, 2026-11-12.');

    // Changing confidence changes nothing about who confirmed.
    for (const f of features) f.properties.confidence = 'documented';
    const after = bands(collections).flatMap((b) => b.sentences.map((s) => s.text));
    expect(after).toContain('Confirmed by: A. Reader, 2026-11-12.');
    for (const t of [...texts, ...after]) expect(t).not.toMatch(/checked by a person|reviewed by/i);
  });
});

describe('band pictures', () => {
  it('give Today a vector map with the lot outlined and the other eras a tile or a plain line', () => {
    const list = bands();
    const today = list.find((b) => b.eraId === 'today')!;
    expect(today.crop.kind).toBe('vector');
    if (today.crop.kind === 'vector') {
      expect(today.crop.shapes.lot.length).toBeGreaterThan(0);
      expect(today.crop.window.side).toBeGreaterThan(50);
    }
    for (const band of list.filter((b) => b.eraId !== 'today')) {
      expect(['tile', 'none']).toContain(band.crop.kind);
      if (band.crop.kind === 'none') expect(band.crop.text).not.toBe('');
    }
    expect(LOT_ID).toBeTruthy();
  });
});

describe('on the committed data', () => {
  it('has four bands in order, each with a picture plan, and a 1947 band that says no photograph is loaded', async () => {
    const data = await loadData(diskFetch(REPOSITORY_DATA));
    const lots = data.presentLayers.get(PRESENT_SOURCES.lots)!;
    const evidence = data.evidence.find((c) => c.origin_source === 'fip_v3_1911_229')!;
    const geometry = evidence.features.find((f) => f.id === 'bld_fip_v3_1911_229_0001')!.geometry;
    const ring = (geometry.type === 'Polygon' ? geometry.coordinates[0] : geometry.type === 'MultiPolygon' ? geometry.coordinates[0]![0] : [])!;
    const centre: [number, number] = [ring.reduce((s, p) => s + p[0]!, 0) / ring.length, ring.reduce((s, p) => s + p[1]!, 0) / ring.length];
    const { lotForPoint } = await import('./search');
    const lotId = lotForPoint(lots, centre);
    expect(lotId).not.toBeNull();
    const model = buildReport({
      lotId: lotId!,
      eraId: null,
      canon: {
        collections: data.evidence,
        registry: data.registry,
        project: data.project,
        sidecars: data.tiles,
        lots,
        addresses: data.presentLayers.get(PRESENT_SOURCES.addresses),
        buildings: data.presentLayers.get(PRESENT_SOURCES.buildings),
      },
      workspace: null,
      dataVersion: 'x'.repeat(40),
      linkDataVersion: null,
      siteOrigin: 'https://buried.example',
    });
    expect(model.kind).toBe('report');
    const r = model as Report;
    expect(r.coreSample.map((b) => b.eraId)).toEqual(['today', '1947', '1935', '1911']);
    const b1947 = r.coreSample.find((b) => b.eraId === '1947')!;
    expect(b1947.crop).toEqual({ kind: 'none', text: 'No 1947 photograph loaded yet' });
    const b1911 = r.coreSample.find((b) => b.eraId === '1911')!;
    expect(b1911.crop.kind).toBe('tile');
    // A quoted use is the plan's own lettering, so "Uses recorded" lines are left out of this check.
    for (const band of r.coreSample) for (const s of band.sentences.filter((x) => !x.text.startsWith('Uses recorded'))) expect(s.text).not.toMatch(BODY_FORBIDDEN);
    const outline = b1911.sentences.map((s) => s.text).find((t) => /building outline/.test(t));
    expect(outline).toMatch(/the 1911 plan (sits|sit) (on this lot|near this lot \(within \d+ m\))\.$/);
  });
});
