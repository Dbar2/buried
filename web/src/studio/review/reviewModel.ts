/**
 * The review model: a pure reducer over the proposals of one extraction (spec 04 design "Review").
 * Every action returns a new state. Undo and redo walk `past` and `future`. It decides nothing about
 * geometry, dates or confidence: it records a person's accept or reject, the two optional lettering
 * fields they typed, and writes them out as the decisions file v2 (accept and reject only in this
 * slice; merge, split and vertex edits are later) and, for each traced land-use area, a `trace` decision.
 *
 * Invariant (property S7, this slice): a proposal has at most one decision, and every decision names
 * a proposal that is in `order`.
 */
import type { DecisionsV2, PixelPolygon, ProposalFile, ReviewedAreaDecision } from '../service/types.generated';
import { areaProblems, traceDecision } from './areaModel';
import type { AreaContext, TracedArea } from './areaModel';

export type ProposalFeature = ProposalFile['features'][number];
export type Decision = 'accept' | 'reject';
export type ItemAttributes = { storeys?: number; use?: string };

type Mutable = {
  decisions: Readonly<Record<string, Decision>>;
  decidedAt: Readonly<Record<string, string>>;
  attributes: Readonly<Record<string, ItemAttributes>>;
  current: string | null;
  /** Land-use areas a person traced (requirement 24), in the order they were saved. */
  areas: readonly TracedArea[];
};

export type ReviewState = Mutable & {
  /** Proposal ids in review order. */
  order: readonly string[];
  past: readonly Mutable[];
  future: readonly Mutable[];
};

export type ReviewAction =
  | { type: 'load'; proposals: readonly ProposalFeature[] }
  | { type: 'select'; id: string }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'accept'; at: string }
  | { type: 'reject'; at: string }
  | { type: 'setStoreys'; value: number | undefined }
  | { type: 'setUse'; value: string }
  /** Save a traced area. A new one has no `id` yet; an existing id is replaced. An area the checks refuse is not saved. */
  | { type: 'saveArea'; area: Omit<TracedArea, 'id'> & { id?: string }; context: AreaContext }
  | { type: 'deleteArea'; id: string }
  | { type: 'undo' }
  | { type: 'redo' };

/** Review order: top to bottom, then left to right, by the middle of each proposal's crop. */
export function reviewOrder(proposals: readonly ProposalFeature[]): string[] {
  const middle = (p: ProposalFeature) => ({
    x: p.properties.crop_px.x + p.properties.crop_px.width / 2,
    y: p.properties.crop_px.y + p.properties.crop_px.height / 2,
  });
  return [...proposals]
    .sort((a, b) => {
      const ma = middle(a);
      const mb = middle(b);
      return ma.y - mb.y || ma.x - mb.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    })
    .map((p) => p.id);
}

export function initialReview(proposals: readonly ProposalFeature[]): ReviewState {
  const order = reviewOrder(proposals);
  return {
    order,
    decisions: {},
    decidedAt: {},
    attributes: {},
    areas: [],
    current: order[0] ?? null,
    past: [],
    future: [],
  };
}

const snapshot = (s: ReviewState): Mutable => ({
  decisions: s.decisions,
  decidedAt: s.decidedAt,
  attributes: s.attributes,
  current: s.current,
  areas: s.areas,
});

function withHistory(state: ReviewState, change: Partial<Mutable>): ReviewState {
  return { ...state, ...change, past: [...state.past, snapshot(state)], future: [] };
}

/** The next proposal after `from` (wrapping) that has no decision, or null when all are decided. */
export function nextUndecided(state: ReviewState, from: string | null): string | null {
  const n = state.order.length;
  if (n === 0) return null;
  const start = from === null ? -1 : state.order.indexOf(from);
  for (let step = 1; step <= n; step++) {
    const id = state.order[(start + step + n) % n] as string;
    if (state.decisions[id] === undefined) return id;
  }
  return null;
}

function move(state: ReviewState, delta: 1 | -1): ReviewState {
  const n = state.order.length;
  if (n === 0) return state;
  const at = state.current === null ? (delta === 1 ? -1 : 0) : state.order.indexOf(state.current);
  return { ...state, current: state.order[(at + delta + n) % n] as string };
}

function decide(state: ReviewState, decision: Decision, at: string): ReviewState {
  const id = state.current;
  if (id === null || state.decisions[id] === decision) return state;
  const decided = { ...state, decisions: { ...state.decisions, [id]: decision } };
  const following = nextUndecided(decided, id);
  return withHistory(state, {
    decisions: decided.decisions,
    decidedAt: { ...state.decidedAt, [id]: at },
    current: following ?? id,
  });
}

function setAttribute(state: ReviewState, change: (a: ItemAttributes) => ItemAttributes): ReviewState {
  const id = state.current;
  if (id === null) return state;
  const before = state.attributes[id] ?? {};
  const after = change(before);
  if (JSON.stringify(after) === JSON.stringify(before)) return state;
  const attributes = { ...state.attributes };
  if (Object.keys(after).length === 0) delete attributes[id];
  else attributes[id] = after;
  return withHistory(state, { attributes });
}

