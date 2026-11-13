/**
 * The Report's correctness properties R1 to R9 (spec 05 design "Correctness properties"), over
 * generated worlds. R11 (share links) is in links.property.test.ts and R12 (print limits) is
 * spec 05 task 7.2, which is not done yet.
 *
 * Every property runs 200 times. A counterexample is a bug in the code, never a reason to loosen
 * the property.
 */
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { checkSentence, featuresForEra, findBannedWords, indexSources, lotRelation, sourceYearsText } from '../evidence';
import type { Feature, FeatureCollection } from '../evidence';
import { allSentences, buildReport } from './buildReport';
import type { Report, ReportModel } from './buildReport';
import { SCREENS_LINE } from './copy';
import { LOT_POSITION_ERROR_M } from './lotError';
import { RADIUS_M } from './radii';
import { buildCollections, worldArb } from './testing/arbitraries';
import type { Box, World } from './testing/arbitraries';
import { ERAS, LOT_GEOMETRY, E0, N0, P1911, P1935, inputs, registry } from './testing/fixtures';

const RUNS = { numRuns: 200 };

const model = (collections: FeatureCollection[]): ReportModel => buildReport(inputs(collections));

function asReport(m: ReportModel): Report | null {
  expect(m.kind, m.kind === 'failed' ? m.reason : '').not.toBe('failed');
  return m.kind === 'report' ? m : null;
}

const featureIndex = (collections: FeatureCollection[]): Map<string, Feature> => new Map(collections.flatMap((c) => c.features).map((f) => [f.id, f]));

function relationOf(feature: Feature) {
  return lotRelation({ geometry: feature.geometry, positionErrorM: feature.properties.position_error_m }, { geometry: LOT_GEOMETRY, positionErrorM: LOT_POSITION_ERROR_M });
}

describe('R1 every finding sentence has a source and no banned word', () => {
  it('holds for generated worlds', () => {
    const ids = new Set(registry().sources.map((s) => s.id));
    fc.assert(
      fc.property(worldArb, (world) => {
        const r = asReport(model(buildCollections(world)));
        if (!r) return;
        const groups = [...r.groups, ...(r.workspace?.groups ?? [])];
        for (const g of groups) {
          for (const f of g.findings) {
            expect(f.finding.sourceIds.length).toBeGreaterThan(0);
            for (const s of f.finding.sourceIds) expect(ids.has(s)).toBe(true);
            expect(findBannedWords(f.finding.text)).toEqual([]);
          }
        }
        for (const s of allSentences(r)) expect(findBannedWords(s.text), s.text).toEqual([]);
      }),
      RUNS,
    );
  });
});

describe('R2 "on this lot" never appears when the shrink test fails', () => {
  it('holds for every sentence of generated worlds', () => {
    fc.assert(
      fc.property(worldArb, (world) => {
        const collections = buildCollections(world);
        const r = asReport(model(collections));
        if (!r) return;
        const features = featureIndex(collections);
        for (const s of allSentences(r)) {
          const hasOn = s.text.includes('on this lot');
          const onClaims = s.claims.filter((c) => c.kind === 'on');
          if (hasOn) {
            expect(s.claims.length, s.text).toBeGreaterThan(0);
            expect(onClaims.length, s.text).toBe(s.claims.length);
            for (const c of onClaims) expect(relationOf(features.get(c.featureId) as Feature), s.text).toEqual({ kind: 'on' });
          } else {
            expect(onClaims, s.text).toEqual([]);
          }
          const nears = [...s.text.matchAll(/near this lot \(within (\d+) m\)/g)].map((m) => Number(m[1]));
          const nearClaims = s.claims.flatMap((c) => (c.kind === 'near' ? [c] : []));
          for (const x of nears) {
            const confirming = nearClaims.filter((c) => c.withinM === x);
            expect(confirming.length, s.text).toBeGreaterThan(0);
            expect(confirming.some((c) => {
              const rel = relationOf(features.get(c.featureId) as Feature);
              return rel.kind === 'near' && rel.withinM === x;
            }), s.text).toBe(true);
          }
          if (nears.length > 0) {
            const widest = Math.max(...nears);
            for (const c of nearClaims) expect(c.withinM, s.text).toBeLessThanOrEqual(widest);
          }
        }
      }),
      RUNS,
    );
  });
});

