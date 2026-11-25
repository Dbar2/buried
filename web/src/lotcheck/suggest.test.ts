import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { addressBook, defaultSuggestions, matchesTokens, randomRecorded, suggest, wordsOf } from './suggest';
import type { AddressBook, AddressEntry } from './suggest';

const entry = (text: string, i: number): AddressEntry => ({ id: `a${String(i).padStart(4, '0')}`, text, point: [i, i] });

function book(texts: readonly string[], recordedOn: Record<string, string> = {}): AddressBook {
  return { entries: texts.map(entry), recorded: new Map(Object.entries(recordedOn)) };
}

const PERCY = ['2 Percy St', '2A Percy St', '2B Percy St', '2C Percy St', '2D Percy St', '24 Percy St', '52 King St E', '549 King St E', '37 Sumach St', '30 St Lawrence St'];
const RECORDED = { '2A Percy St': 'lot_1', '2B Percy St': 'lot_1', '549 King St E': 'lot_2', '37 Sumach St': 'lot_3' };

describe('suggest: matching', () => {
  const b = book(PERCY, RECORDED);
  const texts = (q: string) => suggest(b, q).map((s) => s.text);

  it('"2a p" finds 2A Percy St', () => {
    expect(texts('2a p')).toEqual(['2A Percy St']);
  });
  it('"percy" finds every Percy address, recorded ones first', () => {
    expect(texts('percy')).toEqual(['2A Percy St', '2B Percy St', '2 Percy St', '2C Percy St', '2D Percy St', '24 Percy St']);
  });
  it('"king 52" finds 52 King St E and not 549 King St E', () => {
    expect(texts('king 52')).toEqual(['52 King St E']);
    expect(texts('king 5')).toEqual(['549 King St E', '52 King St E']);
  });
  it('a house number matches the start of the number only, a street word the start of a word only', () => {
    expect(texts('54')).toEqual(['549 King St E']);
    expect(texts('4')).toEqual([]);
    expect(texts('ercy')).toEqual([]);
    expect(texts('lawrence')).toEqual(['30 St Lawrence St']);
  });
  it('an exact address comes before the longer ones, and a recorded address before an unrecorded exact one', () => {
    expect(suggest(book(['2 Percy St', '2 Percy St East']), '2 percy st')[0]?.text).toBe('2 Percy St');
    expect(suggest(book(['2 Percy St', '2A Percy St'], { '2A Percy St': 'l' }), '2 percy')[0]?.text).toBe('2A Percy St');
  });
  it('gives nothing for an empty or blank query, and at most seven', () => {
    expect(suggest(b, '')).toEqual([]);
    expect(suggest(b, '   ')).toEqual([]);
    const many = book(Array.from({ length: 30 }, (_, i) => `${i + 1} Main St`));
    expect(suggest(many, 'main')).toHaveLength(7);
  });
  it('marks recorded addresses with their lot', () => {
    const [first] = suggest(b, '2a p');
    expect(first).toMatchObject({ recorded: true, lotId: 'lot_1' });
    expect(suggest(b, '24 p')[0]).toMatchObject({ recorded: false, lotId: null });
  });
});

describe('suggest: the default list and the random pick', () => {
  const b = book(PERCY, RECORDED);
  it('lists one address per recorded lot, in text order, at most eight', () => {
    expect(defaultSuggestions(b).map((s) => s.text)).toEqual(['2A Percy St', '37 Sumach St', '549 King St E']);
    const many = book(Array.from({ length: 20 }, (_, i) => `${i + 1} Main St`), Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`${i + 1} Main St`, `lot_${i}`])));
    expect(defaultSuggestions(many)).toHaveLength(8);
  });
  it('picks only a recorded lot, and nothing when none is recorded', () => {
    expect(randomRecorded(b, () => 0)?.text).toBe('2A Percy St');
    expect(randomRecorded(b, () => 0.999999)?.text).toBe('549 King St E');
    expect(randomRecorded(book(PERCY), () => 0.5)).toBeNull();
  });
});

describe('P7: suggestions', () => {
  const streetWord = fc.constantFrom('Percy', 'King', 'Sumach', 'Lawrence', 'Eastern', 'Mill', 'Cherry', 'Trinity');
  const address = fc
    .tuple(fc.integer({ min: 1, max: 999 }), fc.constantFrom('', 'A', 'B', 'C', 'D'), streetWord, fc.constantFrom('St', 'Ave', 'St E'))
    .map(([n, unit, street, kind]) => `${n}${unit} ${street} ${kind}`);
  const world = fc.uniqueArray(address, { minLength: 1, maxLength: 60 }).chain((texts) =>
    fc.tuple(fc.constant(texts), fc.subarray(texts), fc.array(fc.nat({ max: 5 }), { minLength: 0, maxLength: 3 })),
  );
  // A query is cut from an address: a prefix of its number and the first letters of a street word.
  const queryFor = (texts: string[]) =>
    fc.tuple(fc.constantFrom(...texts), fc.nat({ max: 3 }), fc.nat({ max: 6 }), fc.boolean(), fc.boolean()).map(([t, nChars, wChars, useNumber, useStreet]) => {
      const [number = '', street = ''] = t.split(' ');
      const parts = [useNumber ? number.slice(0, Math.max(1, nChars)) : '', useStreet ? street.slice(0, Math.max(1, wChars)) : ''].filter((p) => p !== '');
      return parts.join(' ');
    }).filter((q) => q !== '');

  // An independent statement of the matching rule: a regular expression per token.
  const oracle = (text: string, query: string): boolean =>
    query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t !== '')
      .every((t) => (/^\d/.test(t) ? new RegExp(`^${t}`).test(text.toLowerCase()) : new RegExp(`^\\d\\S*\\s(?:.*\\s)?${t}`).test(text.toLowerCase())));

  it('every suggestion matches every token, no unrecorded address is above a recorded one, at most seven', () => {
    fc.assert(
      fc.property(
        world.chain(([texts, recorded]) => fc.tuple(fc.constant(texts), fc.constant(recorded), queryFor(texts))),
        ([texts, recorded, query]) => {
          const b = book(texts, Object.fromEntries(recorded.map((t) => [t, `lot_${t}`])));
          const out = suggest(b, query);
          expect(out.length).toBeLessThanOrEqual(7);
          for (const s of out) {
            expect(matchesTokens(s.text, wordsOf(query))).toBe(true);
            expect(oracle(s.text, query)).toBe(true);
          }
          const flags = out.map((s) => s.recorded);
          expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a)));
          // Nothing that matches is left out for an unrecorded one: when the list is not full, every match is in it.
          if (out.length < 7) expect(texts.filter((t) => oracle(t, query)).sort()).toEqual(out.map((s) => s.text).sort());
        },
      ),
      { numRuns: 200 },
    );
  });
});
