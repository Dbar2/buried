import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { blockLayout, CAPTION_HEIGHT, captionHeight, CARD_WIDTH, isPhone, PHONE_CAPTION_HEIGHT, PHONE_SHEET_FAR_EDGE, TOP_ROW_HEIGHT, tagKeepOut } from './blockLayout';
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

  it('the caption is taller where the flat-sheet notice wraps, and the controls stay apart', () => {
    expect(captionHeight(1440, false, true)).toBe(CAPTION_HEIGHT);
    expect(captionHeight(900, false, true)).toBeGreaterThan(CAPTION_HEIGHT);
    expect(captionHeight(390, true, true)).toBeGreaterThan(PHONE_CAPTION_HEIGHT);
    for (const w of [390, 900, 1440]) {
      const r = blockLayout({ w, h: 800, cardOpen: false, sheetExpanded: false, notice: true });
      expect(r.caption.h).toBe(captionHeight(w, w < 720, true));
      expect(rectsOverlap(r.ruler, r.caption)).toBe(false);
    }
  });

  it('isPhone is under 720 px', () => {
    expect(isPhone(719)).toBe(true);
    expect(isPhone(720)).toBe(false);
  });

  it('on a phone the Lantern, List and the ruler share one line directly over the caption', () => {
    for (const cardOpen of [false, true]) {
      const r = blockLayout({ w: 390, h: 844, cardOpen, sheetExpanded: false, raised: true });
      const centreY = (x: Rect) => x.y + x.h / 2;
      expect(Math.abs(centreY(r.lensControl) - centreY(r.ruler))).toBeLessThanOrEqual(1);
      expect(Math.abs(centreY(r.listControl) - centreY(r.ruler))).toBeLessThanOrEqual(1);
      expect(r.ruler.y + r.ruler.h).toBe(r.caption.y);
      expect(r.lensControl.x + r.lensControl.w).toBeLessThan(r.listControl.x);
      expect(r.listControl.x + r.listControl.w).toBeLessThan(r.ruler.x);
      expect(r.caption.h).toBe(PHONE_CAPTION_HEIGHT);
      for (const c of [r.lensControl, r.listControl]) expect(c.w).toBeGreaterThanOrEqual(44);
    }
  });

  it('the scene is the whole stage, except on a phone after the raise, where it stays put whether or not a card is open', () => {
    expect(blockLayout({ w: 1440, h: 900, cardOpen: true, sheetExpanded: false, raised: true }).scene).toEqual({ x: 0, y: 0, w: 1440, h: 900 });
    expect(blockLayout({ w: 390, h: 788, cardOpen: false, sheetExpanded: false }).scene).toEqual({ x: 0, y: 0, w: 390, h: 788 });
    const a = blockLayout({ w: 390, h: 788, cardOpen: false, sheetExpanded: false, raised: true }).scene;
    const b = blockLayout({ w: 390, h: 788, cardOpen: true, sheetExpanded: true, raised: true }).scene;
    expect(a).toEqual(b);
    expect(a.y).toBeLessThan(0);
    expect(a.y + PHONE_SHEET_FAR_EDGE * a.h).toBeCloseTo(TOP_ROW_HEIGHT, 0);
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

describe('the Lantern hint strip', () => {
  it('lies directly under the Lantern button, on the stage, clear of the caption, and the tags keep out of it', () => {
    fc.assert(
      fc.property(fc.integer({ min: 320, max: 1920 }), fc.integer({ min: 560, max: 1200 }), fc.boolean(), fc.boolean(), (w, h, cardOpen, raised) => {
        const r = blockLayout({ w, h, cardOpen, sheetExpanded: false, raised });
        expect(r.lensHint.x).toBe(r.lensControl.x);
        expect(r.lensHint.y).toBe(r.lensControl.y + r.lensControl.h);
        expect(inside(r.lensHint, w, h)).toBe(true);
        expect(rectsOverlap(r.lensHint, r.caption)).toBe(false);
        expect(tagKeepOut(r, true)).toContainEqual(r.lensHint);
      }),
    );
  });
});
