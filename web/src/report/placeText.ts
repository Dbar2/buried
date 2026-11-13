/**
 * The words at the top of the place page and the Report (session 027): the heading made from the
 * lot's addresses, the short summary built only from facts on the page, and the coverage line (which
 * plans Buried holds, and how much of Toronto they cover). Pure functions of their inputs. Every
 * figure goes through a slot, so each sentence carries the fact pack it was built from.
 */
import { plainSourceNumbers, plainYears } from '../evidence';
import type { LotRelation, Source, SourceRegistry, TileSidecar } from '../evidence';
import { fixed, joined, listOf, plan, sentence, words } from './sentence';
import type { Sentence, Slot } from './sentence';
import { STRUCTURE_RADIUS_M } from './radii';
import * as copy from './copy';

export const COVERAGE_TODAY = copy.COVERAGE_TODAY;
export const NO_ADDRESS_HEADING = copy.NO_ADDRESS_HEADING;
export const NO_PLAN_SUMMARY = copy.NO_PLAN_SUMMARY;

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];

/** "One", "Two" ... "Nine"; ten and over are digits, which go into the fact pack. */
function countSlot(n: number, capital: boolean): Slot {
  if (n >= 0 && n < WORDS.length) {
    const word = WORDS[n] as string;
    return words(capital ? word : word.toLowerCase());
  }
  return { text: String(n), numbers: [String(n)] };
}

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// ---------- the heading ----------

const MAX_NUMBERS = 4;

/**
 * "541 and 543 Queen St E": address points on one lot, joined by street. House numbers on the same
 * street share one street name. An address that does not start with a number is kept whole. More than
 * four numbers on a street read "541, 543, 545, 547 and 3 more Queen St E". With no address the heading
 * is "This lot".
 */
export function addressHeading(addresses: readonly string[]): Sentence {
  if (addresses.length === 0) return fixed(NO_ADDRESS_HEADING);
  const streets = new Map<string, string[]>();
  const whole: string[] = [];
  for (const a of addresses) {
    const m = /^(\d+[A-Za-z]?)\s+(\S.*)$/.exec(a);
    if (!m) {
      whole.push(a);
      continue;
    }
    const numbers = streets.get(m[2] as string) ?? [];
    numbers.push(m[1] as string);
    streets.set(m[2] as string, numbers);
  }
  const numericOrder = (a: string, b: string): number => parseInt(a, 10) - parseInt(b, 10) || byString(a, b);
  const parts: Slot[] = [];
  for (const street of [...streets.keys()].sort(byString)) {
    const numbers = [...new Set(streets.get(street) as string[])].sort(numericOrder);
    const shown = numbers.slice(0, MAX_NUMBERS);
    const more = numbers.length - shown.length;
    const numberSlots: Slot[] = shown.map((n) => ({ text: n, numbers: n.match(/\d+/g) ?? [] }));
    if (more > 0) numberSlots.push({ text: `${more} more`, numbers: [String(more)] });
    parts.push(joined([listOf(numberSlots), words(' '), { text: street, verbatim: [street], numbers: street.match(/\d+/g) ?? [] }], ''));
  }
  for (const a of whole.sort(byString)) parts.push({ text: a, verbatim: [a] });
  return sentence`${listOf(parts)}`;
}

// ---------- the summary ----------

export type Outline = { featureId: string; relation: LotRelation };

export type SummaryInput = {
  /** Plan sources whose record shows the lot (reviewed or mapped), any number of sheets. */
  covering: readonly Source[];
  /** True when a person has reviewed the area around the lot on at least one of them. */
  anyReviewed: boolean;
  /** Aerial photographs that cover the lot and are loaded. */
  aerials: readonly Source[];
  /** One entry per building outline set in range of the lot. */
  outlines: readonly Outline[];
};

/** Plans named once each by their plain name, earliest first. */
function distinctPlans(sources: readonly Source[]): Source[] {
  const seen = new Map<string, Source>();
  for (const s of [...sources].sort((a, b) => (a.year_from ?? 0) - (b.year_from ?? 0) || byString(a.id, b.id))) {
    const key = plainYears(s);
    if (!seen.has(key)) seen.set(key, s);
  }
  return [...seen.values()];
}

