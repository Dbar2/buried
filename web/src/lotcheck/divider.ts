/** The compare divider's arithmetic (spec 08 requirement 5.5, design.md "Accessibility"). Pure. */

export const DIVIDER_START = 50;
export const DIVIDER_STEP = 5;

/** A divider position kept inside 0 to 100. A value that is not a number is the start position. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return DIVIDER_START;
  return Math.min(100, Math.max(0, value));
}

/** The new position for a key, or null when the key is not the divider's. Left and Right move 5 per cent; Home and End go to the ends. */
export function dividerForKey(key: string, current: number): number | null {
  switch (key) {
    case 'ArrowLeft':
      return clampPercent(current - DIVIDER_STEP);
    case 'ArrowRight':
      return clampPercent(current + DIVIDER_STEP);
    case 'Home':
      return 0;
    case 'End':
      return 100;
    default:
      return null;
  }
}

/** The position, in per cent of the frame's width, of a pointer at `clientX` over a frame at `left` with `width`. */
export function dividerForPointer(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return DIVIDER_START;
  return clampPercent(((clientX - left) / width) * 100);
}

/**
 * Which corner labels fit on their side of the divider. A label sits `edge` px from the frame's side and keeps `gap`
 * px from the divider, so it never overlaps the divider or the other label. An unknown width (0) shows both.
 */
export function chipsFit(frameWidth: number, dividerPercent: number, leftWidth: number, rightWidth: number, edge = 8, gap = 8): { left: boolean; right: boolean } {
  if (!(frameWidth > 0)) return { left: true, right: true };
  const x = (frameWidth * clampPercent(dividerPercent)) / 100;
  return { left: edge + leftWidth + gap <= x, right: edge + rightWidth + gap <= frameWidth - x };
}

/** The announcement when the plan changes: "Now showing the 1911 plan". */
export const planAnnouncement = (planName: string): string => `Now showing ${planName}`;

/** The slider's name: "Divider between the 1911 plan and today". */
export const dividerLabel = (planName: string): string => `Divider between ${planName} and today`;
