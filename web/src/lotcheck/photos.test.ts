import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeSheetTransform, worldToPixel } from '../block/sheetTransform';
import type { Pt, TileCorners } from '../block/sheetTransform';
import { checkSentence, findBannedWords } from '../evidence';
import type { WorldPolygon } from './compare';
import { compareModel, frameHolding } from './compare';
import {
  applyPlacement,
  boundsCorners,
  boundsHoldLot,
  imaginedLine,
  layerCaption,
  layerChoices,
  NOW_OUTLINES_LABEL,
  NOW_PHOTO_LABEL,
  onLotFeatureIds,
  parseImagined,
  parsePhotos,
  photoLine,
  photoPlacement,
  placementText,
  streetCaption,
  viewsOnLot,
} from './photos';
import type { Bounds, ImaginedView, Photo, ThenShown } from './photos';

const PUBLIC = resolve(__dirname, '../../public/lotcheck');
const readJson = (path: string): unknown => JSON.parse(readFileSync(resolve(PUBLIC, path), 'utf8'));

const CORNERS: TileCorners = {
  top_left: [632312.268258896, 4835087.454831159],
  top_right: [632596.4688413026, 4835177.21913871],
  bottom_right: [632699.789440777, 4834849.898286615],
  bottom_left: [632415.5888583706, 4834760.1339790635],
};
const TRANSFORM = makeSheetTransform(CORNERS, 3626, 4096);

const box = (e: number, n: number, w: number, h: number): WorldPolygon => [[[e, n], [e + w, n], [e + w, n + h], [e, n + h], [e, n]]];

const photo = (over: Partial<Photo> & { id: string; year: number }): Photo => ({
  src: `/lotcheck/aerial/${over.id}.jpg`,
  label: `${over.year} aerial photograph, City of Toronto`,
  bounds: [632295, 4834745, 632715, 4835185],
  widthPx: 1680,
  heightPx: 1760,
  approximate: false,
  licence: '',
  attribution: '',
  dataset: '',
  note: '',
  sourceUrl: '',
  fetched: '',
  metresPerPixel: 0.25,
  ...over,
});
const PHOTOS = [photo({ id: 'today-2025', year: 2025 }), photo({ id: 'aerial-1939', year: 1939, approximate: true })];

const view = (slug: string, featureIds: string[], topdownBounds: Bounds | null, planName = 'the 1911 plan', about = 'about 1911'): ImaginedView => ({
  slug,
  featureIds,
  planSource: 'fip_v3_1911_229',
  planName,
  about,
  topdown: topdownBounds ? { src: `/lotcheck/imagined/${slug}-topdown.jpg`, bounds: topdownBounds, widthPx: 1100, heightPx: 900 } : null,
  street: { src: `/lotcheck/imagined/${slug}-street.jpg`, widthPx: 1200, heightPx: 800, caption: 'The coal and wood yard.' },
  note: null,
});

const PLANS = [
  { sourceId: 'fip_v3_1911_229', planName: 'the 1911 plan', label: '1911 plan' },
  { sourceId: 'fip_v3_1935_229', planName: 'the 1931-35 plan', label: '1931-35 plan' },
];
const LOT = box(632500, 4834960, 12, 26);

