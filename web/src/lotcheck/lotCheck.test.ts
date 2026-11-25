import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { findBannedWords, indexSources, industrialMatch, INDUSTRIAL_ENTRIES } from '../evidence';
import type { Feature, FeatureCollection } from '../evidence';
import { buildReport } from '../report/buildReport';
import { addressesLayer, E0, FAR_LOT_ID, inputs, LOT_GEOMETRY, LOT_ID, makeFeature, mappedOnly, N0, obs, P1911, P1935, plateCollection, registry } from '../report/testing/fixtures';
import * as copy from './copy';
import { allSentences, buildLotCheck } from './lotCheck';
import type { LotCheck } from './lotCheck';

type Checked = Extract<LotCheck, { kind: 'check' }>;

const COAL_1911 = 'Coal & Wood Yard; J. W. Corson & Co. (as lettered on the plate)';
const COAL_1935 = 'Coal & Wood Yard; Northern Fuels Co. (as lettered on the plate)';

function useFeature(origin: string, use: string | undefined, at: [number, number], seq = 1, errorM = 4.5, size: [number, number] = [10, 10], kind: 'land_use' | 'building' = 'land_use'): Feature {
  const f = makeFeature(origin, [obs(origin, true, 'clear', 'origin')], { seq, kind, at, size, positionErrorM: errorM });
  f.properties.attributes = use === undefined ? {} : { use };
  return f;
}

function run(collections: FeatureCollection[], lotId = LOT_ID) {
  const model = buildReport(inputs(collections, { lotId }));
  const result = buildLotCheck(model, {
    lot: LOT_GEOMETRY,
    collections,
    tiles: [],
    sources: indexSources(registry()),
    siteOrigin: 'https://buried.example',
  });
  return { model, result };
}

const checked = (r: LotCheck): Checked => {
  expect(r.kind).toBe('check');
  return r as Checked;
};

