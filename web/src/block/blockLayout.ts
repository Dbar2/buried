/**
 * Where the Block page's pieces sit on the stage (spec 06 design "The raised scene and the card"). Pure: the stage size
 * and a few flags in, rectangles out. The page positions each piece from its rectangle, and the tag layout keeps tags
 * out of the same rectangles, so what the layout avoids is what the page draws. All lengths are CSS pixels, with the
 * origin at the stage's top left (below the header).
 */
import type { Rect } from './tagLayout';

export const PHONE_MAX_WIDTH = 720;
export const CARD_WIDTH = 360;
export const CARD_TOP = 72;
export const CARD_RIGHT = 24;
export const CAPTION_HEIGHT = 40;
export const SHEET_PEEK = 168;
export const RULER_HEIGHT = 76;
export const RULER_WIDTH = 560;
export const CONTROL_HEIGHT = 44;
export const LENS_CONTROL_WIDTH = 200;
export const LIST_CONTROL_WIDTH = 72;
export const MIN_RULER_WIDTH = 300;
export const TOP_ROW_HEIGHT = 68;
const GAP = 8;
const MARGIN = 16;

export type LayoutInput = {
  readonly w: number;
  readonly h: number;
  /** A card is open (a find or a ghost is selected). */
  readonly cardOpen: boolean;
  /** The phone's sheet is dragged open. */
  readonly sheetExpanded: boolean;
};

export type BlockRects = {
  readonly phone: boolean;
  /** The row of find tags along the top (raised). */
  readonly topRow: Rect;
  /** The card's dock on a wide screen, or null (none open, or a phone). */
  readonly card: Rect | null;
  /** The bottom sheet on a phone, or null. */
  readonly sheet: Rect | null;
  readonly ruler: Rect;
  readonly lensControl: Rect;
  readonly listControl: Rect;
  readonly caption: Rect;
  /** The headline, the button and the line, before the raise. */
  readonly intro: Rect;
};

export const isPhone = (w: number): boolean => w < PHONE_MAX_WIDTH;

export function blockLayout(input: LayoutInput): BlockRects {
  const { w, h } = input;
  const phone = isPhone(w);

  const sheetShown = phone && input.cardOpen;
  const sheetTop = input.sheetExpanded ? Math.round(h * 0.12) : h - SHEET_PEEK;
  const sheet: Rect | null = sheetShown ? { x: 0, y: sheetTop, w, h: h - sheetTop } : null;

  const captionY = sheetShown ? Math.min(h - SHEET_PEEK, sheetTop) - CAPTION_HEIGHT : h - CAPTION_HEIGHT;
  const caption: Rect = { x: 0, y: captionY, w, h: CAPTION_HEIGHT };

  const cardOpenWide = !phone && input.cardOpen;
  const card: Rect | null = cardOpenWide ? { x: w - CARD_RIGHT - CARD_WIDTH, y: CARD_TOP, w: CARD_WIDTH, h: Math.max(0, captionY - GAP - CARD_TOP) } : null;

  // Beside the card the ruler sits in the width that is left. On a wide screen the Lantern and List controls share its
  // row, at the left, when there is room for both; otherwise the controls sit above the ruler, as on a phone.
  const rightBound = card ? card.x - MARGIN : w;
  const controlsW = MARGIN + LENS_CONTROL_WIDTH + GAP + LIST_CONTROL_WIDTH + MARGIN;
  const sameRow = !phone && rightBound - controlsW >= MIN_RULER_WIDTH;
  const rulerY = captionY - GAP - RULER_HEIGHT;
  let ruler: Rect;
  if (sameRow) {
    const rulerW = Math.min(RULER_WIDTH, rightBound - controlsW);
    const centred = Math.round((w - rulerW) / 2);
    ruler = { x: Math.min(Math.max(centred, controlsW), rightBound - rulerW), y: rulerY, w: rulerW, h: RULER_HEIGHT };
  } else {
    const rulerW = phone ? w - 2 * MARGIN : Math.max(0, Math.min(RULER_WIDTH, rightBound - 2 * MARGIN));
    ruler = { x: phone ? MARGIN : Math.round((rightBound - rulerW) / 2), y: rulerY, w: rulerW, h: RULER_HEIGHT };
  }

  const controlY = sameRow ? captionY - GAP - CONTROL_HEIGHT : ruler.y - GAP - CONTROL_HEIGHT;
  const lensControl: Rect = { x: MARGIN, y: controlY, w: LENS_CONTROL_WIDTH, h: CONTROL_HEIGHT };
  const listControl: Rect = { x: lensControl.x + lensControl.w + GAP, y: lensControl.y, w: LIST_CONTROL_WIDTH, h: CONTROL_HEIGHT };

  const topRow: Rect = { x: 0, y: 0, w, h: TOP_ROW_HEIGHT };
  const intro: Rect = phone
    ? { x: 0, y: Math.round(h * 0.08), w, h: 330 }
    : { x: 0, y: Math.round(h * 0.1), w: Math.min(480, Math.round(w * 0.32)) + Math.round(w * 0.05) + MARGIN, h: 300 };

  return { phone, topRow, card, sheet, ruler, lensControl, listControl, caption, intro };
}

/** The rectangles the pinned tags keep out of: before the raise the intro, after it every control on the stage. */
export function tagKeepOut(rects: BlockRects, raised: boolean): Rect[] {
  if (!raised) return [rects.intro, rects.caption];
  return [rects.topRow, rects.ruler, rects.lensControl, rects.listControl, rects.caption, ...(rects.card ? [rects.card] : []), ...(rects.sheet ? [rects.sheet] : [])];
}
