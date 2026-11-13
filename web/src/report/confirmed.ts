/**
 * "Confirmed by: <name>, <date>." The record's own words about who confirmed a feature, copied from
 * its provenance and nothing more. The Report never turns confidence, or anything else, into a claim
 * that a person checked or reviewed something: only the provenance's `confirmed_by` and
 * `confirmed_at` are shown, as the record states them (session 027).
 */
import { findBannedWords } from '../evidence';
import type { Feature } from '../evidence';
import { fixed, sentence, verbatim } from './sentence';
import type { Sentence } from './sentence';

export type Confirmation = { by: string; at: string };

export function confirmationOf(feature: Pick<Feature, 'properties'>): Confirmation {
  const p = feature.properties.provenance;
  return { by: p.confirmed_by, at: p.confirmed_at };
}

/** A stable key for features that carry the same confirmation. */
export const confirmationKey = (c: Confirmation): string => `${c.by}|${c.at}`;

/** The date part of an ISO timestamp, as the record states it. */
const dateOf = (at: string): string => (/^\d{4}-\d{2}-\d{2}/.exec(at)?.[0] ?? at);

export function confirmedSentence(c: Confirmation): Sentence {
  // A name with a banned word is not reproduced (product rule 1), as with a quoted use.
  if (findBannedWords(c.by).length > 0) return fixed('Confirmed by: the name is recorded in the evidence file.');
  return sentence`Confirmed by: ${verbatim(c.by)}, ${verbatim(dateOf(c.at))}.`;
}

/** One sentence per distinct confirmation among `features`, in a stable order. */
export function confirmedSentences(features: ReadonlyArray<Pick<Feature, 'properties'>>): Sentence[] {
  const byKey = new Map<string, Confirmation>();
  for (const f of features) {
    const c = confirmationOf(f);
    byKey.set(confirmationKey(c), c);
  }
  return [...byKey.keys()].sort().map((k) => confirmedSentence(byKey.get(k) as Confirmation));
}
