/**
 * Properties P10 and P11 (spec 01 design "Correctness properties"; tests 8.2, 8.3 and 15.1).
 *
 * P10: every finding has a source and no banned word reaches one; banned words are always found.
 * P11: "Nothing found" lists every record and year range checked.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkedRecordsText,
  createFinding,
  createNotCovered,
  createNothingFound,
} from './findings';
import type { CheckedInput, Finding } from './findings';
import { indexSources } from './sources';
import { sourcesArb } from './testing/arbitraries';
import { AERIAL, P1911, P1935, showcaseSources } from './testing/fixtures';
import { BANNED_WORDS, HonestyError, findBannedWords } from './text';
import type { Visibility } from './dates';

// --- text generators ---------------------------------------------------------------------------

/** Words that are allowed. Several contain a banned word as a part ("safety", "cleaning"). */
const ALLOWED_WORDS = [
  'lot', 'plate', 'building', 'built', 'by', 'safety', 'cleaning', 'cleanse', 'Cleanview', 'safeguard',
  'safely', 'unclean', 'decontaminated', 'flooding', 'will', 'flood', 'records', 'checked', '1914', 'No',
] as const; // "will" and "flood" are allowed apart, and next to each other only with a letter between

const SEPARATORS = [' ', '  ', '\n', '\t', ', ', '. ', '-', ' - ', '(', ')', '; ', '"', '/', ' 12 '] as const;

const separatorArb = fc.constantFrom(...SEPARATORS);
const allowedWordArb = fc.constantFrom(...ALLOWED_WORDS);

/** Text of allowed words joined by non-letter separators, never "will" then "flood" apart only by
 * whitespace, which would be the banned phrase. */
const allowedTextArb: fc.Arbitrary<string> = fc
  .array(fc.tuple(allowedWordArb, separatorArb), { maxLength: 12 })
  .map((pairs) => pairs.map(([w, s]) => w + s).join(''))
  .filter((text) => findBannedWords(text).length === 0);

/** Random case for each letter. */
function mixCase(word: string, flips: readonly boolean[]): string {
  return [...word].map((ch, i) => (flips[i % flips.length] ? ch.toUpperCase() : ch.toLowerCase())).join('');
}

const bannedWordArb = fc.constantFrom(...BANNED_WORDS);

/** A banned word in random case, with a random whitespace run inside "will flood". */
const bannedFormArb: fc.Arbitrary<{ word: (typeof BANNED_WORDS)[number]; form: string }> = fc
  .tuple(
    bannedWordArb,
    fc.array(fc.boolean(), { minLength: 1, maxLength: 12 }),
    fc.constantFrom(' ', '  ', '\n', '\t', ' \n ', '\u00a0'),
  )
  .map(([word, flips, gap]) => ({ word, form: mixCase(word, flips).replace(' ', gap) }));

/** Allowed text with one banned word inserted between non-letters. */
const textWithBannedArb = fc
  .tuple(allowedTextArb, bannedFormArb, separatorArb, separatorArb, allowedTextArb)
  .map(([before, banned, left, right, after]) => ({
    banned: banned.word,
    text: `${before}${left}${banned.form}${right}${after}`,
  }));

// --- P10 --------------------------------------------------------------------------------------

const sources = showcaseSources();
const KNOWN = [P1911, P1935, AERIAL];
const UNKNOWN = ['fip_v3_1999_001', 'aerial_1947_zzz', 'present_toronto_nope_2026'];

const visibilityArb = fc.constantFrom<Visibility>('clear', 'obscured', 'not_covered');

const sourceIdListArb = fc.array(fc.constantFrom(...KNOWN, ...UNKNOWN), { maxLength: 4 });
const anyTextArb = fc.oneof(
  allowedTextArb,
  textWithBannedArb.map((t) => t.text),
  fc.string({ maxLength: 40 }),
);

function holdsFindingInvariants(f: Finding, text: string): void {
  expect(f.sourceIds.length).toBeGreaterThanOrEqual(1);
  for (const id of f.sourceIds) expect(sources.has(id)).toBe(true);
  expect(findBannedWords(text)).toEqual([]);
  expect(f.text).toBe(text);
}