describe('R3 the same lot and evidence give the same report', () => {
  it('holds twice, under permutation, and with the clock and randomness unavailable', () => {
    fc.assert(
      fc.property(worldArb, fc.integer({ min: 0, max: 1000 }), (world, seed) => {
        const collections = buildCollections(world);
        const first = model(collections);
        const permuted = [...collections].reverse().map((c) => ({ ...c, features: [...c.features].sort((a, b) => ((a.id + seed) < (b.id + seed) ? 1 : -1)) }));
        const random = vi.spyOn(Math, 'random').mockImplementation(() => {
          throw new Error('Math.random was called');
        });
        const now = vi.spyOn(Date, 'now').mockImplementation(() => {
          throw new Error('Date.now was called');
        });
        try {
          expect(model(collections)).toEqual(first);
          const registryReversed = inputs(permuted);
          registryReversed.canon.registry = { ...registryReversed.canon.registry, sources: [...registryReversed.canon.registry.sources].reverse() };
          expect(buildReport(registryReversed)).toEqual(first);
        } finally {
          random.mockRestore();
          now.mockRestore();
        }
      }),
      RUNS,
    );
  });
});

describe('R4 "Nothing found" and "Not covered" list every record checked', () => {
  it('holds for generated worlds', () => {
    const plates = registry().sources.filter((s) => s.type === 'fire_insurance_plan');
    fc.assert(
      fc.property(worldArb, (world) => {
        const r = asReport(model(buildCollections(world)));
        if (!r) return;
        for (const g of r.groups) {
          for (const f of g.findings) {
            if (f.finding.status !== 'nothing_found' && f.finding.status !== 'not_covered') continue;
            expect(f.finding.checked.map((c) => c.sourceId)).toEqual([...plates].sort((a, b) => a.year_from! - b.year_from! || (a.id < b.id ? -1 : 1)).map((s) => s.id));
            for (const c of f.finding.checked) {
              const source = plates.find((s) => s.id === c.sourceId)!;
              expect(c.yearFrom).toBe(source.year_from);
              expect(c.yearTo).toBe(source.year_to);
              expect(f.finding.text).toContain(c.sourceId);
              expect(f.finding.text).toContain(String(c.yearFrom));
              expect(f.finding.text).toContain(String(c.yearTo));
              expect(f.finding.text).toContain(sourceYearsText(source));
            }
          }
        }
      }),
      RUNS,
    );
  });
});

/** Lot bounding box grown by `r`, inside `box` with the 0.01 m tolerance (reviewed areas are rectangles). */
function grownInside(box: Box, r: number): boolean {
  const lot = { x0: E0, y0: N0, x1: E0 + 20, y1: N0 + 30 };
  const t = 0.01;
  return box.x0 - t <= lot.x0 - r && box.y0 - t <= lot.y0 - r && box.x1 + t >= lot.x1 + r && box.y1 + t >= lot.y1 + r;
}

describe('R5 "Nothing found" only where every clear record was checked; water only where water was attested', () => {
  it('holds for generated worlds', () => {
    const needs: Record<string, { radius: number; kinds: string[] }> = {
      water: { radius: RADIUS_M.water, kinds: ['water'] },
      land_use: { radius: RADIUS_M.land_use, kinds: ['building', 'land_use'] },
      structures: { radius: RADIUS_M.structures, kinds: ['building'] },
    };
    fc.assert(
      fc.property(worldArb, (world: World) => {
        const r = asReport(model(buildCollections(world)));
        if (!r) return;
        for (const g of r.groups) {
          for (const f of g.findings) {
            if (f.finding.status !== 'nothing_found') continue;
            const need = needs[g.id]!;
            const clear = f.finding.checked.filter((c) => c.visibility === 'clear');
            expect(clear.length).toBeGreaterThan(0);
            for (const c of clear) {
              const plate = world.plates[c.sourceId as typeof P1911];
              expect(plate.present).toBe(true);
              expect(plate.reviewed).not.toBeNull();
              const covers = plate.reviewed!.covers ?? ['building'];
              for (const k of need.kinds) expect(covers).toContain(k);
              expect(grownInside(plate.reviewed!.box, need.radius)).toBe(true);
            }
            if (g.id === 'water') expect(f.finding.text).not.toContain('shows this lot, not fully checked here');
          }
        }
      }),
      RUNS,
    );
  });
});

describe('R6 outside coverage there is nothing else', () => {
  it('holds for an unknown lot and for a world whose plates map elsewhere', () => {
    const NOT = { kind: 'not_reconstructed', text: 'Not reconstructed yet.' };
    fc.assert(
      fc.property(worldArb, fc.string({ minLength: 1, maxLength: 12 }), (world, name) => {
        const collections = buildCollections(world);
        expect(buildReport({ ...inputs(collections), lotId: `x${name}` })).toEqual(NOT);
        const far = collections.map((c) => ({
          ...c,
          mapped_area: c.mapped_area ? { ...c.mapped_area, geometry: { type: 'Polygon', coordinates: [[[E0 + 9000, N0], [E0 + 9100, N0], [E0 + 9100, N0 + 100], [E0 + 9000, N0], [E0 + 9000, N0]]] } } : undefined,
        })) as FeatureCollection[];
        expect(model(far)).toEqual(NOT);
      }),
      RUNS,
    );
  });
});

