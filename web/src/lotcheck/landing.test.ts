import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkSentence, findBannedWords } from '../evidence';
import type { Feature, FeatureCollection, PresentLayer } from '../evidence';
import { E0, makeCollection, makeFeature, makeSource, N0, obs, P1911, P1935 } from '../evidence/testing/fixtures';
import { rect } from '../evidence/testing/fixtures';
import { addressesLayer, registry } from '../report/testing/fixtures';
import { industrialLots, landingFact, normaliseLettering, pickExamples } from './landing';

function area(origin: string, seq: number, at: [number, number], size: [number, number], use: string, errorM: number): Feature {
  const f = makeFeature(origin, [obs(origin, true, 'clear', 'origin')], { seq, kind: 'land_use', at, size, positionErrorM: errorM });
  f.properties.attributes = { use };
  return f;
}

function points(list: Array<{ text: string; e: number; n: number }>): PresentLayer {
  const base = addressesLayer();
  return { ...base, features: list.map((p, i) => ({ type: 'Feature', id: `p${i}`, geometry: { type: 'Point', coordinates: [p.e, p.n] }, properties: { ADDRESS_FULL: p.text } })) } as unknown as PresentLayer;
}

describe('normaliseLettering', () => {
  it('uses the head, lowercase, "&" as "and", one space between words', () => {
    expect(normaliseLettering('Coal & Wood Yard; J. W. Corson & Co. (as lettered on the plate)')).toBe('coal and wood yard');
    expect(normaliseLettering('Coal & Wood Yard; Northern Fuels Co. (as lettered on the plate)')).toBe('coal and wood yard');
    expect(normaliseLettering('  Cork   Fac.; Freyseng Cork Co. Ltd.')).toBe('cork fac');
  });
});

describe('landingFact', () => {
  it('counts the addresses inside the areas shrunk by their own errors, as words, with a checked sentence', () => {
    const collections: FeatureCollection[] = [
      makeCollection(P1911, [area(P1911, 1, [E0, N0], [40, 40], 'Coal & Wood Yard; A (as lettered on the plate)', 4.5)]),
      makeCollection(P1935, [area(P1935, 1, [E0 + 30, N0], [40, 40], 'Coal & Wood Yard; B (as lettered on the plate)', 4.5)]),
    ];
    const layer = points([
      { text: '1 Inside St', e: E0 + 20, n: N0 + 20 },
      { text: '2 Edge St', e: E0 + 1, n: N0 + 20 },
      { text: '3 Second St', e: E0 + 60, n: N0 + 20 },
      { text: '4 Far St', e: E0 + 500, n: N0 },
    ]);
    const fact = landingFact(collections, layer, registry());
    expect(fact?.count).toBe(2);
    expect(fact?.addresses).toEqual(['1 Inside St', '3 Second St']);
    expect(fact?.sentence.text).toBe('On this block, two addresses stand on a former coal and wood yard.');
    expect(checkSentence(fact!.sentence.text, fact!.sentence.pack)).toEqual({ ok: true });
  });

  it('says one address stands, and omits the fact when no address is inside', () => {
    const collections = [makeCollection(P1911, [area(P1911, 1, [E0, N0], [40, 40], 'Lumber Piles', 2)])];
    const one = landingFact(collections, points([{ text: '9 Lone St', e: E0 + 20, n: N0 + 20 }]), registry());
    expect(one?.sentence.text).toBe('On this block, one address stands on a former lumber piles.');
    expect(landingFact(collections, points([{ text: '9 Lone St', e: E0 + 900, n: N0 }]), registry())).toBeNull();
    expect(landingFact(collections, undefined, registry())).toBeNull();
  });

  it('writes counts above twelve as digits that the fact pack holds', () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ text: `${i + 1} Many St`, e: E0 + 10 + i, n: N0 + 20 }));
    const fact = landingFact([makeCollection(P1911, [area(P1911, 1, [E0, N0], [40, 40], 'Coal Yard', 2)])], points(many), registry());
    expect(fact?.sentence.text).toBe('On this block, 14 addresses stand on a former coal yard.');
    expect(checkSentence(fact!.sentence.text, fact!.sentence.pack)).toEqual({ ok: true });
  });

  it('counts only industrial lettering, published areas of registered sources', () => {
    const notIndustrial = area(P1911, 1, [E0, N0], [40, 40], 'Baptist Mission Hall', 2);
    const unregistered = area('fip_v3_1999_999', 1, [E0, N0], [40, 40], 'Coal Yard', 2);
    const rejected = area(P1911, 2, [E0, N0], [40, 40], 'Coal Yard', 2);
    rejected.properties.status = 'rejected';
    const layer = points([{ text: '1 Inside St', e: E0 + 20, n: N0 + 20 }]);
    expect(landingFact([makeCollection(P1911, [notIndustrial, rejected]), makeCollection('fip_v3_1999_999', [unregistered])], layer, registry())).toBeNull();
  });

  it('never prints an address or lettering with a banned word', () => {
    const collections = [makeCollection(P1911, [area(P1911, 1, [E0, N0], [40, 40], 'Clean Coal Yard', 2)])];
    expect(landingFact(collections, points([{ text: '1 Inside St', e: E0 + 20, n: N0 + 20 }]), registry())).toBeNull();
    const ok = [makeCollection(P1911, [area(P1911, 1, [E0, N0], [40, 40], 'Coal Yard', 2)])];
    const fact = landingFact(ok, points([{ text: '1 Clean St', e: E0 + 20, n: N0 + 20 }, { text: '2 Fine St', e: E0 + 21, n: N0 + 20 }]), registry());
    expect(fact?.addresses).toEqual(['2 Fine St']);
    expect(findBannedWords(fact!.sentence.text)).toEqual([]);
  });

  // P4: the count equals an independent count of points inside generated rectangles shrunk by their errors.
  it('P4: the count equals an independent count of points in the shrunk rectangles', () => {
    const rectArb = fc.record({
      x: fc.integer({ min: 0, max: 60 }),
      y: fc.integer({ min: 0, max: 60 }),
      w: fc.integer({ min: 4, max: 50 }),
      h: fc.integer({ min: 4, max: 50 }),
      err: fc.constantFrom(2, 3.5, 6),
    });
    const coordinate = fc.integer({ min: -20, max: 480 }).map((v) => v / 4 + 0.013);
    const pointArb = fc.record({ e: coordinate, n: coordinate });
    let positive = 0;
    fc.assert(
      fc.property(fc.array(rectArb, { minLength: 1, maxLength: 4 }), fc.array(pointArb, { maxLength: 25 }), (rects, pts) => {
        // Distance from a point to the boundary of the exactly shrunk rectangle; points within 0.3 m of it are ambiguous and skipped.
        const sd = (r: (typeof rects)[number], p: (typeof pts)[number]): number => {
          const x0 = r.x + r.err;
          const x1 = r.x + r.w - r.err;
          const y0 = r.y + r.err;
          const y1 = r.y + r.h - r.err;
          if (x1 <= x0 || y1 <= y0) return -Infinity;
          const inside = Math.min(p.e - x0, x1 - p.e, p.n - y0, y1 - p.n);
          return inside;
        };
        const usable = pts.filter((p) => rects.every((r) => Math.abs(sd(r, p)) > 0.3 || sd(r, p) === -Infinity));
        const expected = usable.filter((p) => rects.some((r) => sd(r, p) > 0)).length;
        const features = rects.map((r, i) => area(P1911, i + 1, [E0 + r.x, N0 + r.y], [r.w, r.h], 'Coal Yard', r.err));
        const layer = points(usable.map((p, i) => ({ text: `${i + 1} Test St`, e: E0 + p.e, n: N0 + p.n })));
        const fact = landingFact([makeCollection(P1911, features)], layer, registry());
        expect(fact?.count ?? 0).toBe(expected);
        if (expected > 0) positive++;
      }),
      { numRuns: 200 },
    );
    expect(positive).toBeGreaterThan(20);
  });
});