describe('buildLotCheck: the tag', () => {
  it('a coal yard on the lot on both plans: "Past industrial use recorded", quoting the plans and the lettering', () => {
    const { result } = run([
      plateCollection(P1911, [useFeature(P1911, COAL_1911, [E0 + 2, N0 + 2])]),
      plateCollection(P1935, [useFeature(P1935, COAL_1935, [E0 + 2, N0 + 2])]),
    ]);
    const c = checked(result);
    expect(c.verdict.tag).toBe('past_industrial');
    expect(c.verdict.tagText).toBe('Past industrial use recorded');
    expect(c.verdict.sentences.map((s) => s.text)).toEqual(['The 1911 and 1931-35 plans letter this lot “Coal & Wood Yard”.']);
    expect(c.verdict.triggers.map((t) => [t.sourceId, t.matched, t.relation.kind])).toEqual([
      [P1911, 'coal', 'on'],
      [P1935, 'coal', 'on'],
    ]);
    expect(c.verdict.notClearance).toBeNull();
    expect(c.rows.map((r) => r.yearLabel)).toEqual(['1911', '1931-35', 'Today']);
    const first = c.rows[0] as Extract<Checked['rows'][number], { kind: 'plan' }>;
    expect(first.lines[0]?.text.text).toBe('Coal & Wood Yard, J. W. Corson & Co.');
    expect(first.lines[0]?.relationText.text).toBe('On this lot');
  });

  it('a yard beside the lot: "Industrial use recorded next to this lot", with within X m', () => {
    const { result } = run([plateCollection(P1911, [useFeature(P1911, 'Coal Shed (as lettered on the plate)', [E0 + 40, N0 + 2])])]);
    const c = checked(result);
    expect(c.verdict.tag).toBe('industrial_next');
    const t = c.verdict.triggers[0]!;
    expect(t.relation.kind).toBe('near');
    const within = (t.relation as { withinM: number }).withinM;
    expect(c.verdict.sentences[0]?.text).toBe(`The 1911 plan letters “Coal Shed” near this lot (within ${within} m).`);
  });

  it('one sentence at the top: the use that covers the most of the lot, whatever the plan order', () => {
    // A small shed lettered "Lumber" on the 1911 plan and a large yard lettered "Coal Yard" on the 1931-35 plan, both on the lot.
    const { result } = run([
      plateCollection(P1911, [useFeature(P1911, 'Lumber', [E0 + 8, N0 + 8], 1, 4.5, [3, 3])]),
      plateCollection(P1935, [useFeature(P1935, 'Coal Yard', [E0 + 2, N0 + 2], 1, 4.5, [15, 20])]),
    ]);
    const c = checked(result);
    expect(c.verdict.sentences.map((s) => s.text)).toEqual(['The 1931-35 plan letters this lot “Coal Yard”.']);
    // The other use is still a trigger and still a row line.
    expect(c.verdict.triggers).toHaveLength(2);
    const first = c.rows[0] as Extract<Checked['rows'][number], { kind: 'plan' }>;
    expect(first.lines.map((l) => l.text.text)).toEqual(['Lumber']);
  });

  it('on equal cover an area comes before a building inside it, then the earlier plan', () => {
    const building = useFeature(P1911, 'Coal Shed', [E0 + 2, N0 + 2], 1, 4.5, [10, 10], 'building');
    const area = useFeature(P1935, 'Coal Yard', [E0 + 2, N0 + 2], 1, 4.5, [10, 10], 'land_use');
    const { result } = run([plateCollection(P1911, [building]), plateCollection(P1935, [area])]);
    expect(checked(result).verdict.sentences.map((s) => s.text)).toEqual(['The 1931-35 plan letters this lot “Coal Yard”.']);
    const first = useFeature(P1911, 'Lumber', [E0 + 2, N0 + 2], 1, 4.5, [10, 10]);
    const second = useFeature(P1935, 'Coal Yard', [E0 + 2, N0 + 2], 1, 4.5, [10, 10]);
    const tie = run([plateCollection(P1911, [first]), plateCollection(P1935, [second])]);
    expect(checked(tie.result).verdict.sentences.map((s) => s.text)).toEqual(['The 1911 plan letters this lot “Lumber”.']);
  });

  it('on wins over near', () => {
    const { result } = run([plateCollection(P1911, [useFeature(P1911, COAL_1911, [E0 + 2, N0 + 2], 1), useFeature(P1911, 'Machine Shop', [E0 + 40, N0 + 2], 2)])]);
    const c = checked(result);
    expect(c.verdict.tag).toBe('past_industrial');
    expect(c.verdict.triggers).toHaveLength(1);
    // The row still lists the neighbour's use, tagged or not.
    const row = c.rows[0] as Extract<Checked['rows'][number], { kind: 'plan' }>;
    expect(row.lines.map((l) => l.relation.kind)).toEqual(['on', 'near']);
  });

  it('a use on the lot that is not on the list gets the fifth tag, and the use is in the row', () => {
    const { result } = run([plateCollection(P1911, [useFeature(P1911, 'Department of Street Cleaning, Eastern Division, City of Toronto (as lettered on the plate)', [E0 + 2, N0 + 2])])]);
    const c = checked(result);
    expect(c.verdict.tag).toBe('past_use');
    expect(c.verdict.tagText).toBe('A past use is lettered on these plans');
    expect(c.verdict.triggers).toEqual([]);
    expect(c.verdict.sentences[0]?.text).toBe('The 1911 plan letters this lot “Department of Street Cleaning, Eastern Division, City of Toronto”.');
  });

  it('a covered lot with no lettered use and a reviewed plan: "No industrial use", with the not-a-clearance line', () => {
    const building = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
    const { result } = run([plateCollection(P1911, [building])]);
    const c = checked(result);
    expect(c.verdict.tag).toBe('no_industrial');
    expect(c.verdict.tagText).toBe('No industrial use lettered on these plans');
    expect(c.verdict.notClearance).toBe(copy.NOT_A_CLEARANCE);
    expect(c.verdict.sentences[0]?.text).toBe('The 1911 plan letters no industrial use on this lot or within 10 m.');
  });

  it('a covered lot whose plan is not reviewed: "Not covered yet" with the Report coverage sentence', () => {
    const { result, model } = run([mappedOnly(P1911, [])]);
    const c = checked(result);
    expect(c.verdict.tag).toBe('not_covered');
    expect(c.verdict.notClearance).toBeNull();
    expect(model.kind).toBe('report');
    expect(c.verdict.sentences.length).toBeGreaterThan(0);
  });

  it('a lot outside the coverage area: "Not covered yet" and "Not reconstructed yet."', () => {
    const { result } = run([plateCollection(P1911, [])], FAR_LOT_ID);
    expect(result).toEqual({ kind: 'not_covered', tag: 'not_covered', tagText: 'Not covered yet', sentence: expect.objectContaining({ text: 'Not reconstructed yet.' }) });
  });

  it('lettering with a banned word is not quoted, and still triggers with the crop named', () => {
    const { result } = run([plateCollection(P1911, [useFeature(P1911, 'Clean Oil Works', [E0 + 2, N0 + 2])])]);
    const c = checked(result);
    expect(c.verdict.tag).toBe('past_industrial');
    expect(c.verdict.triggers[0]?.lettering).toBeNull();
    for (const s of allSentences(c)) expect(findBannedWords(s.text)).toEqual([]);
    expect(c.verdict.sentences[0]?.text).not.toContain('Oil');
  });

  it('the links: the one-page record opens the Report with print=1, and the share link names the lot and the data version', () => {
    const { result } = run([plateCollection(P1911, [useFeature(P1911, COAL_1911, [E0 + 2, N0 + 2])])]);
    const c = checked(result);
    expect(c.links.print).toBe(`/report?lot=${LOT_ID}&print=1`);
    expect(c.links.share).toMatch(new RegExp(`^https://buried\\.example/lot/${LOT_ID}\\?v=[0-9a-f]{12}$`));
    expect(c.compare.planSourceIds).toEqual([]);
    expect(c.title.text).toBe('1 Synthetic St');
  });

  it('the cannot-tell block begins with the screens line and carries the dig pointer', () => {
    const { result, model } = run([plateCollection(P1911, [])]);
    const c = checked(result);
    expect(c.cannotTell.screens.text).toBe("Buried screens; it doesn't certify.");
    expect(c.cannotTell.soil.text).toBe('It does not say what is in the soil, water or structures today.');
    expect(c.cannotTell.locate.lead.text).toBe('It is not a utility locate. Before you dig, request locates through');
    expect(c.cannotTell.locate.link).toEqual({ text: 'Ontario Dig Authority', url: 'https://ontariodigauthority.ca/' });
    // The longer lines stay in the one-page record, word for word.
    expect(model.kind === 'report' ? model.cannotTell.length : 0).toBeGreaterThan(1);
    expect(addressesLayer().features.length).toBeGreaterThan(0);
  });
});