describe('P10: every finding has a source; no banned word reaches a finding', () => {
  it('createFinding either throws HonestyError or returns a finding that meets the rules', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'documented' | 'estimated'>('documented', 'estimated'),
        anyTextArb,
        sourceIdListArb,
        (status, text, sourceIds) => {
          let finding: Finding | undefined;
          try {
            finding = createFinding({ status, text, sourceIds, relation: { kind: 'on' } }, sources);
          } catch (e) {
            expect(e).toBeInstanceOf(HonestyError);
          }
          const mustRefuse =
            sourceIds.length === 0 || sourceIds.some((id) => !sources.has(id)) || findBannedWords(text).length > 0;
          expect(finding === undefined).toBe(mustRefuse);
          if (finding) holdsFindingInvariants(finding, text);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('createNothingFound and createNotCovered do the same', () => {
    const checkedArb = fc.array(
      fc.record({ sourceId: fc.constantFrom(...KNOWN, ...UNKNOWN), visibility: visibilityArb }),
      { maxLength: 4 },
    );
    fc.assert(
      fc.property(
        fc.constantFrom('nothing_found', 'not_covered'),
        anyTextArb,
        checkedArb,
        (kind, text, checked) => {
          const make = kind === 'nothing_found' ? createNothingFound : createNotCovered;
          let finding: Finding | undefined;
          try {
            finding = make(text, checked, sources);
          } catch (e) {
            expect(e).toBeInstanceOf(HonestyError);
          }
          // The only other refusal is one source listed with two visibilities.
          const byId = new Map<string, Set<Visibility>>();
          for (const c of checked) byId.set(c.sourceId, (byId.get(c.sourceId) ?? new Set()).add(c.visibility));
          const mustRefuse =
            checked.length === 0 ||
            checked.some((c) => !sources.has(c.sourceId)) ||
            [...byId.values()].some((v) => v.size > 1) ||
            findBannedWords(text).length > 0;
          expect(finding === undefined).toBe(mustRefuse);
          if (finding) holdsFindingInvariants(finding, text);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('every banned word, in any case and with any surrounding non-letters, is found', () => {
    fc.assert(
      fc.property(textWithBannedArb, ({ banned, text }) => {
        expect(findBannedWords(text)).toContain(banned);
      }),
      { numRuns: 1000 },
    );
  });

  it('a finding with such text is always refused', () => {
    fc.assert(
      fc.property(textWithBannedArb, ({ text }) => {
        expect(() =>
          createFinding({ status: 'documented', text, sourceIds: [P1911], relation: { kind: 'on' } }, sources),
        ).toThrowError(HonestyError);
        expect(() => createNothingFound(text, [{ sourceId: P1911, visibility: 'clear' }], sources)).toThrowError(
          HonestyError,
        );
      }),
      { numRuns: 300 },
    );
  });

  it('text made only of allowed words, "safety" and "cleaning" among them, is never flagged', () => {
    fc.assert(
      fc.property(allowedTextArb, (text) => {
        expect(findBannedWords(text)).toEqual([]);
      }),
      { numRuns: 500 },
    );
  });

  it('includes the inflections "safer", "safest", "cleaner" and "cleanest" in the check', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('safer', 'safest', 'cleaner', 'cleanest'),
        fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
        allowedTextArb,
        separatorArb,
        (word, flips, rest, sep) => {
          expect(findBannedWords(`${rest}${sep}${mixCase(word, flips)}${sep}${rest}`)).toContain(word);
        },
      ),
    );
  });
});

// --- P11 --------------------------------------------------------------------------------------

describe('P11: "Nothing found" lists the records and years checked', () => {
  it('has one entry per source with that source\'s years and visibility, and the text names them', () => {
    fc.assert(
      fc.property(
        sourcesArb(2, 6).chain((list) =>
          fc.tuple(
            fc.constant(list),
            fc.subarray(list, { minLength: 1 }).chain((chosen) =>
              fc
                .array(visibilityArb, { minLength: chosen.length, maxLength: chosen.length })
                .map((vis) => chosen.map((s, i): CheckedInput => ({ sourceId: s.id, visibility: vis[i] as Visibility }))),
            ),
            fc.boolean(),
          ),
        ),
        ([list, checked, notCovered]) => {
          const index = indexSources({ schema_version: '1.1.0', sources: list });
          const make = notCovered ? createNotCovered : createNothingFound;
          const finding = make('Nothing is drawn in the records checked.', checked, index);
          if (!('checked' in finding)) throw new Error('expected a checked finding');

          expect(finding.checked).toHaveLength(checked.length);
          for (const c of checked) {
            const source = index.get(c.sourceId);
            const entry = finding.checked.find((r) => r.sourceId === c.sourceId);
            expect(entry).toEqual({
              sourceId: c.sourceId,
              yearFrom: source?.year_from,
              yearTo: source?.year_to,
              visibility: c.visibility,
            });
          }
          expect(finding.sourceIds).toEqual(checked.map((c) => c.sourceId).sort());

          const lines = checkedRecordsText(finding);
          expect(lines).toHaveLength(checked.length);
          const text = lines.join('\n');
          for (const r of finding.checked) {
            expect(text).toContain(r.sourceId);
            expect(text).toContain(r.yearFrom === r.yearTo ? String(r.yearFrom) : `${r.yearFrom}–${r.yearTo}`);
            expect(text).toContain(r.visibility);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('takes the years from the registry, never from the caller', () => {
    // CheckedInput has no year fields; extra fields a caller sneaks in are ignored.
    const sneaky = [{ sourceId: P1911, visibility: 'clear', yearFrom: 1800, yearTo: 2030 }] as unknown as CheckedInput[];
    const f = createNothingFound('Nothing.', sneaky, sources);
    if (!('checked' in f)) throw new Error('expected a checked finding');
    expect(f.checked[0]).toEqual({ sourceId: P1911, yearFrom: 1911, yearTo: 1914, visibility: 'clear' });
  });
});
