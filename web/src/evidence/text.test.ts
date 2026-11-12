import { describe, expect, it } from 'vitest';
import { BANNED_WORDS, HonestyError, findBannedWords } from './text';

describe('BANNED_WORDS (requirement 14.4)', () => {
  it('lists the words and inflections from product.md rule 1, and nothing else', () => {
    expect([...BANNED_WORDS]).toEqual([
      'contaminated',
      'unsafe',
      'safe',
      'safer',
      'safest',
      'clean',
      'cleaner',
      'cleanest',
      'will flood',
    ]);
  });
});

describe('findBannedWords', () => {
  it('finds each banned word on its own', () => {
    for (const word of BANNED_WORDS) {
      expect(findBannedWords(word)).toEqual([word]);
      expect(findBannedWords(`The site is ${word}.`)).toEqual([word]);
    }
  });

  it('finds the inflections "safer", "safest", "cleaner" and "cleanest" as themselves', () => {
    expect(findBannedWords('a safer place')).toEqual(['safer']);
    expect(findBannedWords('the safest')).toEqual(['safest']);
    expect(findBannedWords('cleaner than')).toEqual(['cleaner']);
    expect(findBannedWords('the cleanest')).toEqual(['cleanest']);
  });

  it('is case-insensitive', () => {
    expect(findBannedWords('SAFE')).toEqual(['safe']);
    expect(findBannedWords('Contaminated Land')).toEqual(['contaminated']);
    expect(findBannedWords('uNsAfE')).toEqual(['unsafe']);
    expect(findBannedWords('It WILL FLOOD.')).toEqual(['will flood']);
  });

  it('allows words that only contain a banned word ("safety", "cleaning")', () => {
    for (const text of [
      'safety',
      'Safety first',
      'cleaning',
      'Cleanview',
      'safeguard',
      'safely',
      'decontaminated',
      'cleanse',
      'unclean',
      'uncleaner',
      'will flooding',
      'flood will',
      'willflood',
    ]) {
      expect(findBannedWords(text), text).toEqual([]);
    }
  });

  it('catches a banned word next to punctuation, hyphens, digits and line breaks', () => {
    expect(findBannedWords('clean-up')).toEqual(['clean']);
    expect(findBannedWords('(safe)')).toEqual(['safe']);
    expect(findBannedWords('safe,clean')).toEqual(['safe', 'clean']);
    expect(findBannedWords('safe2go')).toEqual(['safe']);
    expect(findBannedWords('line one\nsafe\nline three')).toEqual(['safe']);
    expect(findBannedWords('"clean."')).toEqual(['clean']);
  });

  it('matches any run of whitespace inside "will flood"', () => {
    expect(findBannedWords('will   flood')).toEqual(['will flood']);
    expect(findBannedWords('will\nflood')).toEqual(['will flood']);
    expect(findBannedWords('will\t \r\nflood')).toEqual(['will flood']);
    expect(findBannedWords('will\u00a0flood')).toEqual(['will flood']);
  });

  it('does not let a letter from another script hide a banned word next to it', () => {
    expect(findBannedWords('safé')).toEqual([]);
    expect(findBannedWords('éclean')).toEqual([]);
    expect(findBannedWords('é clean é')).toEqual(['clean']);
  });

  it('returns each word once, in the order of BANNED_WORDS', () => {
    expect(findBannedWords('clean, safe, safe, unsafe, clean')).toEqual(['unsafe', 'safe', 'clean']);
  });

  it('returns nothing for empty text and for ordinary report sentences', () => {
    expect(findBannedWords('')).toEqual([]);
    expect(findBannedWords('Built by 1914. Positioned within about 4.5 m.')).toEqual([]);
    expect(findBannedWords('Request locates through Ontario Dig Authority before you dig.')).toEqual([]);
  });
});

describe('HonestyError', () => {
  it('keeps its reasons', () => {
    const e = new HonestyError(['no source', 'banned word']);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('HonestyError');
    expect(e.reasons).toEqual(['no source', 'banned word']);
    expect(e.message).toBe('no source; banned word');
    expect(new HonestyError('one reason').reasons).toEqual(['one reason']);
  });
});