const yearsSlot = (s: Source): Slot => ({ text: plainYears(s), numbers: plainSourceNumbers(s) });

/**
 * "Two fire insurance plans cover this lot: 1911 and 1931-35. One building outline from these
 * records sits on this lot." With nothing reviewed and nothing drawn: "Buried holds two plans that
 * cover this lot. Nothing on them has been reviewed here yet."
 */
export function summarySentences(input: SummaryInput): Sentence[] {
  const plans = distinctPlans(input.covering);
  const out: Sentence[] = [];
  if (plans.length === 0) return [fixed(NO_PLAN_SUMMARY)];
  const n = plans.length;
  const outlines = input.outlines;

  if (outlines.length === 0 && !input.anyReviewed) {
    out.push(sentence`Buried holds ${countSlot(n, false)} ${words(n === 1 ? 'plan that covers' : 'plans that cover')} this lot.`);
    out.push(fixed(n === 1 ? 'Nothing on it has been reviewed here yet.' : 'Nothing on them has been reviewed here yet.'));
  } else {
    out.push(sentence`${countSlot(n, true)} fire insurance ${words(n === 1 ? 'plan covers' : 'plans cover')} this lot: ${listOf(plans.map(yearsSlot))}.`);
    const on = outlines.filter((o) => o.relation.kind === 'on');
    const near = outlines.filter((o): o is Outline & { relation: { kind: 'near'; withinM: number } } => o.relation.kind === 'near');
    if (outlines.length === 0) {
      out.push(sentence`No building outline from these records sits within ${{ text: String(STRUCTURE_RADIUS_M), numbers: [String(STRUCTURE_RADIUS_M)] }} m of this lot.`);
    }
    if (on.length > 0) {
      const claims = on.map((o) => ({ featureId: o.featureId, kind: 'on' as const }));
      const phrase: Slot = { text: 'on this lot', claims };
      out.push(sentence`${countSlot(on.length, true)} building ${words(on.length === 1 ? 'outline' : 'outlines')} from these records ${words(on.length === 1 ? 'sits' : 'sit')} ${phrase}.`);
    }
    if (near.length > 0) {
      const widest = Math.max(...near.map((o) => o.relation.withinM));
      const claims = near.map((o) => ({ featureId: o.featureId, kind: 'near' as const, withinM: o.relation.withinM }));
      const phrase: Slot = { text: `near this lot (within ${widest} m)`, numbers: [String(widest)], claims };
      if (on.length > 0) out.push(sentence`${countSlot(near.length, true)} more ${words(near.length === 1 ? 'sits' : 'sit')} ${phrase}.`);
      else out.push(sentence`${countSlot(near.length, true)} building ${words(near.length === 1 ? 'outline' : 'outlines')} from these records ${words(near.length === 1 ? 'sits' : 'sit')} ${phrase}.`);
    }
  }
  const photos = distinctPlans(input.aerials);
  if (photos.length > 0) {
    const names = listOf(photos.map((s) => plan(s)));
    const first: Slot = { ...names, text: names.text.charAt(0).toUpperCase() + names.text.slice(1) };
    out.push(sentence`${first} ${words(photos.length === 1 ? 'also covers' : 'also cover')} this lot.`);
  }
  return out;
}

// ---------- the coverage line ----------

/**
 * Which plans Buried holds for this area, and that coverage today is one block of Toronto.
 * "Buried holds the 1911 plan and the 1931-35 plan for this area. Coverage today is one block of
 * Toronto." Plans are the registered fire insurance plans whose rights are confirmed; photographs are
 * named only when a tile of them is loaded.
 */
export function coverageLine(registry: SourceRegistry | undefined, sidecars: readonly TileSidecar[] = []): Sentence[] {
  if (!registry) return [];
  const confirmed = registry.sources.filter((s) => s.attribution_status === 'confirmed' && s.year_from !== null);
  const plans = distinctPlans(confirmed.filter((s) => s.type === 'fire_insurance_plan'));
  const photos = distinctPlans(confirmed.filter((s) => s.type === 'aerial_photograph' && sidecars.some((t) => t.source === s.id)));
  const held = [...plans, ...photos];
  if (held.length === 0) return [];
  return [sentence`Buried holds ${listOf(held.map((s) => plan(s)))} for this area.`, fixed(COVERAGE_TODAY)];
}