describe('photoPlacement (P11)', () => {
  it('puts the four corners of a picture where worldToPixel puts the four world points, within 1 px', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 632000, max: 633000, noNaN: true }),
        fc.double({ min: 4834000, max: 4835500, noNaN: true }),
        fc.double({ min: 5, max: 600, noNaN: true }),
        fc.double({ min: 5, max: 600, noNaN: true }),
        fc.integer({ min: 100, max: 3000 }),
        fc.integer({ min: 100, max: 3000 }),
        fc.double({ min: -0.6, max: 0.6, noNaN: true }),
        fc.double({ min: 0.02, max: 0.5, noNaN: true }),
        (minE, minN, wM, hM, widthPx, heightPx, angle, pxPerMetre) => {
          // A tile turned by `angle` from north, with its own corners, like a real sidecar.
          const w = 4000;
          const h = 4000;
          const cos = Math.cos(angle) / pxPerMetre;
          const sin = Math.sin(angle) / pxPerMetre;
          const tl: Pt = [632400, 4835100];
          const corners: TileCorners = {
            top_left: tl,
            top_right: [tl[0] + w * cos, tl[1] + w * sin],
            bottom_left: [tl[0] + h * sin, tl[1] - h * cos],
            bottom_right: [tl[0] + w * cos + h * sin, tl[1] + w * sin - h * cos],
          };
          const t = makeSheetTransform(corners, w, h);
          const bounds: Bounds = [minE, minN, minE + wM, minN + hM];
          const p = photoPlacement(bounds, widthPx, heightPx, t);
          const imageCorners: Pt[] = [
            [0, 0],
            [widthPx, 0],
            [widthPx, heightPx],
            [0, heightPx],
          ];
          boundsCorners(bounds).forEach((world, i) => {
            const want = worldToPixel(t, world);
            const got = applyPlacement(p, imageCorners[i] as Pt);
            expect(Math.abs(got[0] - want[0])).toBeLessThan(1);
            expect(Math.abs(got[1] - want[1])).toBeLessThan(1);
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it('puts the committed photographs on the plan tile: north-west first, so the picture is turned with the tile', () => {
    const p = photoPlacement([632295, 4834745, 632715, 4835185], 1680, 1760, TRANSFORM);
    const nw = applyPlacement(p, [0, 0]);
    expect(nw[0]).toBeCloseTo(worldToPixel(TRANSFORM, [632295, 4835185])[0], 6);
    expect(placementText(p)).toMatch(/^matrix\((-?[\d.e+-]+ ){5}-?[\d.e+-]+\)$/);
  });
});

describe('the committed indexes', () => {
  const photos = parsePhotos(readJson('aerial/aerial.json'));
  const imagined = parseImagined(readJson('imagined/imagined.json'));

  it('hold both photographs and every imagined view, and every file they name is on disk', () => {
    expect(photos.map((p) => p.id)).toEqual(['aerial-1939', 'today-2025']);
    expect(imagined.views.length).toBeGreaterThanOrEqual(9);
    for (const p of photos) expect(existsSync(resolve(PUBLIC, 'aerial', p.src.split('/').pop() as string)), p.src).toBe(true);
    for (const v of imagined.views) {
      for (const pic of [v.topdown, v.street]) if (pic) expect(existsSync(resolve(PUBLIC, 'imagined', pic.src.split('/').pop() as string)), pic.src).toBe(true);
    }
  });

  it('say 1939 is approximate and 2025 is not, and carry the licence and attribution the Sources page prints', () => {
    expect(photos.find((p) => p.year === 1939)?.approximate).toBe(true);
    expect(photos.find((p) => p.year === 2025)?.approximate).toBe(false);
    for (const p of photos) {
      expect(p.licence).toBe('Open Government Licence - Toronto');
      expect(p.attribution).toBe('Contains information licensed under the Open Government Licence - Toronto.');
    }
  });

  it('hold no banned word in any caption or line this site prints', () => {
    for (const v of imagined.views) {
      expect(findBannedWords(v.street?.caption ?? ''), v.slug).toEqual([]);
      expect(streetCaption(v)).toBe(v.street?.caption);
    }
  });

  it('drop an entry that is malformed, and an index that is not an index', () => {
    expect(parsePhotos(null)).toEqual([]);
    expect(parsePhotos({ photos: [{ id: 'x' }, 3] })).toEqual([]);
    expect(parseImagined({ views: [{ slug: 'a' }] }).views).toEqual([]);
    expect(parseImagined('nope').views).toEqual([]);
    expect(parsePhotos({ photos: [{ id: 'x', file: 'x.jpg', label: 'l', year: 2000, width_px: 1, height_px: 1, bounds: [5, 5, 1, 1] }] })).toEqual([]);
  });

  it('streetCaption never prints a caption with a banned word', () => {
    expect(streetCaption({ street: { src: '', widthPx: 1, heightPx: 1, caption: 'A clean yard' } })).toBe('A view imagined from the plan.');
    expect(streetCaption({ street: null })).toBe('A view imagined from the plan.');
  });
});

describe('which imagined views a lot may show (P13)', () => {
  const coal = view('coal-yard', ['use_a', 'bld_b'], [632450, 4834900, 632560, 4835020]);
  const lumber = view('lumber-yard', ['use_c'], [632450, 4834900, 632560, 4835020]);
  const rows = (kinds: Array<[string, 'on' | 'near']>) => [
    { kind: 'plan', lines: kinds.map(([featureId, k]) => ({ featureId, relation: { kind: k } })) },
    { kind: 'today' },
  ];

  it('offers a view only for a lettered use on the lot, never for one that is only next to it', () => {
    const on = onLotFeatureIds(rows([['use_a', 'on'], ['use_c', 'near']]));
    expect(viewsOnLot(on, [coal, lumber]).map((v) => v.slug)).toEqual(['coal-yard']);
    expect(viewsOnLot(onLotFeatureIds(rows([['use_a', 'near']])), [coal, lumber])).toEqual([]);
    expect(viewsOnLot(onLotFeatureIds(rows([])), [coal, lumber])).toEqual([]);
  });

  it('property: every offered view has a feature id that is on the lot; a lot with only near lines gets none', () => {
    const id = fc.constantFrom('use_a', 'bld_b', 'use_c', 'use_z');
    fc.assert(
      fc.property(fc.array(fc.tuple(id, fc.constantFrom('on', 'near')), { maxLength: 8 }), (lines) => {
        const on = onLotFeatureIds(rows(lines as Array<[string, 'on' | 'near']>));
        const offered = viewsOnLot(on, [coal, lumber]);
        for (const v of offered) expect(v.featureIds.some((f) => lines.some(([lf, k]) => lf === f && k === 'on'))).toBe(true);
        if (lines.every(([, k]) => k === 'near')) expect(offered).toEqual([]);
      }),
    );
  });

  it('leaves the plan as the first choice and today as the default Now: nothing imagined is a default', () => {
    const c = layerChoices({ plans: PLANS, lot: LOT, photos: PHOTOS, onLotViews: [coal] });
    expect(c.then[0]?.key).toBe('fip_v3_1911_229');
    expect(c.then.map((x) => x.label)).toEqual(['1911 plan', '1931-35 plan', '1939 photo', 'Imagined, about 1911']);
    expect(c.now.map((x) => x.label)).toEqual([NOW_PHOTO_LABEL, NOW_OUTLINES_LABEL]);
    expect(c.now[0]?.key).toBe('photo');
  });

  it('offers no imagined top-down view when the lot lies outside its picture, or when it has none', () => {
    const far = view('far', ['use_a'], [632000, 4834000, 632100, 4834100]);
    const noTop = view('no-top', ['use_a'], null);
    const c = layerChoices({ plans: PLANS, lot: LOT, photos: PHOTOS, onLotViews: [far, noTop] });
    expect(c.then.map((x) => x.label)).toEqual(['1911 plan', '1931-35 plan', '1939 photo']);
  });

  it('offers no photographs when the index has none, or when they do not hold the lot', () => {
    expect(layerChoices({ plans: PLANS, lot: LOT, photos: [], onLotViews: [] }).now.map((x) => x.label)).toEqual([NOW_OUTLINES_LABEL]);
    const elsewhere = [photo({ id: 'x', year: 2025, bounds: [600000, 4800000, 600100, 4800100] })];
    expect(boundsHoldLot(elsewhere[0]?.bounds as Bounds, LOT)).toBe(false);
    expect(layerChoices({ plans: PLANS, lot: LOT, photos: elsewhere, onLotViews: [] }).then.map((x) => x.label)).toEqual(['1911 plan', '1931-35 plan']);
  });

  it('keeps the verdict out of this module: it takes no check and reads no tag', () => {
    const source = readFileSync(resolve(__dirname, 'photos.ts'), 'utf8');
    expect(source).not.toMatch(/from '\.\/(lotCheck|computeLotCheck|lettering)'/);
    expect(source).not.toMatch(/\.tag\b|tagText/);
  });
});

describe('the caption under the view (P12)', () => {
  const lefts: ThenShown[] = [
    { kind: 'plan', years: '1911' },
    { kind: 'plan', years: '1931-35' },
    { kind: 'photo', year: 1939, approximate: true },
    { kind: 'imagined', planName: 'the 1911 plan' },
    { kind: 'imagined', planName: 'the 1931-35 plan' },
  ];
  const rights = [{ kind: 'photo' as const, year: 2025 }, { kind: 'outlines' as const }];

  it('says what each side is, in the words the brief gives', () => {
    expect(layerCaption(lefts[0] as ThenShown, rights[0] as never).text).toBe('Left: the 1911 plan, as digitized. Right: 2025 aerial photograph, City of Toronto.');
    expect(layerCaption(lefts[2] as ThenShown, rights[0] as never).text).toBe('Left: 1939 aerial photograph, City of Toronto, placed approximately. Right: 2025 aerial photograph, City of Toronto.');
    expect(layerCaption(lefts[3] as ThenShown, rights[0] as never).text).toBe('Left: Imagined from the 1911 plan. Not a photograph. Right: 2025 aerial photograph, City of Toronto.');
    expect(layerCaption(lefts[0] as ThenShown, rights[1] as never).text).toContain("Right: today's building outlines and lot lines, City of Toronto.");
    expect(imaginedLine('the 1911 plan').text).toBe('Imagined from the 1911 plan. Not a photograph.');
    expect(photoLine(1939).text).toBe('1939 aerial photograph, City of Toronto.');
  });

  it('every caption with an imagined layer says "Imagined" and "Not a photograph"; no other caption does; all pass the sentence check', () => {
    for (const l of lefts) {
      for (const r of rights) {
        const s = layerCaption(l, r);
        expect(findBannedWords(s.text), s.text).toEqual([]);
        expect(checkSentence(s.text, s.pack).ok, s.text).toBe(true);
        expect(s.text.includes('Imagined') && s.text.includes('Not a photograph'), s.text).toBe(l.kind === 'imagined');
        if (l.kind !== 'imagined') expect(s.text).not.toMatch(/imagined|not a photograph/i);
      }
    }
  });

  it('property: for any years and plan names the lines hold, an imagined caption names the plan and a real one never says imagined', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1800, max: 2030 }), fc.integer({ min: 1800, max: 2030 }), fc.boolean(), (a, b, approximate) => {
        const imaginedCaption = layerCaption({ kind: 'imagined', planName: `the ${a} plan` }, { kind: 'photo', year: b }).text;
        expect(imaginedCaption).toContain(`Imagined from the ${a} plan. Not a photograph.`);
        const real = layerCaption({ kind: 'photo', year: a, approximate }, { kind: 'photo', year: b }).text;
        expect(real).not.toMatch(/imagined/i);
        expect(real.includes('placed approximately')).toBe(approximate);
      }),
    );
  });
});

