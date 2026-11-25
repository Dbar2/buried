import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from './text';
import { INDUSTRIAL_ENTRIES, industrialMatch } from './industrialUse';

describe('the Industrial list', () => {
  it('is lowercase, sorted, unique, single-spaced and has no banned word', () => {
    expect([...INDUSTRIAL_ENTRIES]).toEqual([...INDUSTRIAL_ENTRIES].sort());
    expect(new Set(INDUSTRIAL_ENTRIES).size).toBe(INDUSTRIAL_ENTRIES.length);
    for (const entry of INDUSTRIAL_ENTRIES) {
      expect(entry).toBe(entry.toLowerCase());
      expect(entry).toBe(entry.trim().replace(/\s+/g, ' '));
      expect(findBannedWords(entry)).toEqual([]);
    }
  });

  it('matches the lettering on the committed plans', () => {
    expect(industrialMatch('Coal & Wood Yard')).toBe('coal');
    expect(industrialMatch('Lumber Piles; R. Laidlaw & Co. Ltd.')).toBe('lumber');
    expect(industrialMatch('Knitting Mill; Joseph Simpson & Sons')).toBe('mill');
    expect(industrialMatch('Machine Shop')).toBe('machine shop');
    expect(industrialMatch('Overall Factory')).toBe('factory');
    // The 1931-35 plan's abbreviation, added on the maintainer's decision (session 052).
    expect(industrialMatch('Glove & Overall Fac.')).toBe('fac');
    expect(industrialMatch('Cork Fac.')).toBe('cork');
  });

  it('does not match a word outside the list', () => {
    expect(industrialMatch('Department of Street Cleaning, Eastern Division, City of Toronto')).toBeNull();
    expect(industrialMatch('Dwelling')).toBeNull();
    expect(industrialMatch('Millinery')).toBeNull();
    expect(industrialMatch('Oilcloth store')).toBeNull();
    expect(industrialMatch('Coals')).toBeNull();
    expect(industrialMatch('Facade')).toBeNull();
    expect(industrialMatch('Fact')).toBeNull();
  });

  // P2: a string with no entry at word boundaries gives null; one with an entry does not.
  const filler = fc.stringMatching(/^[a-z ]{0,20}$/);
  it('P2: no entry at word boundaries gives null', () => {
    fc.assert(
      fc.property(filler, (text) => {
        const hasEntry = INDUSTRIAL_ENTRIES.some((e) => ` ${text.replace(/\s+/g, ' ').trim()} `.includes(` ${e} `));
        expect(industrialMatch(text) === null).toBe(!hasEntry);
      }),
      { numRuns: 400 },
    );
  });

  it('P2: an entry between non-letters is always found, in any case', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...INDUSTRIAL_ENTRIES),
        fc.stringMatching(/^[0-9 ,.;&()-]{0,6}$/),
        fc.stringMatching(/^[0-9 ,.;&()-]{0,6}$/),
        fc.boolean(),
        (entry, before, after, upper) => {
          const text = `${before}${upper ? entry.toUpperCase() : entry}${after}`;
          expect(industrialMatch(text)).not.toBeNull();
        },
      ),
    );
  });

  it('does not match an entry glued to letters', () => {
    fc.assert(
      fc.property(fc.constantFrom(...INDUSTRIAL_ENTRIES), fc.constantFrom('x', 's', 'e'), (entry, letter) => {
        const glued = `${entry.split(' ')[0]}${letter}`;
        const text = entry.includes(' ') ? `${glued} ${entry.split(' ').slice(1).join(' ')}` : glued;
        const found = industrialMatch(text);
        // A glued word may still hold another list entry (for example "wood yard"); it must not be this one at that spot.
        if (found !== null) expect(INDUSTRIAL_ENTRIES).toContain(found);
        if (!entry.includes(' ')) expect(found).not.toBe(entry);
      }),
    );
  });
});
