/**
 * The banned-word check (product.md honesty rule 1, spec 01 requirement 14.4).
 *
 * Report text and generated text never say that a place is or is not "safe", "clean" or
 * "contaminated", or that it "will flood". A word counts when no letter comes directly before or
 * after it, so "safety" and "cleaning" pass and "clean-up" and "Safe." are caught. Matching is
 * case-insensitive, and any run of whitespace (a line break included) inside "will flood" matches.
 */

export const BANNED_WORDS = [
  'contaminated',
  'unsafe',
  'safe',
  'safer',
  'safest',
  'clean',
  'cleaner',
  'cleanest',
  'will flood',
] as const;

export type BannedWord = (typeof BANNED_WORDS)[number];

/** Thrown when something would break an honesty rule: a finding with no source, a source that is
 * not registered, or text with a banned word. The caller must not catch it and carry on. */
export class HonestyError extends Error {
  readonly reasons: readonly string[];

  constructor(reasons: string | readonly string[]) {
    const list = typeof reasons === 'string' ? [reasons] : [...reasons];
    super(list.join('; '));
    this.name = 'HonestyError';
    this.reasons = list;
  }
}

const PATTERNS: ReadonlyMap<BannedWord, RegExp> = new Map(
  BANNED_WORDS.map((word) => {
    const body = word.split(' ').join('\\s+');
    // \p{L}: any letter in any script, so an accented letter next to the word also blocks a match.
    return [word, new RegExp(`(?<!\\p{L})${body}(?!\\p{L})`, 'u')];
  }),
);

/** The banned words found in `text`, each once, in the order of `BANNED_WORDS`. Empty means the
 * text is allowed. */
export function findBannedWords(text: string): BannedWord[] {
  const lower = text.toLowerCase();
  return BANNED_WORDS.filter((word) => (PATTERNS.get(word) as RegExp).test(lower));
}