// ---------- properties ----------

const WORD = fc.constantFrom('Coal', 'coal', '&', ';', 'Wood', 'Yard', 'Shed', 'Dwelling', 'Clean', 'safe', 'Mill', 'Oil', 'Works', 'Co.', '1911', '2nd', 'Store', 'Machine', 'Shop', 'Lumber', 'Fac.', 'Hall');
const LETTERING = fc.array(WORD, { minLength: 1, maxLength: 6 }).map((w) => w.join(' '));
const PLACE = fc.constantFrom<[number, number]>([E0 + 2, N0 + 2], [E0 + 40, N0 + 2], [E0 + 1000, N0 + 1000]);

const scenario = fc.record({
  uses: fc.array(fc.record({ plate: fc.constantFrom(P1911, P1935), use: fc.option(LETTERING, { nil: undefined }), at: PLACE }), { maxLength: 4 }),
  reviewed: fc.boolean(),
});

type Scenario = { uses: Array<{ plate: string; use: string | undefined; at: [number, number] }>; reviewed: boolean };

function scenarioWorld(s: Scenario): FeatureCollection[] {
  const byPlate = new Map<string, Feature[]>();
  for (const u of s.uses) {
    const list = byPlate.get(u.plate) ?? [];
    list.push(useFeature(u.plate, u.use, u.at, list.length + 1));
    byPlate.set(u.plate, list);
  }
  return [P1911, P1935].map((p) => (s.reviewed ? plateCollection(p, byPlate.get(p) ?? []) : mappedOnly(p, byPlate.get(p) ?? [])));
}

