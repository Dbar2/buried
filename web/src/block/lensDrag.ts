/**
 * Dragging the Lantern lens (spec 06 requirement 6.1, design "Lantern lens, Flat sheet, share"). Pure.
 * A pointer or one-finger drag that starts inside the lens moves the lens; one that starts outside
 * moves the camera. The lens centre is 0 to 1 across the canvas from the left and from the top, and
 * its radius is a share of the canvas height, as in the lens messages (`scene/setLantern`); this
 * module does not import the bridge.
 */

export type CanvasRect = { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
export type LensPoint = { readonly x: number; readonly y: number };
export type Lens = { readonly center: LensPoint; /** A share of the canvas height. */ readonly radius: number };

/** A drag that began inside the lens: where inside it the pointer took hold, in px from the lens centre. */
export type LensGrab = { readonly dx: number; readonly dy: number };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const usable = (rect: CanvasRect): boolean => rect.width > 0 && rect.height > 0;

/** Is a client position inside the lens? The edge counts as inside. */
export function isInsideLens(client: LensPoint, rect: CanvasRect, lens: Lens): boolean {
  if (!usable(rect)) return false;
  const cx = rect.left + lens.center.x * rect.width;
  const cy = rect.top + lens.center.y * rect.height;
  return Math.hypot(client.x - cx, client.y - cy) <= lens.radius * rect.height;
}

/** Starts a lens drag, or returns null when the start is outside the lens (the camera takes that drag). */
export function beginLensDrag(client: LensPoint, rect: CanvasRect, lens: Lens): LensGrab | null {
  if (!isInsideLens(client, rect, lens)) return null;
  return { dx: client.x - (rect.left + lens.center.x * rect.width), dy: client.y - (rect.top + lens.center.y * rect.height) };
}

/** The lens centre for a pointer move: the pointer keeps its grip, and the lens stays on the canvas. */
export function moveLensDrag(grab: LensGrab, client: LensPoint, rect: CanvasRect, previous: LensPoint): LensPoint {
  if (!usable(rect)) return previous;
  return {
    x: clamp01((client.x - grab.dx - rect.left) / rect.width),
    y: clamp01((client.y - grab.dy - rect.top) / rect.height),
  };
}
