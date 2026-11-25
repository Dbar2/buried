import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { checkSentence, findBannedWords } from '../evidence';
import { fixed } from '../report/sentence';
import * as copy from './copy';
import { buildDigTimeline, captionFor, digPlays, holdTime, MAX_TOTAL_MS, MIN_TOTAL_MS, skipTo, slipForRow, stateAt } from './digTimeline';
import type { CheckOf } from './digTimeline';
import { allSentences } from './lotCheck';
import type { PlanRow, UseLine } from './lotCheck';
import { checkLot, realWorld } from './testing/realWorld';

const line = (text: string, near = false, matched: string | null = null): UseLine => ({
  featureId: `f_${text}`,
  sourceId: 's',
  text: fixed(text),
  quotable: true,
  relation: near ? { kind: 'near', withinM: 12 } : { kind: 'on' },
  relationText: fixed(near ? 'Near this lot' : 'On this lot'),
  matched,
  cropRef: null,
});

const planRow = (year: string, lines: UseLine[]): PlanRow => ({
  kind: 'plan',
  sourceId: `fip_${year}`,
  eraId: `era_${year}`,
  yearLabel: year,
  planName: `the ${year} plan`,
  reviewed: true,
  lines,
  sentences: lines.length === 0 ? [fixed('The plan shows buildings here.')] : [],
});

/** Just enough of a lot check for the timeline and `allSentences`. */
function fake(rows: PlanRow[], tag: CheckOf['verdict']['tag'] = 'past_industrial'): CheckOf {
  return {
    kind: 'check',
    lotId: 'lot',
    title: fixed('2A Percy St'),
    verdict: { tag, tagText: copy.TAG_TEXT[tag], triggers: [], sentences: [fixed('The plans letter this lot.')], notClearance: null, inscription: { lead: 'HERE STOOD', name: fixed('Coal'), foot: fixed('recorded on the plan of 1911') } },
    rows: [...rows, { kind: 'today', yearLabel: 'Today', sentences: [fixed('Six building outlines.')] }],
    cannotTell: { screens: fixed('s'), soil: fixed('t'), locate: { lead: fixed('l'), link: { text: 'x', url: 'https://example.org/' } } },
    provenance: { attribution: [], position: null, traced: [], review: [] },
    compare: { planSourceIds: [] },
    links: { print: '', share: '' },
  } as unknown as CheckOf;
}

const years = ['1911', '1931-35', '1947', '1955', '1962', '1971', '1980'];
const rowsArb = fc
  .integer({ min: 0, max: 7 })
  .chain((n) =>
    fc.tuple(
      ...years.slice(0, n).map((y) =>
        fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 12 }), fc.boolean()), { maxLength: 3 }).map((ls) => planRow(y, ls.map(([t, near], i) => line(`${t}${i}`, near, i === 0 ? 'coal' : null)))),
      ),
    ),
  )
  .map((rows) => rows as PlanRow[]);

describe('buildDigTimeline', () => {
  it('two plans take 4.5 s: 0.8 to break ground, 1.2 per layer, 0.8 at the bottom, 0.5 dark', () => {
    const tl = buildDigTimeline(fake([planRow('1911', [line('Coal & Wood Yard, J. W. Corson & Co.')]), planRow('1931-35', [line('Coal & Wood Yard, Northern Fuels Co.')])]), false);
    expect(tl.totalMs).toBe(4500);
    expect(tl.steps.map((s) => [s.kind, s.markIndex, s.endMs - s.startMs])).toEqual([
      ['ground', 0, 800],
      ['lower', 1, 600],
      ['pause', 1, 600],
      ['lower', 2, 600],
      ['pause', 2, 600],
      ['bottom', 2, 800],
      ['beat', 2, 500],
    ]);
  });

  it('the ruler is Today and then each plan, newest first, and the caption names the oldest plan', () => {
    const tl = buildDigTimeline(fake([planRow('1911', []), planRow('1931-35', [])]), false);
    expect(tl.marks.map((m) => m.label)).toEqual(['Today', '1931-35', '1911']);
    expect(tl.caption).toBe('Digging down to 1911…');
    expect(buildDigTimeline(fake([]), false).caption).toBe(copy.DIG.captionNoPlans);
    expect(captionFor('1931-35')).toBe('Digging down to 1931-35…');
  });

  it('a slip says what the Result says: the lettering, "next door: ..." for a near use, or "nothing lettered here"', () => {
    expect(slipForRow(planRow('1911', [line('Coal Shed', true), line('Coal & Wood Yard, Corson')]), 2)).toMatchObject({ kind: 'use', prefix: '', text: 'Coal & Wood Yard, Corson', muted: false });
    expect(slipForRow(planRow('1911', [line('Street Cleaning Yard', true)]), 2)).toMatchObject({ kind: 'near', prefix: 'next door: ', text: 'Street Cleaning Yard', muted: false });
    expect(slipForRow(planRow('1911', []), 2)).toMatchObject({ kind: 'nothing', text: 'nothing lettered here', muted: true });
    const tl = buildDigTimeline(fake([planRow('1911', [])]), false);
    expect(tl.slips[0]).toMatchObject({ kind: 'today', text: '2A Percy St' });
  });

  it('plays only with motion and for a lot the plans cover', () => {
    expect(digPlays(fake([]), false)).toBe(true);
    expect(digPlays(fake([]), true)).toBe(false);
    expect(digPlays(fake([], 'not_covered'), false)).toBe(false);
  });

  it('the caption and the fixed texts have no banned word, and the caption passes the sentence check', () => {
    for (const text of [...Object.values(copy.DIG), ...Object.values(copy.INSCRIPTION)]) expect(findBannedWords(text), text).toEqual([]);
    expect(findBannedWords(captionFor('1931-35'))).toEqual([]);
  });
});

