import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Reading } from './finds.types.generated';
import {
  findPositionLine,
  ghostTitle,
  kickerText,
  LETTERING_IN_CROP,
  letteredLines,
  NO_RECORD_LOADED,
  rulerLine,
  seenOnText,
  sheetNumber,
} from './findText';
import type { PlanSource } from './findText';
import { findBannedWords } from './text';

const P1911: PlanSource = { id: 'fip_v3_1911_229', type: 'fire_insurance_plan', year_from: 1911, year_to: 1914 };
const P1935: PlanSource = { id: 'fip_v3_1935_229', type: 'fire_insurance_plan', year_from: 1931, year_to: 1935 };

const reading = (source: string, lettered: [string, ...string[]]): Reading => ({
  source,
  feature_id: `bld_${source}_0001`,
  lettered,
  crop_px: { x: 1, y: 1, width: 10, height: 10 },
  read_by: 'A. Reader',
  read_on: '2026-11-13',
});

describe('kicker, seen on, position', () => {
  it('words the kicker from the plan', () => {
    expect(kickerText(P1911, 'lettered')).toBe('LETTERED ON THE 1911 PLAN');
    expect(kickerText(P1935, 'lettered')).toBe('LETTERED ON THE 1931-35 PLAN');
    expect(kickerText(P1911, 'drawn')).toBe('DRAWN ON THE 1911 PLAN');
  });

  it('words "Seen on" with the sheet number', () => {
    expect(seenOnText(P1911)).toBe('Seen on: 1911 plan, sheet 229');
    expect(seenOnText(P1935)).toBe('Seen on: 1931-35 plan, sheet 229');
    expect(seenOnText({ id: 'aerial_1947_s0012_fl1947_it0018h', type: 'aerial_photograph', year_from: 1947, year_to: 1947 })).toBe('Seen on: 1947 photograph');
    expect(sheetNumber('fip_v3_1935_232')).toBe('232');
    expect(sheetNumber('present_toronto_intersections_2026')).toBeNull();
  });

  it('words the position through the one function that words it', () => {
    expect(findPositionLine(4.5)).toBe('Positioned within about 4.5 m');
    expect(() => findPositionLine(0)).toThrow(RangeError);
  });
});

describe('letteredLines (requirement 4.3)', () => {
  it('quotes lines as lettered', () => {
    expect(letteredLines(['Glove & Overall Factory', 'Hamilton Carhartt Mfr. Ltd.'])).toEqual(['Glove & Overall Factory', 'Hamilton Carhartt Mfr. Ltd.']);
  });

  it('does not quote a line with a banned word, and says so once', () => {
    expect(letteredLines(['Clean Linen Laundry'])).toEqual([LETTERING_IN_CROP]);
    expect(letteredLines(['Safe Deposit', 'Bank', 'Unsafe Walls'])).toEqual([LETTERING_IN_CROP, 'Bank']);
    expect(letteredLines(['Safety Works'])).toEqual(['Safety Works']);
  });

  it('never returns a banned word, for any lettering', () => {
    const banned = fc.constantFrom('clean', 'Safe', 'UNSAFE', 'contaminated', 'will  flood', 'cleanest');
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.string(), banned, fc.string()).map(([a, b, c]) => `${a} ${b} ${c}`), { minLength: 1 }), (lines) => {
        for (const line of letteredLines(lines)) expect(findBannedWords(line)).toEqual([]);
      }),
    );
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1 }), { minLength: 1 }), (lines) => {
        for (const line of letteredLines(lines)) expect(findBannedWords(line)).toEqual([]);
      }),
    );
  });
});

describe('ghostTitle (requirement 4.5)', () => {
  it('names storeys 1 to 6 in words', () => {
    const words = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'];
    for (let n = 1; n <= 6; n += 1) expect(ghostTitle({ kind: 'building', storeys: n, source: P1911 })).toBe(`${words[n - 1]}-storey building`);
  });

  it('falls back to the plan when storeys are not read or out of range', () => {
    expect(ghostTitle({ kind: 'building', storeys: undefined, source: P1911 })).toBe('Building on the 1911 plan');
    expect(ghostTitle({ kind: 'building', storeys: 7, source: P1935 })).toBe('Building on the 1931-35 plan');
    expect(ghostTitle({ kind: 'building', storeys: 0, source: P1911 })).toBe('Building on the 1911 plan');
    expect(ghostTitle({ kind: 'land_use', storeys: 2, source: P1911 })).toBe('Area on the 1911 plan');
  });
});

describe('rulerLine (requirement 5.3)', () => {
  const r1911 = reading(P1911.id, ['Glove & Overall Factory']);
  const r1935 = reading(P1935.id, ['Glove & Overall Fac.']);
  const base = { noun: 'factory', readings: [r1911, r1935], primary: r1911 };

  it('quotes the reading of the era', () => {
    expect(rulerLine({ ...base, eraSources: [P1935] })).toBe('On the 1931-35 plan this factory is lettered “Glove & Overall Fac.”.');
  });

  it('adds nothing for the reading the card opened on', () => {
    expect(rulerLine({ ...base, eraSources: [P1911] })).toBeNull();
  });

  it('says no lettering was recorded when the plan is loaded without a reading', () => {
    expect(rulerLine({ ...base, readings: [r1911], eraSources: [P1935] })).toBe('No lettering recorded here from the 1931-35 plan.');
  });

  it('says no record is loaded when the era has no plan loaded', () => {
    expect(rulerLine({ ...base, eraSources: [] })).toBe(NO_RECORD_LOADED);
  });

  it('adds nothing for an era with no plan at all (Today)', () => {
    expect(rulerLine({ ...base, eraSources: null })).toBeNull();
  });

  it('does not quote lettering with a banned word', () => {
    const line = rulerLine({ ...base, readings: [r1911, reading(P1935.id, ['Clean Linen'])], eraSources: [P1935] });
    expect(line).not.toBeNull();
    expect(findBannedWords(line as string)).toEqual([]);
    expect(line).not.toContain('Clean Linen');
  });
});
