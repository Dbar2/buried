import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockLayout, CARD_WIDTH, isPhone, tagKeepOut } from './blockLayout';
import { estimateTagSize, layoutTags, rectsOverlap } from './tagLayout';
import type { Rect } from './tagLayout';

const inside = (r: Rect, w: number, h: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= h;

describe('blockLayout', () => {
  it('docks the card at the right on a wide screen and the sheet at the foot on a phone', () => {
    const wide = blockLayout({ w: 1440, h: 800, cardOpen: true, sheetExpanded: false });
    expect(wide.phone).toBe(false);
    expect(wide.card).toMatchObject({ x: 1440 - 24 - CARD_WIDTH, w: CARD_WIDTH });
    expect(wide.sheet).toBeNull();
    const phone = blockLayout({ w: 390, h: 844, cardOpen: true, sheetExpanded: false });
    expect(phone.phone).toBe(true);
    expect(phone.card).toBeNull();
    expect(phone.sheet).toMatchObject({ x: 0, w: 390, y: 844 - 168 });
    expect(blockLayout({ w: 390, h: 844, cardOpen: true, sheetExpanded: true }).sheet!.y).toBeLessThan(844 / 2);
  });

  it('has no card or sheet when nothing is selected', () => {
    for (const w of [390, 1440]) {
      const rects = blockLayout({ w, h: 800, cardOpen: false, sheetExpanded: false });
      expect(rects.card).toBeNull();
      expect(rects.sheet).toBeNull();
    }
  });

  it('never lets the ruler run under the card', () => {
    for (const w of [720, 800, 1024, 1280, 1440, 1920]) {
      const rects = blockLayout({ w, h: 800, cardOpen: true, sheetExpanded: false });
      expect(rectsOverlap(rects.ruler, rects.card!), String(w)).toBe(false);
    }
  });

  it('keeps every control inside the stage, and the controls apart', () => {
    for (const [w, h] of [
      [1440, 900],
      [1024, 700],
      [390, 844],
    ] as const) {
      for (const cardOpen of [false, true]) {
        const rects = blockLayout({ w, h, cardOpen, sheetExpanded: false });
        const pieces = [rects.ruler, rects.lensControl, rects.listControl, rects.caption];
        for (const r of pieces) expect(inside(r, w, h), `${w}x${h}`).toBe(true);
        expect(rectsOverlap(rects.ruler, rects.lensControl)).toBe(false);
        expect(rectsOverlap(rects.lensControl, rects.listControl)).toBe(false);
        expect(rectsOverlap(rects.ruler, rects.caption)).toBe(false);
      }
    }
  });

  it('isPhone is under 720 px', () => {
    expect(isPhone(719)).toBe(true);
    expect(isPhone(720)).toBe(false);
  });

  // P2 again, on the page's own rectangles: no visible tag meets the card, the sheet or any control.
  it('property: no visible tag intersects a keep-out rectangle or another tag, raised or not', () => {
    const size = fc.record({ w: fc.integer({ min: 320, max: 1920 }), h: fc.integer({ min: 480, max: 1200 }) });
    fc.assert(
      fc.property(
        size,
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.array(fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 1, noNaN: true })), { minLength: 1, maxLength: 6 }),
        (stage, cardOpen, expanded, raised, points) => {
          const rects = blockLayout({ w: stage.w, h: stage.h, cardOpen, sheetExpanded: expanded });
          const anchors = points.map(([fx, fy], i) => ({ id: `t${i}`, x: fx * stage.w, y: fy * stage.h, onScreen: true }));
          const sizes = new Map(anchors.map((a) => [a.id, estimateTagSize('Overall factory')]));
          const keepOut = tagKeepOut(rects, raised);
          const placed = layoutTags({ anchors, sizes, viewport: stage, keepOut }).flatMap((r) => (r.placement === 'hidden' ? [] : [r.placement.rect]));
          for (const [i, a] of placed.entries()) {
            expect(inside(a, stage.w, stage.h)).toBe(true);
            for (const k of keepOut) expect(rectsOverlap(a, k)).toBe(false);
            for (const b of placed.slice(i + 1)) expect(rectsOverlap(a, b)).toBe(false);
          }
        },
      ),
    );
  });
});
