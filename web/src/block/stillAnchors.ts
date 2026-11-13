/**
 * Where the finds' anchors sit on the Still (spec 06 design "The Still"). `block.json` gives each anchor
 * in image pixels; the Still is drawn with `object-fit: cover` and the default `50% 50%` position, so an
 * anchor's place in the viewport is plain arithmetic. Pure.
 */

export type Size = { readonly w: number; readonly h: number };
export type Rect = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export type StillAnchor = { readonly id: string; readonly x: number; readonly y: number };
export type ViewportAnchor = { readonly id: string; readonly x: number; readonly y: number; readonly onScreen: boolean };

/** The two committed Stills (design "The Still"). */
export const STILL_SIZES = { wide: { w: 1600, h: 1000 }, tall: { w: 780, h: 1600 } } as const;
export type StillKind = keyof typeof STILL_SIZES;

/** The Still whose shape is nearest the viewport's, so the least of it is cut away by `cover`. */
export function stillKindFor(box: Size): StillKind {
  if (box.w <= 0 || box.h <= 0) return 'wide';
  const aspect = Math.log(box.w / box.h);
  const wide = Math.abs(aspect - Math.log(STILL_SIZES.wide.w / STILL_SIZES.wide.h));
  const tall = Math.abs(aspect - Math.log(STILL_SIZES.tall.w / STILL_SIZES.tall.h));
  return tall < wide ? 'tall' : 'wide';
}

/** The scale and offset `object-fit: cover` gives an image in a box: viewport = image * scale + offset. */
export type CoverFit = { readonly scale: number; readonly offsetX: number; readonly offsetY: number };

export function coverFit(image: Size, box: Size): CoverFit {
  if (image.w <= 0 || image.h <= 0 || box.w <= 0 || box.h <= 0) return { scale: 1, offsetX: 0, offsetY: 0 };
  const scale = Math.max(box.w / image.w, box.h / image.h);
  return { scale, offsetX: (box.w - image.w * scale) / 2, offsetY: (box.h - image.h * scale) / 2 };
}

/** The part of the image (in image pixels) that the box shows. */
export function visibleImageRect(image: Size, box: Size): Rect {
  const fit = coverFit(image, box);
  const x = Math.max(0, -fit.offsetX / fit.scale);
  const y = Math.max(0, -fit.offsetY / fit.scale);
  return { x, y, w: Math.min(image.w, (box.w - fit.offsetX) / fit.scale) - x, h: Math.min(image.h, (box.h - fit.offsetY) / fit.scale) - y };
}

/** An anchor in image pixels as a viewport position; `onScreen` is false when `cover` cuts it away. */
export function anchorInViewport(anchor: StillAnchor, image: Size, box: Size): ViewportAnchor {
  const fit = coverFit(image, box);
  const x = anchor.x * fit.scale + fit.offsetX;
  const y = anchor.y * fit.scale + fit.offsetY;
  return { id: anchor.id, x, y, onScreen: x >= 0 && x <= box.w && y >= 0 && y <= box.h };
}

export function anchorsInViewport(anchors: readonly StillAnchor[], image: Size, box: Size): ViewportAnchor[] {
  return anchors.map((anchor) => anchorInViewport(anchor, image, box));
}
