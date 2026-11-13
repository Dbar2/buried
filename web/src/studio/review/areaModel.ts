/**
 * Traced land-use areas (spec 04 requirement 24), pure. A reviewer outlines a yard, a works or a
 * stable on the plate and types the use exactly as it is lettered there, with the crop it was read
 * from. Nothing here classifies a use, proposes geometry or decides a date: it checks a person's
 * outline against the same rules the Service applies when it publishes
 * (`pipeline/buried_pipeline/publish/decisions.py` `_trace`, `build.py` `_check_trace`), so that no
 * refusal arrives late, and writes the trace decision of the decisions file v2.
 *
 * Rules mirrored: at least 4 distinct integer vertices, none negative, one simple polygon with
 * area, wholly inside the plate's map area; a use; a crop for the use that lies on the plate.
 */
import { findBannedWords } from '../../evidence';
import type { DecisionsV2 } from '../service/types.generated';
import type { Rect } from '../plate/plateView';

export type Vertex = readonly [number, number];
export type AreaConfidence = 'documented' | 'estimated' | 'unknown';

export type TracedArea = {
  /** Local id, `area_<n>`. The Service names the published area by its own hash. */
  id: string;
  /** The corners in order, each once (the ring is not closed). */
  ring: readonly Vertex[];
  /** The use as lettered on the plate. Kept as typed apart from the spaces at either end. */
  use: string;
  /** The crop, in plate pixels, the lettering was read from. */
  read: Rect | null;
  confidence: AreaConfidence;
  /** Why this confidence. Required when it is lowered from `documented`. */
  reason: string;
  /** When the person saved it. */
  at: string;
};

/** What an area is checked against: the plate's map area polygon and the plate pixels the tile shows. */
export type AreaContext = {
  mapAreaPx: ReadonlyArray<Vertex>;
  /** The map area's bounding box in plate pixels (the tile's `crop_px`). A read crop must lie inside it. */
  plate: Rect;
};

export const MIN_CORNERS = 4;

export const defaultReason = (sourceId: string): string => `Area and use traced by a person from ${sourceId}`;

export const cleanLettering = (text: string): string => text.trim();

// ---------- geometry (integer pixels, exact) ----------

const cross = (o: Vertex, a: Vertex, b: Vertex): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function onSegment(p: Vertex, a: Vertex, b: Vertex): boolean {
  return cross(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
}

/** Whether two closed segments share any point. */
export function segmentsTouch(a: Vertex, b: Vertex, c: Vertex, d: Vertex): boolean {
  const d1 = Math.sign(cross(a, b, c));
  const d2 = Math.sign(cross(a, b, d));
  const d3 = Math.sign(cross(c, d, a));
  const d4 = Math.sign(cross(c, d, b));
  if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  return onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
}

/** Twice the signed area (shoelace); zero for a ring with no area. */
export function ringArea2(ring: readonly Vertex[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j] as Vertex)[0] * (ring[i] as Vertex)[1] - (ring[i] as Vertex)[0] * (ring[j] as Vertex)[1];
  return sum;
}

/** Why an open ring of integer vertices is not one simple polygon, or null. */
export function ringProblem(ring: readonly Vertex[]): string | null {
  if (ring.some((v) => !Number.isInteger(v[0]) || !Number.isInteger(v[1]) || v[0] < 0 || v[1] < 0)) {
    return 'A corner is not on a whole, non-negative plate pixel.';
  }
  if (ring.length < MIN_CORNERS) return `Place at least ${MIN_CORNERS} corners.`;
  if (new Set(ring.map((v) => `${v[0]},${v[1]}`)).size !== ring.length) return 'Two corners are in the same place.';
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i] as Vertex;
    const b = ring[(i + 1) % n] as Vertex;
    for (let j = i + 1; j < n; j++) {
      const c = ring[j] as Vertex;
      const d = ring[(j + 1) % n] as Vertex;
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) {
        // Edges that share a corner meet only there: a spike that doubles back overlaps itself.
        const shared = j === i + 1 ? b : a;
        const other1 = j === i + 1 ? a : b;
        const other2 = j === i + 1 ? d : c;
        if (cross(shared, other1, other2) === 0 && (other1[0] - shared[0]) * (other2[0] - shared[0]) + (other1[1] - shared[1]) * (other2[1] - shared[1]) > 0) {
          return 'The outline doubles back on itself.';
        }
      } else if (segmentsTouch(a, b, c, d)) {
        return 'The outline crosses itself.';
      }
    }
  }
  if (ringArea2(ring) === 0) return 'The outline has no area.';
  return null;
}

