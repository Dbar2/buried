import { describe, expect, it } from 'vitest';
import { checkSentence, findBannedWords } from '../evidence';
import type { Source, SourceRegistry } from '../evidence';
import { addressHeading, coverageLine, summarySentences } from './placeText';

const plan = (id: string, from: number, to: number, type = 'fire_insurance_plan'): Source =>
  ({ id, type, year_from: from, year_to: to, attribution_status: 'confirmed' }) as unknown as Source;
const P1911 = plan('fip_v3_1911_229', 1911, 1914);
const P1911b = plan('fip_v3_1911_232', 1911, 1914);
const P1935 = plan('fip_v3_1935_229', 1931, 1935);
const PHOTO = plan('aerial_1947_s0012_fl1947_it0018h', 1947, 1947, 'aerial_photograph');

const passes = (s: { text: string; pack: Parameters<typeof checkSentence>[1] }) => {
  expect(checkSentence(s.text, s.pack), s.text).toEqual({ ok: true });
  expect(findBannedWords(s.text)).toEqual([]);
};

describe('addressHeading', () => {
  it('joins house numbers on one street', () => {
    expect(addressHeading(['543 Queen St E', '541 Queen St E']).text).toBe('541 and 543 Queen St E');
    expect(addressHeading(['541 Queen St E', '543 Queen St E', '545 Queen St E']).text).toBe('541, 543 and 545 Queen St E');
    expect(addressHeading(['9 Eastern Ave', '10 Eastern Ave']).text).toBe('9 and 10 Eastern Ave');
  });

  it('keeps streets apart, and one address as it is', () => {
    expect(addressHeading(['541 Queen St E']).text).toBe('541 Queen St E');
    expect(addressHeading(['12 Eastern Ave', '3 Booth Ave']).text).toBe('3 Booth Ave and 12 Eastern Ave');
  });

  it('shortens a long run of numbers', () => {
    const many = [1, 3, 5, 7, 9, 11].map((n) => `${n} King St`);
    expect(addressHeading(many).text).toBe('1, 3, 5, 7 and 2 more King St');
  });

  it('says "This lot" without an address, and every heading passes the sentence check', () => {
    expect(addressHeading([]).text).toBe('This lot');
    for (const list of [[], ['541 Queen St E'], ['541 Queen St E', '543 Queen St E'], ['12 Eastern Ave', '3 Booth Ave'], ['Rear of Queen St E']]) passes(addressHeading(list));
  });
});

describe('summarySentences', () => {
  it('names the plans by their years and counts the outlines near the lot', () => {
    const s = summarySentences({ covering: [P1911, P1911b, P1935], anyReviewed: true, aerials: [], outlines: [{ featureId: 'bld_x_0001', relation: { kind: 'near', withinM: 7 } }] });
    expect(s.map((x) => x.text)).toEqual(['Two fire insurance plans cover this lot: 1911 and 1931-35.', 'One building outline from these records sits near this lot (within 7 m).']);
    s.forEach(passes);
    expect(s[1]!.claims).toEqual([{ featureId: 'bld_x_0001', kind: 'near', withinM: 7 }]);
  });

  it('separates the outlines on the lot from those near it', () => {
    const s = summarySentences({
      covering: [P1911],
      anyReviewed: false,
      aerials: [],
      outlines: [
        { featureId: 'bld_x_0001', relation: { kind: 'on' } },
        { featureId: 'bld_x_0002', relation: { kind: 'near', withinM: 4 } },
        { featureId: 'bld_x_0003', relation: { kind: 'near', withinM: 9 } },
      ],
    });
    expect(s.map((x) => x.text)).toEqual([
      'One fire insurance plan covers this lot: 1911.',
      'One building outline from these records sits on this lot.',
      'Two more sit near this lot (within 9 m).',
    ]);
    s.forEach(passes);
    // "on this lot" only with on claims (property R2).
    expect(s[1]!.claims.every((c) => c.kind === 'on')).toBe(true);
    expect(s[2]!.claims.every((c) => c.kind === 'near')).toBe(true);
  });

  it('states no finding when nothing has been reviewed and nothing is drawn', () => {
    const s = summarySentences({ covering: [P1911, P1935], anyReviewed: false, aerials: [], outlines: [] });
    expect(s.map((x) => x.text)).toEqual(['Buried holds two plans that cover this lot.', 'Nothing on them has been reviewed here yet.']);
    s.forEach(passes);
  });

  it('says nothing is within the radius only where a person reviewed the area', () => {
    const s = summarySentences({ covering: [P1911], anyReviewed: true, aerials: [], outlines: [] });
    expect(s.map((x) => x.text)).toEqual(['One fire insurance plan covers this lot: 1911.', 'No building outline from these records sits within 10 m of this lot.']);
    s.forEach(passes);
  });

  it('adds a loaded photograph that covers the lot', () => {
    const s = summarySentences({ covering: [P1911], anyReviewed: false, aerials: [PHOTO], outlines: [] });
    expect(s.map((x) => x.text).at(-1)).toBe('The 1947 photograph also covers this lot.');
    s.forEach(passes);
  });

  it('has a plain line when no plan covers the lot', () => {
    expect(summarySentences({ covering: [], anyReviewed: false, aerials: [], outlines: [] }).map((x) => x.text)).toEqual(["No plan in Buried's published records covers this lot."]);
  });
});

describe('coverageLine', () => {
  const registry = { sources: [P1911, P1911b, P1935, PHOTO] } as unknown as SourceRegistry;

  it('names the plans Buried holds once each, and says coverage is one block of Toronto', () => {
    const s = coverageLine(registry);
    expect(s.map((x) => x.text)).toEqual(['Buried holds the 1911 plan and the 1931-35 plan for this area.', 'Coverage today is one block of Toronto.']);
    s.forEach(passes);
  });

  it('names a photograph only once a tile of it is loaded', () => {
    const tile = [{ source: PHOTO.id }] as never;
    expect(coverageLine(registry, tile)[0]!.text).toBe('Buried holds the 1911 plan, the 1931-35 plan and the 1947 photograph for this area.');
  });

  it('is empty without a registry', () => {
    expect(coverageLine(undefined)).toEqual([]);
  });
});