describe('buildLotCheck: properties', () => {
  it('P1: tags 4.2 and 4.3 always have a trigger, whose lettering holds its list entry as a whole word', () => {
    let triggered = 0;
    let produced = 0;
    fc.assert(
      fc.property(scenario, (s) => {
        const { result } = run(scenarioWorld(s));
        if (result.kind !== 'check') return;
        produced++;
        const v = result.verdict;
        if (v.tag === 'past_industrial' || v.tag === 'industrial_next') {
          triggered++;
          expect(v.triggers.length).toBeGreaterThan(0);
          for (const t of v.triggers) {
            expect(INDUSTRIAL_ENTRIES).toContain(t.matched);
            if (t.lettering !== null) {
              expect(industrialMatch(t.lettering)).not.toBeNull();
              const normalised = ` ${t.lettering.toLowerCase().replace(/[^\p{L}]+/gu, ' ').trim()} `;
              expect(normalised).toContain(` ${t.matched} `);
            }
          }
          expect(v.triggers.every((t) => (v.tag === 'past_industrial' ? t.relation.kind === 'on' : t.relation.kind === 'near'))).toBe(true);
          // One sentence at the top, never one per use (session 052).
          expect(v.sentences).toHaveLength(1);
        } else {
          expect(v.triggers).toEqual([]);
          if (v.tag === 'past_use') expect(v.sentences).toHaveLength(1);
        }
      }),
      { numRuns: 150 },
    );
    // The generator must reach the interesting cases, or the property says nothing.
    expect(produced).toBeGreaterThan(50);
    expect(triggered).toBeGreaterThan(5);
  });

  it('P3: no sentence, tag or trigger text holds a banned word, for any lettering', () => {
    let bannedSeen = 0;
    fc.assert(
      fc.property(scenario, (s) => {
        const { result } = run(scenarioWorld(s));
        if (result.kind !== 'check') return;
        if (s.uses.some((u) => u.use !== undefined && findBannedWords(u.use).length > 0)) bannedSeen++;
        for (const sentence of allSentences(result)) expect(findBannedWords(sentence.text)).toEqual([]);
        expect(findBannedWords(result.verdict.tagText)).toEqual([]);
        for (const t of result.verdict.triggers) expect(findBannedWords(t.lettering ?? '')).toEqual([]);
      }),
      { numRuns: 150 },
    );
    expect(bannedSeen).toBeGreaterThan(5);
  });

  it('P6: "No industrial use" appears only with tag 4.4 and always with its not-a-clearance line; "Not covered yet" never carries it', () => {
    fc.assert(
      fc.property(scenario, (s) => {
        const { result } = run(scenarioWorld(s));
        if (result.kind !== 'check') return;
        const v = result.verdict;
        const texts = [v.tagText, ...v.sentences.map((x) => x.text)].join(' ');
        expect(texts.includes('No industrial use lettered') ).toBe(v.tag === 'no_industrial');
        expect(v.notClearance === copy.NOT_A_CLEARANCE).toBe(v.tag === 'no_industrial');
        if (v.tag === 'no_industrial') expect(result.rows.some((r) => r.kind === 'plan' && r.reviewed)).toBe(true);
      }),
      { numRuns: 150 },
    );
  });

  it('P6: a lot no reviewed plan covers is never "No industrial use"', () => {
    fc.assert(
      fc.property(fc.array(LETTERING, { maxLength: 3 }), (uses) => {
        const features = uses.map((u, i) => useFeature(P1911, u, [E0 + 1000, N0 + 1000], i + 1));
        const { result } = run([mappedOnly(P1911, features), mappedOnly(P1935, [])]);
        if (result.kind === 'check') expect(result.verdict.tag).not.toBe('no_industrial');
      }),
      { numRuns: 50 },
    );
  });
});