/** `use` is kept as typed apart from surrounding spaces; empty means not set. */
export function cleanUse(text: string): string | undefined {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed === '' ? undefined : trimmed;
}

/** The next local id for an area: one more than the largest `area_<n>` in use, so an id is not reused within a review. */
export function nextAreaId(areas: readonly TracedArea[]): string {
  const used = areas.map((a) => Number(/^area_(\d+)$/.exec(a.id)?.[1] ?? 0));
  return `area_${Math.max(0, ...used) + 1}`;
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  switch (action.type) {
    case 'load':
      return initialReview(action.proposals);
    case 'select':
      return state.order.includes(action.id) ? { ...state, current: action.id } : state;
    case 'next':
      return move(state, 1);
    case 'previous':
      return move(state, -1);
    case 'accept':
      return decide(state, 'accept', action.at);
    case 'reject':
      return decide(state, 'reject', action.at);
    case 'setStoreys':
      return setAttribute(state, (a) => {
        const { storeys: _drop, ...rest } = a;
        void _drop;
        const v = action.value;
        return v !== undefined && Number.isInteger(v) && v >= 1 ? { ...rest, storeys: v } : rest;
      });
    case 'setUse':
      return setAttribute(state, (a) => {
        const { use: _drop, ...rest } = a;
        void _drop;
        const use = cleanUse(action.value);
        return use === undefined ? rest : { ...rest, use };
      });
    case 'saveArea': {
      if (areaProblems(action.area, action.context).length > 0) return state;
      const id = action.area.id ?? nextAreaId(state.areas);
      const saved: TracedArea = { ...action.area, id, use: action.area.use.trim() };
      const exists = state.areas.some((a) => a.id === id);
      return withHistory(state, { areas: exists ? state.areas.map((a) => (a.id === id ? saved : a)) : [...state.areas, saved] });
    }
    case 'deleteArea':
      return state.areas.some((a) => a.id === action.id) ? withHistory(state, { areas: state.areas.filter((a) => a.id !== action.id) }) : state;
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return { ...state, ...previous, past: state.past.slice(0, -1), future: [snapshot(state), ...state.future] };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return { ...state, ...next, past: [...state.past, snapshot(state)], future: state.future.slice(1) };
    }
  }
}

export type ReviewCounts = { accepted: number; rejected: number; undecided: number };

export function reviewCounts(state: ReviewState): ReviewCounts {
  let accepted = 0;
  let rejected = 0;
  for (const id of state.order) {
    const d = state.decisions[id];
    if (d === 'accept') accepted++;
    else if (d === 'reject') rejected++;
  }
  return { accepted, rejected, undecided: state.order.length - accepted - rejected };
}

/**
 * The decisions file v2 for this review: accept and reject for proposals, and one land-use `trace`
 * for each saved area. Throws if a saved area has no crop, so a bad one is never sent.
 */
export function buildDecisionsV2(
  state: ReviewState,
  proposals: readonly ProposalFeature[],
  sourceId: string,
  reviewer: string,
  reviewedAreas: readonly { pixel_polygon: PixelPolygon; at: string }[],
): DecisionsV2 {
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const decisions: DecisionsV2['decisions'] = [];
  for (const id of state.order) {
    const decision = state.decisions[id];
    const proposal = byId.get(id);
    if (decision === undefined || proposal === undefined) continue;
    const at = state.decidedAt[id] as string;
    if (decision === 'reject') {
      decisions.push({ type: 'reject', proposal_id: id, confirmed_by: reviewer, confirmed_at: at });
      continue;
    }
    const attrs = state.attributes[id] ?? {};
    const attributes: { storeys?: number; use?: string } = {};
    const attribute_reads: Array<{ attribute: 'storeys' | 'use'; crop_px: ProposalFeature['properties']['crop_px']; read_by: 'person' }> = [];
    if (attrs.storeys !== undefined) {
      attributes.storeys = attrs.storeys;
      attribute_reads.push({ attribute: 'storeys', crop_px: proposal.properties.crop_px, read_by: 'person' });
    }
    if (attrs.use !== undefined) {
      attributes.use = attrs.use;
      attribute_reads.push({ attribute: 'use', crop_px: proposal.properties.crop_px, read_by: 'person' });
    }
    decisions.push({
      type: 'accept',
      proposal_id: id,
      confirmed_by: reviewer,
      confirmed_at: at,
      ...(attribute_reads.length > 0 ? { attributes, attribute_reads } : {}),
    });
  }
  for (const area of state.areas) decisions.push(traceDecision(area, reviewer, sourceId));
  const reviewed_areas: ReviewedAreaDecision[] = reviewedAreas.map((area) => ({
    pixel_polygon: area.pixel_polygon,
    confirmed_by: reviewer,
    confirmed_at: area.at,
  }));
  return { version: 2, source: sourceId, decisions, reviewed_areas };
}
