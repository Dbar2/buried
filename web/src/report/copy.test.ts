import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from '../evidence';
import * as copy from './copy';

describe('fixed copy', () => {
  it('passes the banned-word check, string by string', () => {
    for (const text of copy.ALL_FIXED_COPY) expect(findBannedWords(text), text).toEqual([]);
  });

  it('holds no figure, no source id and none of the words the Report may not use', () => {
    for (const text of copy.ALL_FIXED_COPY) {
      expect(text, text).not.toMatch(/\d/);
      expect(text, text).not.toMatch(/Built in|±|exactly|guaranteed/i);
    }
  });

  it('has the lines the product rules fix, word for word', () => {
    expect(copy.SCREENS_LINE).toBe("Buried screens; it doesn't certify.");
    expect(copy.NOT_RECONSTRUCTED).toBe('Not reconstructed yet.');
    expect(copy.DIG_REQUEST).toBe('Request locates through Ontario Dig Authority before you dig.');
    expect(copy.ONTARIO_DIG_AUTHORITY_URL).toBe('https://ontariodigauthority.ca/');
  });

  it('does not guess the two City URLs: they are null until task 5.3 looks them up', () => {
    expect(copy.CITY_LAND_ACKNOWLEDGEMENT_URL).toBeNull();
    expect(copy.CITY_FLOOD_SUBSIDY_URL).toBeNull();
  });
});

describe('templates', () => {
  it('hold no digit, no "Built in", no "±", no "exactly" and no "guaranteed" in their fixed wording', () => {
    // The fixed text of every template is what lies between its slots. Read the source of the modules
    // that hold template literals and check the literal parts of each `sentence` template.
    const files = ['findings.ts', 'coreSample.ts', 'buildReport.ts'].map((f) => readFileSync(fileURLToPath(new URL(`./${f}`, import.meta.url)), 'utf8'));
    const templates: string[] = [];
    for (const source of files) {
      for (const match of source.matchAll(/sentence`((?:[^`\\]|\\.)*)`/g)) {
        templates.push((match[1] as string).replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '\u0000'));
      }
    }
    expect(templates.length).toBeGreaterThan(20);
    for (const text of templates) {
      const fixedParts = text.split('\u0000').join(' ');
      expect(fixedParts, fixedParts).not.toMatch(/\d/);
      expect(fixedParts, fixedParts).not.toMatch(/Built in|±|exactly|guaranteed/i);
      expect(findBannedWords(fixedParts), fixedParts).toEqual([]);
    }
  });
});
