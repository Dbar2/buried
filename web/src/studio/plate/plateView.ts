/**
 * Plate view maths (pure). The plate pane draws in full-resolution plate pixels, the same pixels the
 * proposals are in. A view is a scale `k` (screen pixels per plate pixel) and the screen position
 * `(tx, ty)` of plate pixel (0, 0). Vertices stay in whole plate pixels; the view only moves and
 * scales what is drawn.
 */

export type View = { k: number; tx: number; ty: number };
export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Point = { x: number; y: number };

export const MIN_K = 0.02;
export const MAX_K = 8;

const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

export function toScreen(view: View, p: Point): Point {
  return { x: p.x * view.k + view.tx, y: p.y * view.k + view.ty };
}

export function toPlate(view: View, p: Point): Point {
  return { x: (p.x - view.tx) / view.k, y: (p.y - view.ty) / view.k };
}

/** The view that shows `rect` (plate pixels) as large as fits in `viewport`, with `margin` screen pixels around it. */
export function fitView(viewport: Size, rect: Rect, margin = 24): View {
  const usableW = Math.max(1, viewport.width - 2 * margin);
  const usableH = Math.max(1, viewport.height - 2 * margin);
  const k = clampK(Math.min(usableW / Math.max(1, rect.width), usableH / Math.max(1, rect.height)));
  return {
    k,
    tx: (viewport.width - rect.width * k) / 2 - rect.x * k,
    ty: (viewport.height - rect.height * k) / 2 - rect.y * k,
  };
}

/** Scale by `factor` keeping the plate point under `screenPoint` where it is. */
export function zoomAt(view: View, screenPoint: Point, factor: number): View {
  const k = clampK(view.k * factor);
  const under = toPlate(view, screenPoint);
  return { k, tx: screenPoint.x - under.x * k, ty: screenPoint.y - under.y * k };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { ...view, tx: view.tx + dx, ty: view.ty + dy };
}

/** The part of the plate the viewport shows, in plate pixels. */
export function visibleRect(view: View, viewport: Size): Rect {
  const a = toPlate(view, { x: 0, y: 0 });
  const b = toPlate(view, { x: viewport.width, y: viewport.height });
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}

/** Whole-pixel intersection of two rectangles, or null when they do not overlap. */
export function intersectRects(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  if (x1 <= x0 || y1 <= y0) return null;
  const rx0 = Math.ceil(x0);
  const ry0 = Math.ceil(y0);
  const rx1 = Math.floor(x1);
  const ry1 = Math.floor(y1);
  return rx1 > rx0 && ry1 > ry0 ? { x: rx0, y: ry0, width: rx1 - rx0, height: ry1 - ry0 } : null;
}

/** The rectangle between two plate points, as whole pixels, clipped to `within`. Null if it is empty. */
export function rectFromDrag(a: Point, b: Point, within: Rect): Rect | null {
  const raw = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
  return intersectRects(raw, within);
}

export function rectToPolygon(r: Rect): [[number, number], [number, number], [number, number], [number, number]] {
  return [
    [r.x, r.y],
    [r.x + r.width, r.y],
    [r.x + r.width, r.y + r.height],
    [r.x, r.y + r.height],
  ];
}

/** Map plate pixels to the pixels of the tile image, which is the map-area crop scaled to `tile`. */
export function plateToTile(p: Point, crop: Rect, tile: Size): Point {
  return { x: ((p.x - crop.x) * tile.width) / crop.width, y: ((p.y - crop.y) * tile.height) / crop.height };
}

export function pointInPolygon(p: Point, polygon: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i] as readonly [number, number];
    const [xj, yj] = polygon[j] as readonly [number, number];
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonArea(polygon: ReadonlyArray<readonly [number, number]>): number {
  let sum = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i] as readonly [number, number];
    const [xj, yj] = polygon[j] as readonly [number, number];
    sum += xj * yi - xi * yj;
  }
  return Math.abs(sum) / 2;
}

/** Area centroid of a simple polygon; falls back to the vertex mean for a degenerate one. */
export function polygonCentroid(polygon: ReadonlyArray<readonly [number, number]>): Point {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i] as readonly [number, number];
    const [xj, yj] = polygon[j] as readonly [number, number];
    const cross = xj * yi - xi * yj;
    a += cross;
    cx += (xj + xi) * cross;
    cy += (yj + yi) * cross;
  }
  if (Math.abs(a) < 1e-9) {
    const n = polygon.length || 1;
    return { x: polygon.reduce((s, p) => s + p[0], 0) / n, y: polygon.reduce((s, p) => s + p[1], 0) / n };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}