describe('the frame that holds a whole imagined picture', () => {
  const tile = { corners: CORNERS, widthPx: 3626, heightPx: 4096 };
  const topdown: Bounds = [632450, 4834900, 632560, 4835020];

  it('is never smaller than the lot frame, holds all four corners of the picture, and keeps the aspect', () => {
    const base = compareModel({ lot: LOT, tile, buildings: [], lots: [] });
    const held = compareModel({ lot: LOT, tile, buildings: [], lots: [], include: topdown });
    expect(held.viewBox.width).toBeGreaterThanOrEqual(base.viewBox.width);
    expect(held.viewBox.height).toBeGreaterThanOrEqual(base.viewBox.height);
    expect(held.viewBox.width / held.viewBox.height).toBeCloseTo(4 / 3, 1);
    for (const corner of boundsCorners(topdown)) {
      const [x, y] = worldToPixel(TRANSFORM, corner);
      expect(x).toBeGreaterThanOrEqual(held.viewBox.x);
      expect(x).toBeLessThanOrEqual(held.viewBox.x + held.viewBox.width);
      expect(y).toBeGreaterThanOrEqual(held.viewBox.y);
      expect(y).toBeLessThanOrEqual(held.viewBox.y + held.viewBox.height);
    }
  });

  it('property: any picture bounds are inside the widened frame', () => {
    fc.assert(
      fc.property(fc.double({ min: 632300, max: 632600, noNaN: true }), fc.double({ min: 4834800, max: 4835100, noNaN: true }), fc.double({ min: 10, max: 200, noNaN: true }), fc.double({ min: 10, max: 200, noNaN: true }), fc.constantFrom(1, 4 / 3), (e, n, w, h, aspect) => {
        const base = compareModel({ lot: LOT, tile, buildings: [], lots: [], aspect }).viewBox;
        const f = frameHolding(base, [e, n, e + w, n + h], TRANSFORM, aspect);
        for (const corner of boundsCorners([e, n, e + w, n + h])) {
          const [x, y] = worldToPixel(TRANSFORM, corner);
          expect(x).toBeGreaterThanOrEqual(f.x - 1e-6);
          expect(x).toBeLessThanOrEqual(f.x + f.width + 1e-6);
          expect(y).toBeGreaterThanOrEqual(f.y - 1e-6);
          expect(y).toBeLessThanOrEqual(f.y + f.height + 1e-6);
        }
      }),
    );
  });
});
