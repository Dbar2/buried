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
/** On a phone the caption is the one link "Look up an address", so its bar is one line. */
export const PHONE_CAPTION_HEIGHT = 40;
export const SHEET_PEEK = 168;
export const RULER_HEIGHT = 76;
export const RULER_WIDTH = 560;
export const CONTROL_HEIGHT = 44;
export const LENS_CONTROL_WIDTH = 200;
export const LIST_CONTROL_WIDTH = 72;
/** On a phone the Lantern, List and the ruler share one line, so the two controls are narrower. */
export const PHONE_LENS_CONTROL_WIDTH = 92;
export const PHONE_LIST_CONTROL_WIDTH = 56;
export const MIN_RULER_WIDTH = 300;
export const TOP_ROW_HEIGHT = 68;
/**
 * Where the far edge of the sheet falls in the Player's opening view, as a share of the canvas height from its top
 * (measured on the tall pose in session 044: 0.21 to 0.23). On a phone, after the raise, the scene's box reaches up
 * under the tag row by as much as puts that edge at the tag row's foot, so the dark table above the sheet is not a band.
 */
export const PHONE_SHEET_FAR_EDGE = 0.22;
const GAP = 8;
const MARGIN = 16;

export type LayoutInput = {
  readonly w: number;
  readonly h: number;
  /** A card is open (a find or a ghost is selected). */
  readonly cardOpen: boolean;
  /** The phone's sheet is dragged open. */
  readonly sheetExpanded: boolean;
  /** The raise has ended. On a phone the scene's box then changes (see `PHONE_SHEET_FAR_EDGE`). */
  readonly raised?: boolean;
  /** The caption also carries the line saying why the sheet is flat, so its bar is taller where that line wraps. */
  readonly notice?: boolean;
};

export type BlockRects = {
  readonly phone: boolean;
  /** The scene's box: the whole stage, except on a phone after the raise. The Player's canvas and the Flat sheet fill it. */
  readonly scene: Rect;
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

/** With the flat-sheet notice in it the caption wraps to two lines below this width, and to four on a phone. */
export const NOTICE_WIDE_MIN_WIDTH = 1100;
export const CAPTION_HEIGHT_NOTICE_WRAPPED = 64;
export const PHONE_CAPTION_HEIGHT_NOTICE = 88;

export function captionHeight(w: number, phone: boolean, notice: boolean): number {
  if (!notice) return phone ? PHONE_CAPTION_HEIGHT : CAPTION_HEIGHT;
  if (phone) return PHONE_CAPTION_HEIGHT_NOTICE;
  return w >= NOTICE_WIDE_MIN_WIDTH ? CAPTION_HEIGHT : CAPTION_HEIGHT_NOTICE_WRAPPED;
}

export function blockLayout(input: LayoutInput): BlockRects {
  const { w, h } = input;
  const phone = isPhone(w);

  const sheetShown = phone && input.cardOpen;
  const sheetTop = input.sheetExpanded ? Math.round(h * 0.12) : h - SHEET_PEEK;
  const sheet: Rect | null = sheetShown ? { x: 0, y: sheetTop, w, h: h - sheetTop } : null;

  const captionH = captionHeight(w, phone, input.notice === true);
  const captionY = sheetShown ? h - SHEET_PEEK - captionH : h - captionH;
  const caption: Rect = { x: 0, y: captionY, w, h: captionH };

  const cardOpenWide = !phone && input.cardOpen;
  const card: Rect | null = cardOpenWide ? { x: w - CARD_RIGHT - CARD_WIDTH, y: CARD_TOP, w: CARD_WIDTH, h: Math.max(0, captionY - GAP - CARD_TOP) } : null;

  // Beside the card the ruler sits in the width that is left. On a wide screen the Lantern and List controls share its
  // row, at the left, when there is room for both; otherwise the controls sit above the ruler. On a phone the Lantern,
  // List and the ruler share one line directly over the scene's lower edge.
  const rightBound = card ? card.x - MARGIN : w;
  const controlsW = MARGIN + LENS_CONTROL_WIDTH + GAP + LIST_CONTROL_WIDTH + MARGIN;
  const sameRow = !phone && rightBound - controlsW >= MIN_RULER_WIDTH;
  const rulerY = phone ? captionY - RULER_HEIGHT : captionY - GAP - RULER_HEIGHT;
  let ruler: Rect;
  let lensControl: Rect;
  let listControl: Rect;
  if (phone) {
    const controlY = rulerY + Math.round((RULER_HEIGHT - CONTROL_HEIGHT) / 2);
    lensControl = { x: MARGIN, y: controlY, w: PHONE_LENS_CONTROL_WIDTH, h: CONTROL_HEIGHT };
    listControl = { x: lensControl.x + lensControl.w + GAP, y: controlY, w: PHONE_LIST_CONTROL_WIDTH, h: CONTROL_HEIGHT };
    const rulerX = listControl.x + listControl.w + GAP;
    ruler = { x: rulerX, y: rulerY, w: Math.max(0, w - MARGIN - rulerX), h: RULER_HEIGHT };
  } else {
    if (sameRow) {
      const rulerW = Math.min(RULER_WIDTH, rightBound - controlsW);
      const centred = Math.round((w - rulerW) / 2);
      ruler = { x: Math.min(Math.max(centred, controlsW), rightBound - rulerW), y: rulerY, w: rulerW, h: RULER_HEIGHT };
    } else {
      const rulerW = Math.max(0, Math.min(RULER_WIDTH, rightBound - 2 * MARGIN));
      ruler = { x: Math.round((rightBound - rulerW) / 2), y: rulerY, w: rulerW, h: RULER_HEIGHT };
    }
    const controlY = sameRow ? captionY - GAP - CONTROL_HEIGHT : ruler.y - GAP - CONTROL_HEIGHT;
    lensControl = { x: MARGIN, y: controlY, w: LENS_CONTROL_WIDTH, h: CONTROL_HEIGHT };
    listControl = { x: lensControl.x + lensControl.w + GAP, y: lensControl.y, w: LIST_CONTROL_WIDTH, h: CONTROL_HEIGHT };
  }

  // The scene's box. On a phone after the raise it stands where the sheet's peek would leave it, whether or not a card
  // is open (so choosing or closing a find never resizes the Player), and reaches up so the sheet's far edge meets the
  // tag row.
  let scene: Rect = { x: 0, y: 0, w, h };
  if (phone && input.raised) {
    const bottom = h - SHEET_PEEK - captionH;
    const top = Math.round((TOP_ROW_HEIGHT - PHONE_SHEET_FAR_EDGE * bottom) / (1 - PHONE_SHEET_FAR_EDGE));
    scene = { x: 0, y: top, w, h: Math.max(1, bottom - top) };
  }

  const topRow: Rect = { x: 0, y: 0, w, h: TOP_ROW_HEIGHT };
  const intro: Rect = phone
    ? { x: 0, y: Math.round(h * 0.08), w, h: 330 }
    : { x: 0, y: Math.round(h * 0.1), w: Math.min(480, Math.round(w * 0.32)) + Math.round(w * 0.05) + MARGIN, h: 300 };

  return { phone, scene, topRow, card, sheet, ruler, lensControl, listControl, caption, intro };
}

/** The rectangles the pinned tags keep out of: before the raise the intro, after it every control on the stage. */
export function tagKeepOut(rects: BlockRects, raised: boolean): Rect[] {
  if (!raised) return [rects.intro, rects.caption];
  return [rects.topRow, rects.ruler, rects.lensControl, rects.listControl, rects.caption, ...(rects.card ? [rects.card] : []), ...(rects.sheet ? [rects.sheet] : [])];
}
