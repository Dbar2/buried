/**
 * The sentence check (spec 05 design "Sentence check", product rule 10).
 *
 * A sentence is built from facts. Its pack lists exactly the numbers, ids and verbatim strings it was
 * built from, and `checkSentence` compares the rendered text with the pack:
 *
 *  1. no banned word anywhere, verbatim strings included (a verbatim string with a banned word
 *     fails: the caller must not quote it);
 *  2. every snake_case id in the text is in `pack.ids`;
 *  3. every other number in the text is in `pack.numbers`, as the exact string.
 *
 * Verbatim strings (a quoted use, a URL) are removed before steps 2 and 3, because their digits
 * belong to the source's own wording, not to Buried's claims.
 */
import { findBannedWords } from './text';

export type SentencePack = {
  /** Exact numeric strings, as they appear in the text ("1911", "4.0", "10"). */
  numbers: readonly string[];
  /** Source and feature ids. */
  ids: readonly string[];
  /** Strings copied from a source or a URL, quoted as they are. */
  verbatim: readonly string[];
};

export const EMPTY_PACK: SentencePack = { numbers: [], ids: [], verbatim: [] };

export type SentenceCheck = { ok: true } | { ok: false; reasons: string[] };

const ID_TOKEN = /[a-z][a-z0-9]*(?:_[a-z0-9]+)+/g;
const NUMBER_TOKEN = /\d+(?:\.\d+)?/g;

export function checkSentence(text: string, pack: SentencePack): SentenceCheck {
  const reasons: string[] = [];

  const banned = findBannedWords(text);
  if (banned.length > 0) reasons.push(`banned word: ${banned.join(', ')}`);

  let working = text;
  for (const quoted of [...pack.verbatim].sort((a, b) => b.length - a.length)) {
    if (quoted === '') continue;
    const inner = findBannedWords(quoted);
    if (inner.length > 0) reasons.push(`a quoted string contains a banned word: ${inner.join(', ')}`);
    working = working.split(quoted).join(' ');
  }

  const ids = new Set(pack.ids);
  working = working.replace(ID_TOKEN, (token) => {
    if (!ids.has(token)) reasons.push(`id not in the fact pack: ${token}`);
    return ' ';
  });

  const numbers = new Set(pack.numbers);
  for (const token of working.match(NUMBER_TOKEN) ?? []) {
    if (!numbers.has(token)) reasons.push(`number not in the fact pack: ${token}`);
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons: [...new Set(reasons)] };
}
