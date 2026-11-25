/**
 * Address suggestions for the Landing's combobox (spec 08 requirement 8). Pure: a list of address points
 * and the set of addresses that sit on a lot with something recorded go in, ranked suggestions come out.
 *
 * Matching is by token. A token that starts with a digit matches the start of the house number; any other
 * token matches the start of a word of the rest of the address. So "2a p", "percy" and "king 52" all work.
 * Addresses on a lot with something recorded come before every other address, whatever the query.
 */
import { findBannedWords } from '../evidence';
import type { PresentLayer } from '../evidence';
import type { TaggedLot } from './landing';

export type AddressEntry = { id: string; text: string; point: [number, number] };

/** `recorded` maps an address text to the id of the lot it stands on, for lots with something recorded. */
export type AddressBook = { entries: readonly AddressEntry[]; recorded: ReadonlyMap<string, string> };

export type Suggestion = AddressEntry & { recorded: boolean; lotId: string | null };

export const MAX_SUGGESTIONS = 7;
export const MAX_DEFAULT_SUGGESTIONS = 8;

const byString = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
/** Address text in the order a person reads it: "2A" before "24" before "37", then plain string order for equal text. */
const byText = (a: string, b: string): number => collator.compare(a, b) || byString(a, b);

/** The address points as one entry per distinct address text (the lowest id wins), with the recorded lookup. */
export function addressBook(layer: PresentLayer | undefined, recordedLots: readonly TaggedLot[]): AddressBook {
  const byTextMap = new Map<string, AddressEntry>();
  for (const f of layer?.features ?? []) {
    const text = f.properties.ADDRESS_FULL;
    if (f.geometry.type !== 'Point' || typeof text !== 'string' || text.trim() === '' || findBannedWords(text).length > 0) continue;
    const [e, n] = f.geometry.coordinates as [number, number];
    const old = byTextMap.get(text);
    if (old === undefined || byString(f.id, old.id) < 0) byTextMap.set(text, { id: f.id, text, point: [e, n] });
  }
  const recorded = new Map<string, string>();
  for (const lot of recordedLots) for (const text of lot.addresses) if (byTextMap.has(text) && !recorded.has(text)) recorded.set(text, lot.lotId);
  return { entries: [...byTextMap.values()].sort((a, b) => byText(a.text, b.text) || byString(a.id, b.id)), recorded };
}

/** The lowercase words of a query or an address. */
export const wordsOf = (text: string): string[] => text.toLowerCase().split(/[\s,]+/).filter((w) => w !== '');

const startsWithDigit = (word: string): boolean => /^\d/.test(word);

/** True when every token of the query matches the address (see the module comment). */
export function matchesTokens(address: string, tokens: readonly string[]): boolean {
  const words = wordsOf(address);
  const number = words[0] !== undefined && startsWithDigit(words[0]) ? words[0] : null;
  const street = number === null ? words : words.slice(1);
  return tokens.every((t) => (startsWithDigit(t) ? number !== null && number.startsWith(t) : street.some((w) => w.startsWith(t))));
}

const asSuggestion = (e: AddressEntry, book: AddressBook): Suggestion => {
  const lotId = book.recorded.get(e.text) ?? null;
  return { ...e, recorded: lotId !== null, lotId };
};

/** Up to `limit` addresses matching the query, recorded ones first. An empty query gives none. */
export function suggest(book: AddressBook, query: string, limit = MAX_SUGGESTIONS): Suggestion[] {
  const tokens = wordsOf(query);
  if (tokens.length === 0) return [];
  const whole = tokens.join(' ');
  const rank = (text: string): number => {
    const lower = wordsOf(text).join(' ');
    return lower === whole ? 0 : lower.startsWith(whole) ? 1 : 2;
  };
  return book.entries
    .filter((e) => matchesTokens(e.text, tokens))
    .map((e) => asSuggestion(e, book))
    .sort((a, b) => Number(b.recorded) - Number(a.recorded) || rank(a.text) - rank(b.text) || byText(a.text, b.text) || byString(a.id, b.id))
    .slice(0, limit);
}

/** The addresses with something recorded, one per lot (the first by text), at most `limit`, in text order. */
export function defaultSuggestions(book: AddressBook, limit = MAX_DEFAULT_SUGGESTIONS): Suggestion[] {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  const ordered = [...book.entries].sort((a, b) => byText(a.text, b.text) || byString(a.id, b.id));
  for (const e of ordered) {
    const lotId = book.recorded.get(e.text);
    if (lotId === undefined || seen.has(lotId)) continue;
    seen.add(lotId);
    out.push(asSuggestion(e, book));
  }
  return out.slice(0, limit);
}

/** A random address on a lot with something recorded, one draw per lot. `random` is in [0, 1). Null when none exist. */
export function randomRecorded(book: AddressBook, random: () => number): Suggestion | null {
  const all = defaultSuggestions(book, Number.MAX_SAFE_INTEGER);
  if (all.length === 0) return null;
  return all[Math.min(all.length - 1, Math.floor(random() * all.length))] as Suggestion;
}
