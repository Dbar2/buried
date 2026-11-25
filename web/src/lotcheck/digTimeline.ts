/**
 * The dig sequence as data (spec 08 requirement 9). Pure: a lot check and the motion preference go in; a list of
 * timed steps, the marks of the depth ruler and the slips come out. `stateAt` says where the lantern is, which
 * slips are showing and how dark the screen is at any time. The overlay only draws that state.
 *
 * The dig is presentation (product.md rule 17). Every slip's words are a line of the lot check the Result shows
 * (or the one fixed phrase "nothing lettered here"); the sequence computes nothing.
 *
 * Timing, in milliseconds, before scaling: 800 to break ground (Today's slip shows in it), 1200 per layer (600
 * down, 600 paused with its slip), 800 at the bottom, 500 dark beat. Two plans: 4500. The whole is scaled down
 * when it would pass `MAX_TOTAL_MS`.
 */
import { sentence } from '../report/sentence';
import type { Slot } from '../report/sentence';
import * as copy from './copy';
import type { LotCheck, PlanRow, UseLine } from './lotCheck';

export const GROUND_MS = 800;
export const DOWN_MS = 600;
export const PAUSE_MS = 600;
export const BOTTOM_MS = 800;
export const BEAT_MS = 500;
export const MAX_TOTAL_MS = 7000;
export const MIN_TOTAL_MS = 2000;
/** When Today's slip appears in the ground step, and how long after a pause starts a layer's slip appears. */
const TODAY_SLIP_AT_MS = 500;
const PAUSE_SLIP_AT_MS = 100;
/** The lantern starts this far above the ground line (in marks) and ends this far below the last mark. */
const ABOVE_GROUND = -0.5;
const BELOW_BOTTOM = 0.45;

export type CheckOf = Extract<LotCheck, { kind: 'check' }>;

export type DigMark = { index: number; label: string; kind: 'today' | 'plan'; sourceId: string | null };

export type DigSlip = {
  markIndex: number;
  kind: 'today' | 'use' | 'near' | 'nothing';
  /** "next door: " for a use near the lot, else "". */
  prefix: string;
  /** The words of a line of the lot check (the address, a lettering line), or `copy.DIG.nothing`. */
  text: string;
  muted: boolean;
};

export type DigStep = { kind: 'ground' | 'lower' | 'pause' | 'bottom' | 'beat'; markIndex: number; startMs: number; endMs: number };

export type DigTimeline = {
  marks: DigMark[];
  slips: DigSlip[];
  steps: DigStep[];
  totalMs: number;
  /** "Digging down to 1911…" */
  caption: string;
  address: string;
  /** What the polite live region says at the end: the verdict sentence. */
  verdict: string;
  /** When each slip appears, by mark index. */
  slipAtMs: number[];
};

const byUseLine = (a: UseLine, b: UseLine): number =>
  (a.relation.kind === 'on' ? 0 : 1) - (b.relation.kind === 'on' ? 0 : 1) ||
  (a.matched !== null ? 0 : 1) - (b.matched !== null ? 0 : 1) ||
  // A land-use area (a yard, a works) before a building, as the Result's sentence chooses.
  Number(b.featureId.startsWith('use_')) - Number(a.featureId.startsWith('use_'));

/** The slip for a plan's row: its first lettered use as the Result words it, or "nothing lettered here". */
export function slipForRow(row: PlanRow, markIndex: number): DigSlip {
  const line = [...row.lines].sort(byUseLine)[0];
  if (!line) return { markIndex, kind: 'nothing', prefix: '', text: copy.DIG.nothing, muted: true };
  const near = line.relation.kind === 'near';
  return { markIndex, kind: near ? 'near' : 'use', prefix: near ? copy.DIG.nextDoor : '', text: line.text.text, muted: false };
}

/** "Digging down to 1911…" with the year in the pack, or the plain line when no plan covers the lot. */
export function captionFor(oldest: string | null): string {
  if (oldest === null) return copy.DIG.captionNoPlans;
  const slot: Slot = { text: oldest, numbers: oldest.match(/\d+/g) ?? [] };
  return sentence`Digging down to ${slot}…`.text;
}

/** Whether the overlay plays: not under reduced motion, and not for a lot the plans do not cover ("NOT DUG YET"). */
export function digPlays(check: CheckOf, reducedMotion: boolean): boolean {
  return !reducedMotion && check.verdict.tag !== 'not_covered';
}

