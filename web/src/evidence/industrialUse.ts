/**
 * The Industrial list (product.md rule 13, spec 08 requirement 4.1): the one reviewed list of words
 * and phrases that make a lettered use "industrial". Code decides, from the lettering, by this list
 * alone. A word outside it never triggers the tag, and the list is matched whole-word only, so
 * "oilcloth" does not match "oil" and a plural matches only if it is listed.
 *
 * Reviewed by: not yet. The maintainer fills this line in. The builder adds no entry on its own; proposals go
 * in the session notes. `fac` was added on the maintainer's decision (session 052): the 1931-35 plan letters
 * "Glove & Overall Fac.", the surveyors' abbreviation of factory.
 *
 * Reads use strings only (the lettering of a building or an area), never street names.
 */

/** Lowercase, sorted, unique. A phrase is single-spaced. */
export const INDUSTRIAL_ENTRIES: readonly string[] = [
  'auto',
  'coal',
  'cork',
  'dye',
  'fac',
  'factory',
  'foundry',
  'garage',
  'gas',
  'laundry',
  'lumber',
  'machine shop',
  'mill',
  'oil',
  'paint',
  'storage of fuel',
  'tannery',
  'wood yard',
  'works',
];

/** Lowercase, and turn each run of non-letters into one space; the result has no leading or trailing space. */
export function normaliseForMatch(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}]+/gu, ' ').trim();
}

/**
 * The first list entry found in `text` at word boundaries, or `null`. "First" is the entry that
 * starts earliest in the text; for entries that start together the longer one.
 */
export function industrialMatch(text: string): string | null {
  const padded = ` ${normaliseForMatch(text)} `;
  let best: { entry: string; at: number } | null = null;
  for (const entry of INDUSTRIAL_ENTRIES) {
    const at = padded.indexOf(` ${entry} `);
    if (at < 0) continue;
    if (best === null || at < best.at || (at === best.at && entry.length > best.entry.length)) best = { entry, at };
  }
  return best === null ? null : best.entry;
}
