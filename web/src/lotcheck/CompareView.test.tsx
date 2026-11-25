import fc from 'fast-check';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TileCorners } from '../block/sheetTransform';
import { findBannedWords } from '../evidence';
import { CompareView } from './CompareView';
import type { ComparePlan } from './CompareView';
import type { WorldPolygon } from './compare';
import { chipsFit, clampPercent, DIVIDER_START, dividerForKey, dividerForPointer, dividerLabel, planAnnouncement } from './divider';

const CORNERS: TileCorners = {
  top_left: [632312.268258896, 4835087.454831159],
  top_right: [632596.4688413026, 4835177.21913871],
  bottom_right: [632699.789440777, 4834849.898286615],
  bottom_left: [632415.5888583706, 4834760.1339790635],
};
const box = (e: number, n: number, w: number, h: number): WorldPolygon => [[[e, n], [e + w, n], [e + w, n + h], [e, n + h], [e, n]]];
const PLANS: ComparePlan[] = [
  { sourceId: 'fip_v3_1911_229', planName: 'the 1911 plan', label: '1911 plan', tile: { src: '/data/tiles/a.jpg', widthPx: 3626, heightPx: 4096, corners: CORNERS } },
  { sourceId: 'fip_v3_1935_229', planName: 'the 1931-35 plan', label: '1931-35 plan', tile: { src: '/data/tiles/b.jpg', widthPx: 3626, heightPx: 4096, corners: CORNERS } },
];
const LOT = box(632500, 4834960, 12, 26);
const render = (over: Partial<Parameters<typeof CompareView>[0]> = {}) =>
  renderToStaticMarkup(<CompareView plans={PLANS} lot={LOT} buildings={[box(632510, 4834970, 8, 8)]} lots={[LOT]} loadPlan={false} {...over} />);

describe('the divider arithmetic', () => {
  it('moves 5 per cent by Left and Right, goes to the ends by Home and End, and ignores other keys', () => {
    expect(dividerForKey('ArrowLeft', 50)).toBe(45);
    expect(dividerForKey('ArrowRight', 50)).toBe(55);
    expect(dividerForKey('Home', 50)).toBe(0);
    expect(dividerForKey('End', 50)).toBe(100);
    expect(dividerForKey('a', 50)).toBeNull();
    expect(dividerForKey('Tab', 50)).toBeNull();
  });

  it('clamps to 0..100 whatever the keys and the pointer do', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('ArrowLeft', 'ArrowRight', 'Home', 'End', 'x'), { maxLength: 60 }),
        fc.array(fc.double({ min: -5000, max: 5000, noNaN: true }), { maxLength: 10 }),
        (keys, xs) => {
          let value = DIVIDER_START;
          for (const k of keys) value = dividerForKey(k, value) ?? value;
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(100);
          for (const x of xs) {
            const v = dividerForPointer(x, 100, 400);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(100);
          }
        },
      ),
    );
    expect(clampPercent(Number.NaN)).toBe(50);
    expect(dividerForPointer(300, 100, 400)).toBe(50);
    expect(dividerForPointer(10, 100, 400)).toBe(0);
    expect(dividerForPointer(900, 100, 400)).toBe(100);
  });

  it('keeps each corner label on its side of the divider', () => {
    expect(chipsFit(600, 50, 90, 60)).toEqual({ left: true, right: true });
    expect(chipsFit(600, 5, 90, 60)).toEqual({ left: false, right: true });
    expect(chipsFit(600, 95, 90, 60)).toEqual({ left: true, right: false });
    expect(chipsFit(0, 5, 90, 60)).toEqual({ left: true, right: true });
    fc.assert(
      fc.property(fc.integer({ min: 200, max: 1200 }), fc.integer({ min: 0, max: 100 }), fc.integer({ min: 40, max: 120 }), fc.integer({ min: 40, max: 120 }), (w, d, l, r) => {
        const fit = chipsFit(w, d, l, r);
        const x = (w * d) / 100;
        // A label that is shown ends at least 8 px before the divider (left) or starts at least 8 px after it (right).
        if (fit.left) expect(8 + l).toBeLessThanOrEqual(x - 8 + 1e-9);
        if (fit.right) expect(w - 8 - r).toBeGreaterThanOrEqual(x + 8 - 1e-9);
        // So two shown labels never touch each other.
        if (fit.left && fit.right) expect(8 + l).toBeLessThan(w - 8 - r);
      }),
    );
  });

  it('words the announcement and the slider name from the plan', () => {
    expect(planAnnouncement('the 1911 plan')).toBe('Now showing the 1911 plan');
    expect(dividerLabel('the 1911 plan')).toBe('Divider between the 1911 plan and today');
    expect(findBannedWords(planAnnouncement('the 1931-35 plan'))).toEqual([]);
  });
});

