/**
 * The review status of a feature as a Report sentence (spec 06 requirement 9.2): "Status: reviewed by <by>, <on>"
 * or "Status: draft, not yet reviewed", from `provenance.review` through the Evidence Library's one wording
 * function. `confirmed_by` and `confirmed_at` are the publishing record and are never printed as a status.
 * Replaces the "Confirmed by: <name>, <date>." line of session 027.
 */
import { EMPTY_PACK, reviewStatusLine } from '../evidence';
import type { Feature, ReviewState } from '../evidence';
import type { Sentence } from './sentence';

type ReviewOf = Pick<ReviewState, 'state' | 'by' | 'on'> | undefined;

export const reviewOf = (feature: Pick<Feature, 'properties'>): ReviewOf => feature.properties.provenance.review;

/** The status as a sentence. The name and the day are verbatim strings of the record; a draft carries neither. */
export function statusSentence(review: ReviewOf): Sentence {
  const text = reviewStatusLine(review);
  const verbatim: string[] = [];
  if (review && review.state === 'reviewed') {
    for (const value of [review.by, review.on]) if (value && text.includes(value)) verbatim.push(value);
  }
  return { text, pack: { ...EMPTY_PACK, verbatim: verbatim.sort() }, claims: [] };
}

/** One status sentence per distinct status among `features`, in a stable order. */
export function statusSentences(features: ReadonlyArray<Pick<Feature, 'properties'>>): Sentence[] {
  const byText = new Map<string, Sentence>();
  for (const f of features) {
    const s = statusSentence(reviewOf(f));
    byText.set(s.text, s);
  }
  return [...byText.keys()].sort().map((k) => byText.get(k) as Sentence);
}
