/**
 * The sentence builder (spec 05 design "Sentences"). A tagged template whose slots record the fact
 * pack as they render, so a sentence always carries exactly the numbers, ids and verbatim strings it
 * was built from. Interpolating a bare string is a type error: every value goes through a slot.
 *
 * The text between slots is fixed wording. It holds no digits (a test checks every template).
 */
import { EMPTY_PACK, datePhrases, plainSourceName, plainSourceNumbers, positionPhrase, sourceYearsText } from '../evidence';
import type { Dated, SentencePack, Source } from '../evidence';

export type RelationClaim = { featureId: string; kind: 'on' } | { featureId: string; kind: 'near'; withinM: number };

export type Sentence = { text: string; pack: SentencePack; claims: RelationClaim[] };

export type Slot = {
  readonly text: string;
  readonly numbers?: readonly string[];
  readonly ids?: readonly string[];
  readonly verbatim?: readonly string[];
  readonly claims?: readonly RelationClaim[];
};

export const num = (n: number): Slot => ({ text: String(n), numbers: [String(n)] });

/** A source's years as the Registry words them ("1911, revised to 1914"), with both years in the pack. */
export const years = (source: Pick<Source, 'id' | 'year_from' | 'year_to' | 'years_label'>): Slot => ({
  text: sourceYearsText(source),
  numbers: [source.year_from, source.year_to].filter((y): y is number => y !== null).map(String),
});

/** A source's plain name as a slot: "the 1911 plan", with its years in the pack. No id: the id stays in the sources block. */
export function plan(source: Pick<Source, 'id' | 'type' | 'year_from' | 'year_to'> | undefined): Slot {
  if (!source) return { text: 'the records' };
  return { text: plainSourceName(source), numbers: plainSourceNumbers(source) };
}

/** "a", "a and b", "a, b and c". Equal texts are listed once. */
export function listOf(slots: readonly Slot[]): Slot {
  const seen = new Set<string>();
  const unique = slots.filter((s) => (seen.has(s.text) ? false : (seen.add(s.text), true)));
  if (unique.length <= 1) return joined(unique, '');
  const last = unique[unique.length - 1] as Slot;
  return joined([joined(unique.slice(0, -1), ', '), words(' and '), last], '');
}

export const id = (value: string): Slot => ({ text: value, ids: [value] });

export const quote = (value: string): Slot => ({ text: `'${value}'`, verbatim: [value] });

/** A string copied from a record and shown without quotes, such as a lot id. */
export const verbatim = (value: string): Slot => ({ text: value, verbatim: [value] });

/** Date phrases joined by " · ", with the summary's years in the pack. */
export function dates(summary: Dated): Slot {
  const numbers = [summary.builtBy, summary.lastSeen, summary.goneBy, summary.notYetBuiltAt].filter((y): y is number => y !== null).map(String);
  return { text: datePhrases(summary).join(' · '), numbers };
}

/** The one date phrase that starts with `prefix` ("Built by", "Last seen", "Gone by", "Not yet built at"). */
export function datePhrase(summary: Dated, prefix: string): Slot {
  const phrase = datePhrases(summary).find((p) => p.startsWith(prefix));
  if (phrase === undefined) throw new RangeError(`no date phrase starts with "${prefix}"`);
  return { text: phrase, numbers: [phrase.slice(prefix.length).trim()] };
}

/** The position phrase for an error in metres. The pack holds the number the phrase is built from. */
export function position(errorM: number): Slot {
  const rounded = Math.ceil(Number((errorM * 10).toFixed(9))) / 10;
  return { text: positionPhrase(errorM), numbers: [rounded.toFixed(1)] };
}

/** "near this lot (within X m)" and a near claim. `withinM` is a whole number. */
export const within = (featureId: string, withinM: number): Slot => ({
  text: `near this lot (within ${withinM} m)`,
  numbers: [String(withinM)],
  claims: [{ featureId, kind: 'near', withinM }],
});

export const onLot = (featureId: string): Slot => ({ text: 'on this lot', claims: [{ featureId, kind: 'on' }] });

export const link = (url: string): Slot => ({ text: url, verbatim: [url] });

/** Plain text that is fixed wording and so adds nothing to the pack. Use only for words, not figures. */
export const words = (text: string): Slot => ({ text });

/** Build a sentence. Slots may be nested by passing `joined` slots. */
export function sentence(strings: TemplateStringsArray, ...slots: readonly Slot[]): Sentence {
  let text = '';
  const numbers: string[] = [];
  const ids: string[] = [];
  const verbatim: string[] = [];
  const claims: RelationClaim[] = [];
  strings.forEach((fixed, i) => {
    text += fixed;
    const slot = slots[i];
    if (slot === undefined) return;
    text += slot.text;
    numbers.push(...(slot.numbers ?? []));
    ids.push(...(slot.ids ?? []));
    verbatim.push(...(slot.verbatim ?? []));
    claims.push(...(slot.claims ?? []));
  });
  return {
    text,
    pack: { numbers: [...new Set(numbers)].sort(), ids: [...new Set(ids)].sort(), verbatim: [...new Set(verbatim)].sort() },
    claims,
  };
}

/** A slot that joins others with a separator, keeping every pack entry. */
export function joined(slots: readonly Slot[], separator: string): Slot {
  return {
    text: slots.map((s) => s.text).join(separator),
    numbers: slots.flatMap((s) => s.numbers ?? []),
    ids: slots.flatMap((s) => s.ids ?? []),
    verbatim: slots.flatMap((s) => s.verbatim ?? []),
    claims: slots.flatMap((s) => s.claims ?? []),
  };
}

/** A sentence that is fixed copy: its text must not hold a number or an id. */
export function fixed(text: string): Sentence {
  return { text, pack: EMPTY_PACK, claims: [] };
}
