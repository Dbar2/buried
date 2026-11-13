/**
 * The status line of a feature (spec 06 requirement 9.2, evidence schema 1.2.0 `provenance.review`).
 *
 *  - reviewed, with `by` and `on`: "Status: reviewed by <by>, <on>"
 *  - anything else:                 "Status: draft, not yet reviewed"
 *
 * `confirmed_by` and `confirmed_at` are the publishing record, who accepted a proposal into the file. They are
 * never printed as a status, and the word "Confirmed" is not in either line. A `reviewed` state with no named
 * person or no day is not a review a reader can check, so it reads as a draft (the Schema forbids it anyway).
 * A name with a banned word is not reproduced (product rule 1); the line says the name is in the evidence file.
 */
import type { ReviewState } from './types.generated';
import { findBannedWords } from './text';

export const DRAFT_STATUS = 'Status: draft, not yet reviewed';

export function reviewStatusLine(review: Pick<ReviewState, 'state' | 'by' | 'on'> | undefined): string {
  if (!review || review.state !== 'reviewed' || !review.by || !review.on) return DRAFT_STATUS;
  if (findBannedWords(review.by).length > 0) return `Status: reviewed on ${review.on}, the reviewer is named in the evidence file`;
  return `Status: reviewed by ${review.by}, ${review.on}`;
}

/** True when a named person has reviewed the feature against its source. */
export function isReviewed(review: Pick<ReviewState, 'state' | 'by' | 'on'> | undefined): boolean {
  return reviewStatusLine(review) !== DRAFT_STATUS;
}
