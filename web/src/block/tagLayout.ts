/**
 * Where the paper tags go (spec 06 design "Tags and the leader line"). Pure: anchors, tag sizes, the
 * viewport and the keep-out rectangles in; one placement or `hidden` per tag out. All lengths are CSS
 * pixels in the Block page's own coordinate space.
 *
 * A tag tries above its anchor on a 40 px string, then 60 to 160 px in 20 px steps, then the same
 * offsets to the left and then to the right. The first spot inside the viewport that overlaps no
 * keep-out and no earlier visible tag wins; otherwise the tag is hidden (it stays in the top row and
 * the list). An anchor that is not on screen hides its tag. The selected find has no pinned tag.
 */

export type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
export type Size = { readonly w: number; readonly h: number };

export type TagAnchor = { readonly id: string; readonly x: number; readonly y: number; readonly onScreen: boolean };

export type TagSide = 'above' | 'left' | 'right';

export type Placement = {
  readonly rect: Rect;
  readonly side: TagSide;
  /** The string's length in px, from the anchor to the tag's nearest edge. */
  readonly offset: number;
  /** The string: from the anchor (x1, y1) to the tag (x2, y2). */
  readonly string: { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };
};

export type TagResult = { readonly id: string; readonly placement: Placement | 'hidden' };

export const STRING_OFFSETS: readonly number[] = [40, 60, 80, 100, 120, 140, 160];

/** Tag height: the tag is a 44 px touch target on every screen. */
export const TAG_HEIGHT = 44;

/** A plain estimate of a tag's size from its text, for the first layout before anything is measured. */
export function estimateTagSize(text: string): Size {
  return { w: Math.ceil(text.length * 9 + 32), h: TAG_HEIGHT };
}

/** Rectangles that only touch along an edge do not overlap. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function insideViewport(rect: Rect, viewport: Size): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= viewport.w && rect.y + rect.h <= viewport.h;
}

function candidate(anchor: TagAnchor, size: Size, side: TagSide, offset: number): Placement {
  switch (side) {
    case 'above': {
      const rect = { x: anchor.x - size.w / 2, y: anchor.y - offset - size.h, w: size.w, h: size.h };
      return { rect, side, offset, string: { x1: anchor.x, y1: anchor.y, x2: anchor.x, y2: rect.y + rect.h } };
    }
    case 'left': {
      const rect = { x: anchor.x - offset - size.w, y: anchor.y - size.h / 2, w: size.w, h: size.h };
      return { rect, side, offset, string: { x1: anchor.x, y1: anchor.y, x2: rect.x + rect.w, y2: anchor.y } };
    }
    case 'right': {
      const rect = { x: anchor.x + offset, y: anchor.y - size.h / 2, w: size.w, h: size.h };
      return { rect, side, offset, string: { x1: anchor.x, y1: anchor.y, x2: rect.x, y2: anchor.y } };
    }
  }
}

export type TagLayoutInput = {
  readonly anchors: readonly TagAnchor[];
  /** Tag sizes by id. A tag with no size is hidden. */
  readonly sizes: ReadonlyMap<string, Size>;
  readonly viewport: Size;
  /** The header, the card, the ruler, the Lantern control and the top tag row. */
  readonly keepOut: readonly Rect[];
  readonly selectedId?: string | null;
};

export function layoutTags(input: TagLayoutInput): TagResult[] {
  const placed: Rect[] = [];
  return input.anchors.map((anchor): TagResult => {
    const size = input.sizes.get(anchor.id);
    if (!anchor.onScreen || !size || anchor.id === input.selectedId) return { id: anchor.id, placement: 'hidden' };
    for (const side of ['above', 'left', 'right'] as const) {
      for (const offset of STRING_OFFSETS) {
        const placement = candidate(anchor, size, side, offset);
        const { rect } = placement;
        if (!insideViewport(rect, input.viewport)) continue;
        if (input.keepOut.some((k) => rectsOverlap(rect, k))) continue;
        if (placed.some((p) => rectsOverlap(rect, p))) continue;
        placed.push(rect);
        return { id: anchor.id, placement };
      }
    }
    return { id: anchor.id, placement: 'hidden' };
  });
}

export type LeaderLine = { readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number };

/** Half the side of the square kept clear around the selected find's anchor: its volume and the dot on it. */
export const SELECTED_CLEAR_HALF = 36;
/** How much of the leader line, from its start, no tag may cover. */
export const LEADER_CLEAR_PX = 120;
const LEADER_CLEAR_STEP = 16;
const LEADER_CLEAR_HALF = 12;

/**
 * Rectangles no pinned tag may cover once a find is selected: a square around the selected find's anchor, and
 * the first `LEADER_CLEAR_PX` of the leader line from that anchor (as a run of small squares along it, so a tag
 * cannot sit across the line's start). Add these to the keep-outs. Empty when nothing is selected or the anchor
 * is off screen.
 */
export function selectedKeepOut(anchor: { x: number; y: number; onScreen: boolean } | null, leader: LeaderLine | null): Rect[] {
  if (!anchor || !anchor.onScreen) return [];
  const rects: Rect[] = [{ x: anchor.x - SELECTED_CLEAR_HALF, y: anchor.y - SELECTED_CLEAR_HALF, w: 2 * SELECTED_CLEAR_HALF, h: 2 * SELECTED_CLEAR_HALF }];
  if (leader) {
    const dx = leader.x2 - leader.x1;
    const dy = leader.y2 - leader.y1;
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      const clear = Math.min(LEADER_CLEAR_PX, length);
      for (let d = LEADER_CLEAR_STEP; d <= clear + LEADER_CLEAR_STEP - 1e-9; d += LEADER_CLEAR_STEP) {
        const t = Math.min(d, clear) / length;
        const px = leader.x1 + dx * t;
        const py = leader.y1 + dy * t;
        rects.push({ x: px - LEADER_CLEAR_HALF, y: py - LEADER_CLEAR_HALF, w: 2 * LEADER_CLEAR_HALF, h: 2 * LEADER_CLEAR_HALF });
      }
    }
  }
  return rects;
}