export function buildDigTimeline(check: CheckOf, reducedMotion: boolean): DigTimeline {
  const planRows = check.rows.filter((r): r is PlanRow => r.kind === 'plan').reverse();
  const marks: DigMark[] = [
    { index: 0, label: copy.DIG.today, kind: 'today', sourceId: null },
    ...planRows.map((r, i): DigMark => ({ index: i + 1, label: r.yearLabel, kind: 'plan', sourceId: r.sourceId })),
  ];
  const slips: DigSlip[] = [
    { markIndex: 0, kind: 'today', prefix: '', text: check.title.text, muted: false },
    ...planRows.map((r, i) => slipForRow(r, i + 1)),
  ];
  const oldest = planRows.length > 0 ? (planRows[planRows.length - 1] as PlanRow).yearLabel : null;
  const base = {
    marks,
    slips,
    caption: captionFor(oldest),
    address: check.title.text,
    verdict: check.verdict.sentences.map((s) => s.text).join(' '),
  };
  if (reducedMotion) return { ...base, steps: [], totalMs: 0, slipAtMs: [] };

  const n = planRows.length;
  const unscaled = GROUND_MS + (DOWN_MS + PAUSE_MS) * n + BOTTOM_MS + BEAT_MS;
  const k = unscaled > MAX_TOTAL_MS ? MAX_TOTAL_MS / unscaled : 1;
  const ms = (v: number): number => Math.round(v * k);
  const steps: DigStep[] = [];
  const slipAtMs: number[] = [ms(TODAY_SLIP_AT_MS)];
  let at = 0;
  let cumulative = 0;
  const add = (kind: DigStep['kind'], markIndex: number, length: number) => {
    // Rounding the running total, not each piece, keeps the sum within the cap.
    cumulative += length;
    const end = ms(cumulative);
    steps.push({ kind, markIndex, startMs: at, endMs: end });
    at = end;
  };
  add('ground', 0, GROUND_MS);
  for (let m = 1; m <= n; m++) {
    add('lower', m, DOWN_MS);
    slipAtMs.push(at + ms(PAUSE_SLIP_AT_MS));
    add('pause', m, PAUSE_MS);
  }
  add('bottom', n, BOTTOM_MS);
  add('beat', n, BEAT_MS);
  return { ...base, steps, totalMs: at, slipAtMs };
}

export type DigState = {
  /** Milliseconds into the sequence, clamped to [0, totalMs]. */
  t: number;
  done: boolean;
  phase: DigStep['kind'] | 'idle';
  /** The lantern's place along the ruler, in marks: 0 is Today, 1 the newest plan. Below 0 is above the ground. */
  depth: number;
  /** The slips on show, by mark index. */
  slipsShown: number[];
  /** The mark whose pause is on, or null. */
  activeMark: number | null;
  /** 0 to 1: the screen going dark in the closing beat. */
  dark: number;
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeInOut = (v: number): number => v * v * (3 - 2 * v);
const easeOut = (v: number): number => 1 - (1 - v) ** 2;
const lerp = (a: number, b: number, v: number): number => a + (b - a) * v;

/** Where everything is at time `t`. A time past the end is the end. */
export function stateAt(tl: DigTimeline, t: number): DigState {
  const total = tl.totalMs;
  const time = Math.min(Math.max(t, 0), total);
  const n = tl.marks.length - 1;
  const slipsShown = tl.slipAtMs.flatMap((at, i) => (time >= at ? [i] : []));
  if (tl.steps.length === 0) return { t: 0, done: true, phase: 'idle', depth: n + BELOW_BOTTOM, slipsShown: [], activeMark: null, dark: 1 };
  const step = tl.steps.find((s) => time >= s.startMs && time < s.endMs) ?? (tl.steps[tl.steps.length - 1] as DigStep);
  const p = step.endMs > step.startMs ? clamp01((time - step.startMs) / (step.endMs - step.startMs)) : 1;
  let depth: number;
  switch (step.kind) {
    case 'ground':
      depth = lerp(ABOVE_GROUND, 0, easeOut(p));
      break;
    case 'lower':
      depth = lerp(step.markIndex - 1, step.markIndex, easeInOut(p));
      break;
    case 'pause':
      depth = step.markIndex;
      break;
    case 'bottom':
      depth = lerp(n, n + BELOW_BOTTOM, easeInOut(p));
      break;
    default:
      depth = n + BELOW_BOTTOM;
  }
  const todaySlip = tl.slipAtMs[0] ?? 0;
  const activeMark = step.kind === 'pause' ? step.markIndex : step.kind === 'ground' && time >= todaySlip ? 0 : null;
  return { t: time, done: time >= total, phase: time >= total ? 'beat' : step.kind, depth, slipsShown, activeMark, dark: step.kind === 'beat' ? easeInOut(p) : time >= total ? 1 : 0 };
}

/** A time inside the pause of a mark, with its slip showing: the test hook freezes the clock here. */
export function holdTime(tl: DigTimeline, markIndex: number): number {
  if (tl.steps.length === 0) return 0;
  if (markIndex <= 0) return Math.round(((tl.slipAtMs[0] ?? 0) + (tl.steps[0] as DigStep).endMs) / 2);
  const pause = tl.steps.find((s) => s.kind === 'pause' && s.markIndex === markIndex);
  if (!pause) return tl.totalMs;
  return Math.round((pause.startMs + pause.endMs) / 2);
}

/** "Skip", Escape and Enter: the end of the sequence, from any moment. */
export const skipTo = (tl: DigTimeline, _from: number): number => tl.totalMs;
