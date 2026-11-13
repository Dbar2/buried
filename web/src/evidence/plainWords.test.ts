import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from './text';
import { originPhrase, plainSourceName, plainSourceNumbers, plainYears, provenanceFacts } from './plainWords';
import type { Feature } from './types.generated';

const plan1911 = { id: 'fip_v3_1911_229', type: 'fire_insurance_plan', year_from: 1911, year_to: 1914 } as const;
const plan1935 = { id: 'fip_v3_1935_232', type: 'fire_insurance_plan', year_from: 1931, year_to: 1935 } as const;
const photo1947 = { id: 'aerial_1947_s0012_fl1947_it0018h', type: 'aerial_photograph', year_from: 1947, year_to: 1947 } as const;

describe('plain source names', () => {
  it('says "the 1911 plan", "the 1931-35 plan" and "the 1947 photograph"', () => {
    expect(plainSourceName(plan1911)).toBe('the 1911 plan');
    expect(plainSourceName(plan1935)).toBe('the 1931-35 plan');
    expect(plainSourceName(photo1947)).toBe('the 1947 photograph');
  });

  it('never carries an id or a plate number', () => {
    for (const s of [plan1911, plan1935, photo1947]) {
      expect(plainSourceName(s)).not.toMatch(/_|229|232|fip|aerial/);
    }
  });

  it('lists exactly the numbers it prints', () => {
    expect(plainSourceNumbers(plan1935)).toEqual(['1931', '35']);
    expect(plainSourceNumbers(plan1911)).toEqual(['1911']);
    fc.assert(
      fc.property(fc.integer({ min: 1800, max: 2030 }), fc.integer({ min: 0, max: 9 }), (from, span) => {
        const s = { id: 'other_x', type: 'historical_map', year_from: from, year_to: from + span } as const;
        const printed = plainSourceName(s).match(/\d+/g) ?? [];
        expect(plainSourceNumbers(s)).toEqual(printed);
        expect(findBannedWords(plainSourceName(s))).toEqual([]);
      }),
    );
  });

  it('names a source with no start year by its end year', () => {
    expect(plainYears({ id: 'x', year_from: null, year_to: 1900 })).toBe('1900');
  });
});

const feature = (confidence: 'documented' | 'estimated' | 'unknown', extraction: boolean): Pick<Feature, 'properties'> =>
  ({ properties: { confidence, provenance: extraction ? { extraction_params_id: 'v1' } : {} } }) as unknown as Pick<Feature, 'properties'>;

describe('how a feature came to be', () => {
  it('reads the automatic fact from provenance and says nothing about who checked it', () => {
    expect(provenanceFacts(feature('estimated', true))).toEqual({ tracedAutomatically: true });
    // Confidence says how the footprint was read; it never changes the facts.
    expect(provenanceFacts(feature('documented', false))).toEqual({ tracedAutomatically: false });
    expect(provenanceFacts(feature('unknown', false))).toEqual({ tracedAutomatically: false });
  });

  it('words the origin plainly', () => {
    expect(originPhrase({ tracedAutomatically: true })).toBe('traced automatically from');
    expect(originPhrase({ tracedAutomatically: false })).toBe('read from');
  });
});