describe('industrialLots and pickExamples', () => {
  it('finds the lots a trigger sits on, with their addresses and the earliest lettering', () => {
    const lotsBase = (addressesLayer() as unknown) as PresentLayer;
    const lots = {
      ...lotsBase,
      features: [
        { type: 'Feature', id: 'lot_x', geometry: { type: 'Polygon', coordinates: [rect(E0, N0, 20, 30)] }, properties: {} },
        { type: 'Feature', id: 'lot_y', geometry: { type: 'Polygon', coordinates: [rect(E0 + 200, N0, 20, 30)] }, properties: {} },
      ],
    } as unknown as PresentLayer;
    const addresses = points([
      { text: '2B Test St', e: E0 + 5, n: N0 + 5 },
      { text: '2A Test St', e: E0 + 6, n: N0 + 6 },
      { text: '9 Other St', e: E0 + 205, n: N0 + 5 },
    ]);
    const collections = [makeCollection(P1911, [area(P1911, 1, [E0 + 2, N0 + 2], [10, 10], 'Coal Yard; A', 2), area(P1911, 2, [E0 + 200, N0 + 2], [10, 10], 'Baptist Mission Hall', 2)])];
    const reg = { ...registry(), sources: [...registry().sources, makeSource('fip_v3_1999_999', 1999, 1999)] };
    expect(industrialLots(collections, lots, addresses, reg)).toEqual([{ lotId: 'lot_x', addresses: ['2A Test St', '2B Test St'], key: 'coal yard' }]);
  });

  it('picks up to three distinct lots, distinct lettering first, shown in address order', () => {
    const tagged = [
      { lotId: 'l1', addresses: ['9 Z St', '1 A St'], key: 'coal yard' },
      { lotId: 'l2', addresses: ['2 B St'], key: 'coal yard' },
      { lotId: 'l3', addresses: ['3 C St'], key: 'coal yard' },
      { lotId: 'l4', addresses: ['8 Y St'], key: 'machine shop' },
      { lotId: 'l5', addresses: ['7 X St'], key: 'lumber' },
    ];
    const picked = pickExamples(tagged);
    expect(picked.map((p) => p.address)).toEqual(['1 A St', '7 X St', '8 Y St']);
    expect(new Set(picked.map((p) => p.lotId)).size).toBe(3);
    expect(pickExamples(tagged.slice(0, 2)).map((p) => p.address)).toEqual(['1 A St', '2 B St']);
    expect(pickExamples([])).toEqual([]);
  });
});
