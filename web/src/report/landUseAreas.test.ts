/**
 * Land-use areas in the Report (session 032): a traced area's lettered use is quoted once under
 * "What the land was used for", "on this lot" or "near this lot" by the lot-relation rule, and an
 * area is never counted as a building.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { lotRelation } from '../evidence';
import { buildReport } from './buildReport';
import type { Report, ReportModel } from './buildReport';
import { LOT_POSITION_ERROR_M } from './lotError';
import { LAND_USE_RADIUS_M } from './radii';
import { E0, LOT_GEOMETRY, N0, P1911, P1935, inputs, makeFeature, obs, plateCollection } from './testing/fixtures';

const report = (model: ReportModel): Report => {
  if (model.kind !== 'report') throw new Error(`expected a report, got ${model.kind}`);
  return model;
};

function withArea(dx: number, dy: number, positionErrorM: number, use = 'Coal yard') {
  const area = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { kind: 'land_use', seq: 1, at: [E0 + dx, N0 + dy], size: [8, 8], positionErrorM });
  area.properties.attributes = { use };
  const r = report(buildReport(inputs([plateCollection(P1911, [area], ['building', 'land_use']), plateCollection(P1935, [])])));
  return { area, r, finding: r.groups[1].findings.find((f) => f.finding.text.includes(use)) };
}

describe('a traced area on the lot', () => {
  const { r, finding } = withArea(6, 10, 4.5);

  it('quotes the lettering once, as lettered on the 1911 plan, on this lot', () => {
    expect(finding?.finding.text).toContain("An area on this lot is lettered on the 1911 plan as 'Coal yard'.");
    const all = [...r.groups.flatMap((g) => g.findings.map((f) => f.finding.text)), ...r.coreSample.flatMap((b) => b.sentences.map((s) => s.text))];
    expect(all.filter((t) => t.includes('Coal yard'))).toHaveLength(1);
  });

  it('is not counted as a building anywhere', () => {
    const band = r.coreSample.find((b) => b.eraId === '1911');
    expect(band?.sentences.map((s) => s.text).join(' ')).not.toMatch(/outline\w* (of|from|on|sits?)|sits? on this lot|sit near/);
    expect(band?.sentences.map((s) => s.text)).toContain('No building is drawn at this lot or within 10 m in this era.');
    expect(r.summary.map((s) => s.text).join(' ')).toContain('No building outline from these records sits within 10 m of this lot.');
    expect(r.groups[2].findings.every((f) => f.finding.status === 'nothing_found' || f.finding.status === 'not_covered')).toBe(true);
  });

  it('draws no hatch where the era has no picture', () => {
    const band = r.coreSample.find((b) => b.eraId === '1911');
    expect(band?.crop.kind).toBe('none'); // the synthetic world has no tile; the hatched crop is tested in readingCrop.test.ts
  });
});

describe('lettering with a banned word', () => {
  it('is not quoted; the Report names the plan instead', () => {
    const { finding } = withArea(6, 10, 4.5, 'Clean works');
    expect(finding).toBeUndefined();
    const { r } = withArea(6, 10, 4.5, 'Clean works');
    const text = r.groups[1].findings.map((f) => f.finding.text).join(' ');
    expect(text).not.toMatch(/clean/i);
    expect(text).toContain('Its wording is not reproduced in this report');
  });
});

describe('property: an area gives a land-use sentence only for a lot it overlaps or is near', () => {
  it('follows the lot-relation rule, with the radius for uses', () => {
    fc.assert(
      fc.property(fc.integer({ min: -120, max: 120 }), fc.integer({ min: -120, max: 120 }), fc.double({ min: 0.5, max: 12, noNaN: true }), (dx, dy, err) => {
        const { area, finding } = withArea(dx, dy, err);
        const relation = lotRelation({ geometry: area.geometry as never, positionErrorM: err }, { geometry: LOT_GEOMETRY, positionErrorM: LOT_POSITION_ERROR_M });
        const inRange = relation.kind === 'on' || relation.withinM <= LAND_USE_RADIUS_M;
        expect(finding !== undefined).toBe(inRange);
        if (finding && relation.kind === 'on') {
          expect(finding.finding.text).toContain('on this lot');
          expect(finding.finding.text).not.toContain('near this lot');
        }
        if (finding && relation.kind === 'near') {
          expect(finding.finding.text).toContain('near this lot');
          expect(finding.finding.text).not.toContain('on this lot');
        }
      }),
      { numRuns: 200 },
    );
  });
});