describe('P8 and P9: the dig', () => {
  it('every slip is a line of the lot check or the one fixed phrase, and a muted slip belongs to a row with no lines', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const check = fake(rows);
        const tl = buildDigTimeline(check, false);
        const texts = new Set(allSentences(check as never).map((s) => s.text));
        expect(tl.slips).toHaveLength(tl.marks.length);
        for (const slip of tl.slips) {
          if (slip.muted) {
            expect(slip.text).toBe(copy.DIG.nothing);
            const row = rows.find((r) => r.sourceId === tl.marks[slip.markIndex]?.sourceId);
            expect(row?.lines).toEqual([]);
          } else {
            expect(texts.has(slip.text), slip.text).toBe(true);
          }
        }
      }),
    );
  });

  it('the total is between 2 and 7 s, the steps are contiguous, and the lantern only goes down', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const tl = buildDigTimeline(fake(rows), false);
        expect(tl.totalMs).toBeGreaterThanOrEqual(MIN_TOTAL_MS);
        expect(tl.totalMs).toBeLessThanOrEqual(MAX_TOTAL_MS);
        let at = 0;
        for (const s of tl.steps) {
          expect(s.startMs).toBe(at);
          expect(s.endMs).toBeGreaterThanOrEqual(s.startMs);
          at = s.endMs;
        }
        expect(at).toBe(tl.totalMs);
        let lastDepth = -Infinity;
        let lastShown = 0;
        for (let t = 0; t <= tl.totalMs; t += 50) {
          const st = stateAt(tl, t);
          expect(st.depth).toBeGreaterThanOrEqual(lastDepth - 1e-9);
          expect(st.slipsShown.length).toBeGreaterThanOrEqual(lastShown);
          lastDepth = st.depth;
          lastShown = st.slipsShown.length;
        }
        // Every slip has appeared by the end.
        expect(stateAt(tl, tl.totalMs).slipsShown).toHaveLength(tl.marks.length);
      }),
    );
  });

  it('skipping from any moment ends at the Result', () => {
    fc.assert(
      fc.property(rowsArb, fc.nat({ max: 20000 }), (rows, from) => {
        const tl = buildDigTimeline(fake(rows), false);
        const end = stateAt(tl, skipTo(tl, from));
        expect(end.done).toBe(true);
        expect(end.dark).toBe(1);
      }),
    );
  });

  it('under reduced motion there are no steps and no time', () => {
    fc.assert(
      fc.property(rowsArb, (rows) => {
        const tl = buildDigTimeline(fake(rows), true);
        expect(tl.steps).toEqual([]);
        expect(tl.totalMs).toBe(0);
        expect(stateAt(tl, 0).done).toBe(true);
      }),
    );
  });

  it('the hold time of a mark is inside its pause, with its slip showing', () => {
    const tl = buildDigTimeline(fake([planRow('1911', [line('A')]), planRow('1931-35', [line('B')])]), false);
    for (const m of [0, 1, 2]) {
      const st = stateAt(tl, holdTime(tl, m));
      expect(st.activeMark).toBe(m);
      expect(st.slipsShown).toContain(m);
      expect(st.done).toBe(false);
    }
  });
});

describe('the dig on the committed data', () => {
  it("2A Percy St: Today, 1931-35 and 1911, each slip a line of the Result, in about 4.5 s", async () => {
    const w = await realWorld();
    const check = checkLot(w, '5451729');
    expect(check.kind).toBe('check');
    if (check.kind !== 'check') return;
    const tl = buildDigTimeline(check, false);
    expect(tl.marks.map((m) => m.label)).toEqual(['Today', '1931-35', '1911']);
    expect(tl.totalMs).toBe(4500);
    const texts = new Set(allSentences(check).map((s) => s.text));
    for (const slip of tl.slips) expect(slip.muted || texts.has(slip.text), slip.text).toBe(true);
    console.info('dig slips', JSON.stringify(tl.slips.map((s) => `${s.prefix}${s.text}`)), tl.caption);
    for (const s of allSentences(check)) expect(checkSentence(s.text, s.pack).ok).toBe(true);
  });
});