/**
 * The leader line from the selected find's anchor to the card's left edge at the title row. Null (hidden)
 * when there is no card, on a phone, when the anchor is off screen, or when it is under the card or past
 * its left edge (the line would not run to the card).
 */
export function leaderLine(input: {
  anchor: { x: number; y: number; onScreen: boolean } | null;
  card: Rect | null;
  /** The y of the card's title row, in the same space. It is clamped to the card's height. */
  titleY: number;
  phone: boolean;
}): LeaderLine | null {
  const { anchor, card } = input;
  if (input.phone || !anchor || !card || !anchor.onScreen) return null;
  const underCard = anchor.x >= card.x && anchor.y >= card.y && anchor.y <= card.y + card.h;
  if (underCard || anchor.x >= card.x) return null;
  const y2 = Math.min(card.y + card.h, Math.max(card.y, input.titleY));
  return { x1: anchor.x, y1: anchor.y, x2: card.x, y2 };
}

// ---- markers (session 045) ----------------------------------------------------------------------------------------
// After the raise the top row names every find, so a find that is not selected is pinned on the scene as a small dot
// only. Its tag text shows beside the dot on hover and on keyboard focus. Nothing may cross the selected find's leader line:
// not the dot's hit area and not the label where it would appear.

/** The drawn dot's side in px. */
export const MARKER_DOT = 10;
/** Half the side of the marker button's hit area, around the anchor: 44 px, the touch-target size. */
export const MARKER_HIT_HALF = 22;
/** The gap between the anchor and the label's near edge. */
export const MARKER_LABEL_GAP = 12;

export type MarkerSide = 'right' | 'left' | 'above';

export type MarkerPlacement = {
  /** The button's hit area, centred on the anchor. */
  readonly hit: Rect;
  readonly side: MarkerSide;
  /** Where the label shows. */
  readonly label: Rect;
};

export type MarkerResult = { readonly id: string; readonly placement: MarkerPlacement | 'hidden' };

/** True when the segment passes through the rectangle (touching an edge counts). Liang-Barsky clipping. */
export function segmentHitsRect(line: LeaderLine, rect: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const edges: Array<[number, number]> = [
    [-dx, line.x1 - rect.x],
    [dx, rect.x + rect.w - line.x1],
    [-dy, line.y1 - rect.y],
    [dy, rect.y + rect.h - line.y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return t0 <= t1;
}

function labelCandidate(anchor: TagAnchor, size: Size, side: MarkerSide): Rect {
  switch (side) {
    case 'right':
      return { x: anchor.x + MARKER_LABEL_GAP, y: anchor.y - size.h / 2, w: size.w, h: size.h };
    case 'left':
      return { x: anchor.x - MARKER_LABEL_GAP - size.w, y: anchor.y - size.h / 2, w: size.w, h: size.h };
    case 'above':
      return { x: anchor.x - size.w / 2, y: anchor.y - MARKER_LABEL_GAP - size.h, w: size.w, h: size.h };
  }
}

export type MarkerLayoutInput = {
  readonly anchors: readonly TagAnchor[];
  readonly sizes: ReadonlyMap<string, Size>;
  readonly viewport: Size;
  /** The header, the card, the ruler, the Lantern control and the top tag row. A marker under one is hidden. */
  readonly keepOut: readonly Rect[];
  readonly leader: LeaderLine | null;
  readonly selectedId: string | null;
};

/**
 * One placement or `hidden` per find. A marker is hidden when its anchor is off screen, when it is the selected find,
 * when its hit area leaves the viewport, meets a keep-out or meets the leader line, or when its label has no side
 * (right, left, above) that stays in the viewport and clear of the leader line. A hidden marker's find is still in
 * the top row and the list.
 */
export function layoutMarkers(input: MarkerLayoutInput): MarkerResult[] {
  return input.anchors.map((anchor): MarkerResult => {
    const size = input.sizes.get(anchor.id);
    if (!anchor.onScreen || !size || anchor.id === input.selectedId) return { id: anchor.id, placement: 'hidden' };
    const hit: Rect = { x: anchor.x - MARKER_HIT_HALF, y: anchor.y - MARKER_HIT_HALF, w: 2 * MARKER_HIT_HALF, h: 2 * MARKER_HIT_HALF };
    if (!insideViewport(hit, input.viewport)) return { id: anchor.id, placement: 'hidden' };
    if (input.keepOut.some((k) => rectsOverlap(hit, k))) return { id: anchor.id, placement: 'hidden' };
    if (input.leader && segmentHitsRect(input.leader, hit)) return { id: anchor.id, placement: 'hidden' };
    for (const side of ['right', 'left', 'above'] as const) {
      const label = labelCandidate(anchor, size, side);
      if (!insideViewport(label, input.viewport)) continue;
      if (input.leader && segmentHitsRect(input.leader, label)) continue;
      return { id: anchor.id, placement: { hit, side, label } };
    }
    return { id: anchor.id, placement: 'hidden' };
  });
}