describe('CompareView markup', () => {
  it('is a slider named for the plan, at 50 per cent to start, with the plan switch above the frame', () => {
    const html = render();
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-label="Divider between the 1911 plan and today"');
    expect(html).toContain('aria-valuenow="50"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="100"');
    expect(html.indexOf('lc-switch')).toBeLessThan(html.indexOf('lc-frame'));
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="lc-plan-fip_v3_1911_229"/);
    expect(html).toMatch(/aria-pressed="false"[^>]*data-testid="lc-plan-fip_v3_1935_229"/);
    expect(html).toContain('Loading the plan.');
    expect(html).toContain('aria-live="polite"');
  });

  it('lists each plan, earliest first as given, and has no switch for one plan', () => {
    const one = render({ plans: [PLANS[0] as ComparePlan] });
    expect(one).not.toContain('lc-switch');
    expect(render().indexOf('1911 plan')).toBeLessThan(render().indexOf('1931-35 plan'));
  });

  it('starts at the divider it is given and clamps it', () => {
    expect(render({ initialDivider: 140 })).toContain('aria-valuenow="100"');
    expect(render({ initialDivider: -3 })).toContain('aria-valuenow="0"');
  });

  it('does not request the tile before the text is on screen', () => {
    expect(render({ loadPlan: false })).not.toContain('<image');
    expect(render({ loadPlan: false })).not.toContain('a.jpg');
  });

  // P5: for any divider in [0, 1], the model and the rendered outline path are equal.
  it('P5: the outline paths and the viewBox are the same at every divider position', () => {
    const outline = (html: string, testId: string) => new RegExp(`d="([^"]+)"[^>]*data-testid="${testId}"`).exec(html)?.[1];
    const viewBox = (html: string) => /viewBox="([^"]+)"/.exec(html)?.[1];
    const base = render({ initialDivider: 50 });
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 1 }), (percent, planIndex) => {
        const html = render({ initialDivider: percent, initialPlan: planIndex });
        const ref = render({ initialDivider: 50, initialPlan: planIndex });
        expect(outline(html, 'lc-outline-plan')).toBe(outline(ref, 'lc-outline-plan'));
        expect(outline(html, 'lc-outline-today')).toBe(outline(ref, 'lc-outline-today'));
        expect(outline(html, 'lc-outline-plan')).toBe(outline(html, 'lc-outline-today'));
        expect(viewBox(html)).toBe(viewBox(ref));
        // Only the clip variable moves.
        expect(html).toContain(`--divider:${percent}%`);
      }),
      { numRuns: 60 },
    );
    expect(outline(base, 'lc-outline-plan')).toBeTruthy();
  });

  it('draws the plan and today in the same viewBox, which is the model for a 4:3 frame or a square one', () => {
    const wide = render();
    const square = render({ aspect: 1 });
    const vb = (h: string) => (/viewBox="([^"]+)"/.exec(h)?.[1] ?? '').split(' ').map(Number);
    const [, , w1, h1] = vb(wide);
    const [, , w2, h2] = vb(square);
    expect((w1 as number) / (h1 as number)).toBeCloseTo(4 / 3, 1);
    expect((w2 as number) / (h2 as number)).toBeCloseTo(1, 1);
    expect(wide.match(/viewBox="([^"]+)"/g)?.length).toBe(2);
    expect(new Set(wide.match(/viewBox="([^"]+)"/g)).size).toBe(1);
  });
});

describe('where it stood and the sweep (session 053)', () => {
  it('draws each lettered use on the lot as a dashed outline on today\'s side only', () => {
    const html = render({ stood: [box(632503, 4834963, 6, 8), box(632505, 4834970, 4, 4)] });
    expect(html.match(/data-testid="lc-stood"/g)).toHaveLength(2);
    const planLayer = html.slice(html.indexOf('data-testid="lc-layer-plan"'), html.indexOf('data-testid="lc-layer-today"'));
    expect(planLayer).not.toContain('lc-stood');
  });

  it('starts at the middle without an intro, and at the right edge with one (the sweep moves it once)', () => {
    expect(render()).toContain('data-sweep="done"');
    expect(render()).toContain('aria-valuenow="50"');
    const html = render({ intro: true });
    expect(html).toContain('data-sweep="pending"');
    expect(html).toContain('aria-valuenow="100"');
  });
});
