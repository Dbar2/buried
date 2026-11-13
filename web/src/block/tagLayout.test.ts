import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { insideViewport, layoutTags, leaderLine, rectsOverlap, STRING_OFFSETS } from './tagLayout';
import type { Rect, Size, TagAnchor, TagResult } from './tagLayout';

const rect = fc.record({
  x: fc.integer({ min: -50, max: 1500 }),
  y: fc.integer({ min: -50, max: 900 }),
  w: fc.integer({ min: 1, max: 500 }),
  h: fc.integer({ min: 1, max: 400 }),
});

const anchorsArb = fc.array(
  fc.record({
    x: fc.integer({ min: -100, max: 1600 }),
    y: fc.integer({ min: -100, max: 1000 }),
    onScreen: fc.boolean(),
    size: fc.record({ w: fc.integer({ min: 40, max: 220 }), h: fc.constant(44) }),
  }),
  { minLength: 1, maxLength: 8 },
);

describe('tagLayout', () => {
  const viewport: Size = { w: 1440, h: 800 };

  it('puts a tag above its anchor on a 40 px string when the spot is free', () => {
    const [result] = layoutTags({
      anchors: [{ id: 'a', x: 700, y: 400, onScreen: true }],
      sizes: new Map([['a', { w: 120, h: 44 }]]),
      viewport,
      keepOut: [],
    }) as [TagResult];
    expect(result.placement).toMatchObject({ side: 'above', offset: 40, rect: { x: 640, y: 316, w: 120, h: 44 } });
    if (result.placement !== 'hidden') expect(result.placement.string).toEqual({ x1: 700, y1: 400, x2: 700, y2: 360 });
  });

  it('steps up the string, then left, then right, around a keep-out', () => {
    const sizes = new Map([['a', { w: 120, h: 44 }]]);
    const anchors: TagAnchor[] = [{ id: 'a', x: 700, y: 400, onScreen: true }];
    // A keep-out over everything above the anchor out to 100 px pushes the tag to a longer string.
    const above = layoutTags({ anchors, sizes, viewport, keepOut: [{ x: 0, y: 250, w: 1440, h: 150 }] });
    expect(above[0]?.placement).toMatchObject({ side: 'above', offset: 160 });
    // A band across the whole width forces left.
    const left = layoutTags({ anchors, sizes, viewport, keepOut: [{ x: 0, y: 0, w: 1440, h: 370 }] });
    expect(left[0]?.placement).toMatchObject({ side: 'left', offset: 40 });
    // And a block that also covers the left side forces right.
    const right = layoutTags({ anchors, sizes, viewport, keepOut: [{ x: 0, y: 0, w: 1440, h: 370 }, { x: 0, y: 370, w: 700, h: 60 }] });
    expect(right[0]?.placement).toMatchObject({ side: 'right', offset: 40 });
  });

  it('hides a tag with no spot, an off-screen anchor, no size, or the selected find', () => {
    const sizes = new Map([['a', { w: 120, h: 44 }], ['b', { w: 120, h: 44 }], ['c', { w: 120, h: 44 }]]);
    const results = layoutTags({
      anchors: [
        { id: 'a', x: 700, y: 400, onScreen: false },
        { id: 'b', x: 700, y: 400, onScreen: true },
        { id: 'c', x: 700, y: 400, onScreen: true },
        { id: 'd', x: 700, y: 400, onScreen: true },
      ],
      sizes,
      viewport,
      keepOut: [],
      selectedId: 'b',
    });
    expect(results.map((r) => r.placement === 'hidden')).toEqual([true, true, false, true]);
    const blocked = layoutTags({ anchors: [{ id: 'c', x: 700, y: 400, onScreen: true }], sizes, viewport, keepOut: [{ x: 0, y: 0, w: 1440, h: 800 }] });
    expect(blocked[0]?.placement).toBe('hidden');
  });

  it('treats touching edges as not overlapping', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 0, w: 10, h: 10 })).toBe(true);
  });

  // P2
  it('P2: no visible tag intersects the card, another keep-out, another visible tag, or the edge of the viewport', () => {
    fc.assert(
      fc.property(
        anchorsArb,
        fc.array(rect, { maxLength: 5 }),
        rect,
        fc.record({ w: fc.integer({ min: 320, max: 1920 }), h: fc.integer({ min: 480, max: 1080 }) }),
        (items, keepOuts, card, vp) => {
          const anchors = items.map((a, i) => ({ id: `t${i}`, x: a.x, y: a.y, onScreen: a.onScreen }));
          const sizes = new Map(items.map((a, i) => [`t${i}`, a.size] as const));
          const keepOut: Rect[] = [...keepOuts, card];
          const results = layoutTags({ anchors, sizes, viewport: vp, keepOut });
          const visible = results.flatMap((r) => (r.placement === 'hidden' ? [] : [r.placement]));
          visible.forEach((p, i) => {
            expect(insideViewport(p.rect, vp)).toBe(true);
            for (const k of keepOut) expect(rectsOverlap(p.rect, k)).toBe(false);
            for (const other of visible.slice(i + 1)) expect(rectsOverlap(p.rect, other.rect)).toBe(false);
            expect(STRING_OFFSETS).toContain(p.offset);
          });
          // An anchor that is not on screen never has a visible tag.
          results.forEach((r, i) => {
            if (!anchors[i]!.onScreen) expect(r.placement).toBe('hidden');
          });
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe('leaderLine', () => {
  const card: Rect = { x: 1080, y: 140, w: 360, h: 600 };
  const anchor = { x: 600, y: 420, onScreen: true };

  it('runs from the anchor to the card edge at the title row', () => {
    expect(leaderLine({ anchor, card, titleY: 200, phone: false })).toEqual({ x1: 600, y1: 420, x2: 1080, y2: 200 });
  });

  it('is hidden on a phone, with no card, off screen, or under the card', () => {
    expect(leaderLine({ anchor, card, titleY: 200, phone: true })).toBeNull();
    expect(leaderLine({ anchor, card: null, titleY: 200, phone: false })).toBeNull();
    expect(leaderLine({ anchor: { ...anchor, onScreen: false }, card, titleY: 200, phone: false })).toBeNull();
    expect(leaderLine({ anchor: { x: 1200, y: 300, onScreen: true }, card, titleY: 200, phone: false })).toBeNull();
  });

  it('clamps the title row into the card and always runs rightward', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1500 }), fc.integer({ min: 0, max: 900 }), fc.integer({ min: -500, max: 1500 }), (x, y, titleY) => {
        const line = leaderLine({ anchor: { x, y, onScreen: true }, card, titleY, phone: false });
        if (line) {
          expect(line.x1).toBeLessThan(line.x2);
          expect(line.y2).toBeGreaterThanOrEqual(card.y);
          expect(line.y2).toBeLessThanOrEqual(card.y + card.h);
        }
      }),
    );
  });
});