/** Inside or on the boundary of a polygon (even-odd). */
export function pointCovered(p: Vertex | readonly [number, number], polygon: ReadonlyArray<Vertex>): boolean {
  const n = polygon.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[i] as Vertex;
    const b = polygon[j] as Vertex;
    if (onSegmentLoose(p, a, b)) return true;
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function onSegmentLoose(p: readonly [number, number] | Vertex, a: Vertex, b: Vertex): boolean {
  const eps = 1e-9;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const c = Math.abs((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / len;
  return c <= eps && p[0] >= Math.min(a[0], b[0]) - eps && p[0] <= Math.max(a[0], b[0]) + eps && p[1] >= Math.min(a[1], b[1]) - eps && p[1] <= Math.max(a[1], b[1]) + eps;
}

/** Whether the closed segment a-b lies wholly inside (or on) the polygon. */
function segmentCovered(a: Vertex, b: Vertex, polygon: ReadonlyArray<Vertex>): boolean {
  const ts = new Set<number>([0, 1]);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const c = polygon[j] as Vertex;
    const d = polygon[i] as Vertex;
    const ex = d[0] - c[0];
    const ey = d[1] - c[1];
    const denom = dx * ey - dy * ex;
    if (denom === 0) {
      // Parallel: collinear edges add their end points as split points.
      if (cross(a, b, c) === 0) {
        for (const q of [c, d]) {
          const t = dx !== 0 ? (q[0] - a[0]) / dx : dy !== 0 ? (q[1] - a[1]) / dy : 0;
          if (t > 0 && t < 1) ts.add(t);
        }
      }
      continue;
    }
    const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / denom;
    const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / denom;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.add(t);
  }
  const sorted = [...ts].sort((x, y) => x - y);
  for (let i = 0; i + 1 < sorted.length; i++) {
    const mid = ((sorted[i] as number) + (sorted[i + 1] as number)) / 2;
    if (!pointCovered([a[0] + mid * dx, a[1] + mid * dy], polygon)) return false;
  }
  return pointCovered(a, polygon) && pointCovered(b, polygon);
}

/**
 * Whether a simple ring lies wholly inside a simple polygon (touching its edge is inside, as the
 * Service's `covers`). A closed curve inside a region with no holes bounds a region inside it, so
 * the edges are enough.
 */
export function ringInside(ring: readonly Vertex[], polygon: ReadonlyArray<Vertex>): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) if (!segmentCovered(ring[i] as Vertex, ring[(i + 1) % n] as Vertex, polygon)) return false;
  return true;
}

// ---------- the checks ----------

export const MESSAGES = {
  noUse: 'Type the use as it is lettered on the plate.',
  noRead: 'Drag a crop around the lettering the use was read from.',
  readOffPlate: "The crop must lie on the plate's map area.",
  outsideMap: "The area is not wholly inside the plate's map area.",
  noReason: 'Say why this is not Documented.',
} as const;

export const BANNED_WARNING =
  'This lettering holds a word the Report does not print. The Report will name the source and show the crop instead of quoting it. You can still save it.';

const rectProblem = (r: Rect, within: Rect): boolean =>
  !(Number.isInteger(r.x) && Number.isInteger(r.y) && Number.isInteger(r.width) && Number.isInteger(r.height)) ||
  r.width < 1 ||
  r.height < 1 ||
  r.x < within.x ||
  r.y < within.y ||
  r.x + r.width > within.x + within.width ||
  r.y + r.height > within.y + within.height;

/** Everything that would make the Service refuse this area, in plain words. Empty means it can be published. */
export function areaProblems(area: Pick<TracedArea, 'ring' | 'use' | 'read' | 'confidence' | 'reason'>, ctx: AreaContext): string[] {
  const out: string[] = [];
  const shape = ringProblem(area.ring);
  if (shape) out.push(shape);
  else if (!ringInside(area.ring, ctx.mapAreaPx)) out.push(MESSAGES.outsideMap);
  if (cleanLettering(area.use) === '') out.push(MESSAGES.noUse);
  if (area.read === null) out.push(MESSAGES.noRead);
  else if (rectProblem(area.read, ctx.plate)) out.push(MESSAGES.readOffPlate);
  if (area.confidence !== 'documented' && area.reason.trim() === '') out.push(MESSAGES.noReason);
  return out;
}

/** A warning, not a block: lettering the Report will not quote (requirement 24.5). */
export function bannedWarning(use: string): string | null {
  return findBannedWords(use).length > 0 ? BANNED_WARNING : null;
}

/** The label drawn on the plate beside an area: its lettering, or a pointer when it holds a banned word. */
export function areaLabel(area: Pick<TracedArea, 'use'>): string {
  return findBannedWords(area.use).length > 0 ? 'Lettering recorded (see the crop)' : cleanLettering(area.use);
}

// ---------- the decision ----------

type Decisions = DecisionsV2['decisions'];

/** The trace decision for a checked area. Throws for an area with problems, so a bad one is never sent. */
export function traceDecision(area: TracedArea, reviewer: string, sourceId: string): Decisions[number] {
  if (area.read === null) throw new Error('A land-use area needs the crop its use was read from.');
  const ring = area.ring.map((v) => [v[0], v[1]] as [number, number]);
  const reason = area.confidence === 'documented' ? defaultReason(sourceId) : area.reason.trim();
  return {
    type: 'trace',
    kind: 'land_use',
    pixel_geometry: { type: 'Polygon', coordinates: [[...ring, ring[0] as [number, number]]] },
    attributes: { use: cleanLettering(area.use) },
    attribute_reads: [{ attribute: 'use', crop_px: { ...area.read }, read_by: 'person' }],
    confidence: area.confidence,
    confidence_reason: reason,
    confirmed_by: reviewer,
    confirmed_at: area.at,
  } as Decisions[number];
}