describe('R8 every template sentence passes its own check; inserted figures, ids and banned words are caught', () => {
  it('holds for the sentences of generated worlds', () => {
    fc.assert(
      fc.property(worldArb, (world) => {
        const r = asReport(model(buildCollections(world)));
        if (!r) return;
        for (const s of allSentences(r)) {
          expect(checkSentence(s.text, s.pack), s.text).toEqual({ ok: true });
          expect(checkSentence(`${s.text} 987654`, s.pack).ok, s.text).toBe(false);
          expect(checkSentence(`${s.text} bld_zz_zz_9999`, s.pack).ok, s.text).toBe(false);
          expect(checkSentence(`${s.text} This is Safe.`, s.pack).ok, s.text).toBe(false);
        }
      }),
      RUNS,
    );
  });
});

describe('R9 required parts, in order', () => {
  it('holds for generated worlds', () => {
    fc.assert(
      fc.property(worldArb, (world) => {
        const r = asReport(model(buildCollections(world)));
        if (!r) return;
        expect(r.screensLine.text).toBe(SCREENS_LINE);
        expect(r.groups.map((g) => g.id)).toEqual(['water', 'land_use', 'structures']);
        expect(r.coreSample.map((b) => b.eraId)).toEqual(['today', '1947', '1935', '1911']);
        const cannot = r.cannotTell.map((s) => s.text).join(' ');
        expect(cannot).toContain('present-day soil, water or structural condition');
        expect(cannot).toContain('only the years of these records');
        expect(cannot).toContain('underground utilities');
        expect(cannot).toContain('History before colonial maps');
        expect(r.beforeYouDig.map((s) => s.text)).toEqual(["Buried's maps are not utility locates.", 'Request locates through Ontario Dig Authority before you dig.']);
        expect(r.beforeYouDigLink.url).toBe('https://ontariodigauthority.ca/');
        expect(r.sources.length).toBeGreaterThan(0);
        for (const g of r.groups) expect(g.findings.length).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });

  it.todo('the City of Toronto land acknowledgement link is present (needs spec 05 task 5.3 to look up the URL)');
});

describe('the generator exercises the cases the properties are about', () => {
  it('produces reports, every finding status, near and on relations, conflicts and unprintable uses', () => {
    const seen = new Set<string>();
    const worlds = fc.sample(worldArb, { numRuns: 400, seed: 7 });
    for (const world of worlds) {
      const r = model(buildCollections(world));
      seen.add(r.kind);
      if (r.kind !== 'report') continue;
      for (const g of r.groups) {
        for (const f of g.findings) {
          seen.add(`${g.id}:${f.finding.status}`);
          if (f.finding.text.includes('The records disagree')) seen.add('conflict');
          if (f.finding.text.includes('near this lot')) seen.add('near');
          if (f.finding.text.includes('on this lot')) seen.add('on');
          if (f.finding.text.includes('not reproduced')) seen.add('unprintable');
          if (f.finding.text.startsWith('Water is drawn on this lot')) seen.add('water-then-building');
        }
      }
      if (r.coreSample.some((b) => b.sentences.some((s) => s.text.includes('sits on this lot') || s.text.includes('sit on this lot')))) seen.add('band-on');
    }
    for (const needed of ['report', 'not_reconstructed', 'water:documented', 'water:nothing_found', 'water:not_covered', 'structures:documented', 'structures:estimated', 'structures:nothing_found', 'structures:not_covered', 'land_use:documented', 'land_use:not_covered', 'conflict', 'near', 'on', 'unprintable', 'band-on']) {
      expect(seen.has(needed), `${needed} was never generated`).toBe(true);
    }
    expect(seen.has('failed')).toBe(false);
  });
});

describe('R7 bands never show a feature outside its era', () => {
  it('holds for generated worlds', () => {
    const sources = indexSources(registry());
    fc.assert(
      fc.property(worldArb, (world) => {
        const collections = buildCollections(world);
        const r = asReport(model(collections));
        if (!r) return;
        for (const band of r.coreSample) {
          const era = ERAS.find((e) => e.id === band.eraId)!;
          const drawn = new Set(featuresForEra(collections, sources, era).features.map((f) => f.id));
          if (band.eraId === 'today') expect(band.featureIds).toEqual([]);
          for (const id of band.featureIds) expect(drawn.has(id), `${id} in ${band.eraId}`).toBe(true);
        }
      }),
      RUNS,
    );
  });
});
