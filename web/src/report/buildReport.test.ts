import { describe, expect, it } from 'vitest';
import { checkedRecordsText, findBannedWords } from '../evidence';
import { buildReport } from './buildReport';
import type { Report, ReportModel } from './buildReport';
import * as copy from './copy';
import {
  AERIAL,
  E0,
  FAR_LOT_ID,
  LOT_ID,
  N0,
  P1911,
  P1935,
  inputs,
  linkedBuildingOnLot,
  makeCollection,
  makeFeature,
  mappedOnly,
  obs,
  plateCollection,
} from './testing/fixtures';

function report(model: ReportModel): Report {
  if (model.kind !== 'report') throw new Error(`expected a report, got ${model.kind}: ${JSON.stringify(model)}`);
  return model;
}

const allText = (r: Report): string[] => [
  r.screensLine.text,
  r.title.text,
  ...r.place.sentences.map((s) => s.text),
  ...r.coreSample.flatMap((b) => b.sentences.map((s) => s.text)),
  ...r.groups.flatMap((g) => [...g.findings.map((f) => f.finding.text), ...(g.nextStep ?? []).map((s) => s.text)]),
  ...r.cannotTell.map((s) => s.text),
  ...r.beforeYouDig.map((s) => s.text),
];

describe('outside coverage', () => {
  it('says "Not reconstructed yet." and nothing else for a lot that is not in the layer', () => {
    expect(buildReport(inputs(linkedBuildingOnLot(), { lotId: 'no_such_lot' }))).toEqual({ kind: 'not_reconstructed', text: 'Not reconstructed yet.' });
  });

  it('says it for a lot outside every plate\'s mapped area', () => {
    expect(buildReport(inputs(linkedBuildingOnLot(), { lotId: FAR_LOT_ID }))).toEqual({ kind: 'not_reconstructed', text: 'Not reconstructed yet.' });
  });
});

describe('a lot with a building drawn on it', () => {
  const r = report(buildReport(inputs(linkedBuildingOnLot())));

  it('starts with the screens line and the title, and has every section', () => {
    expect(r.screensLine.text).toBe("Buried screens; it doesn't certify.");
    expect(r.title.text).toBe('The documented history of this place.');
    expect(r.coreSample.map((b) => b.eraId)).toEqual(['today', '1947', '1935', '1911']);
    expect(r.groups.map((g) => g.heading)).toEqual(['Water history', 'Past land use', 'Fill and old structures']);
    expect(r.cannotTell.map((s) => s.text)).toContain(copy.CANNOT_CONDITION);
    expect(r.cannotTell.map((s) => s.text)).toContain(copy.CANNOT_UTILITIES);
    expect(r.beforeYouDig.map((s) => s.text)).toEqual([copy.DIG_NOT_LOCATES, copy.DIG_REQUEST]);
    expect(r.beforeYouDigLink.url).toBe('https://ontariodigauthority.ca/');
  });

  it('shows one finding for the linked pair, on this lot, with dates, position, confidence and both sources', () => {
    const structures = r.groups[2].findings.filter((f) => f.finding.status === 'documented');
    expect(structures).toHaveLength(1);
    const f = structures[0]!;
    expect(f.finding.text).toContain('on this lot');
    expect(f.finding.text).toContain('Built by 1914');
    expect(f.finding.text).toContain('Last seen 1931');
    expect(f.finding.text).toContain('Positioned within about 4.5 m');
    expect(f.finding.text).toContain('Documented: Synthetic.');
    expect(f.finding.sourceIds).toEqual([P1911, P1935]);
    expect(f.featureIds).toHaveLength(2);
  });

  it('words the 1935 end as "Last seen", never "Gone by", with no later absence', () => {
    const text = allText(r).join('\n');
    expect(text).not.toMatch(/Gone by/);
    expect(text).not.toMatch(/Built in/);
  });

  it('puts the next step under a group that has a finding, and not under one that has none', () => {
    expect(r.groups[2].nextStep?.map((s) => s.text)).toEqual([copy.NEXT_STRUCTURES]);
    expect(r.groups[0].nextStep).toBeNull();
  });

  it('builds a core sample that counts the present-day outlines and the drawn building', () => {
    const today = r.coreSample.find((b) => b.eraId === 'today')!;
    expect(today.sentences[0]!.text).toBe('1 building outline at this lot today.');
    expect(today.sentences.map((s) => s.text).join(' ')).not.toContain('on this lot');
    const y1911 = r.coreSample.find((b) => b.eraId === '1911')!;
    expect(y1911.sentences.map((s) => s.text)).toContain('1 building drawn on this lot.');
    expect(y1911.target).toEqual({ eraId: '1911', lotId: LOT_ID });
  });

  it('lists the place, the sources and the links', () => {
    expect(r.place.addresses).toEqual(['1 Synthetic St']);
    expect(r.sources.map((s) => s.id)).toEqual([
      P1911,
      P1935,
      'present_toronto_address_points_2026',
      'present_toronto_building_outlines_2026',
      'present_toronto_property_boundaries_2026',
    ]);
    expect(r.links.share).toBe(`https://buried.example/report?lot=${LOT_ID}&era=1911&v=abcdef012345`);
    expect(r.links.live).toBe(`https://buried.example/?lot=${LOT_ID}&era=1911`);
    expect(r.dataVersion).toHaveLength(64);
  });

  it('has no banned word anywhere', () => {
    for (const text of allText(r)) expect(findBannedWords(text), text).toEqual([]);
  });

  it('does not say the records changed unless a link carried another version', () => {
    expect(r.recordsChanged).toBeNull();
    const changed = report(buildReport(inputs(linkedBuildingOnLot(), { linkDataVersion: '000000000000' })));
    expect(changed.recordsChanged?.text).toBe(copy.RECORDS_CHANGED);
    const same = report(buildReport(inputs(linkedBuildingOnLot(), { linkDataVersion: 'abcdef012345' })));
    expect(same.recordsChanged).toBeNull();
  });
});

describe('a lot with nothing found', () => {
  const reviewedEverything = [plateCollection(P1911, [], ['building', 'water', 'land_use']), plateCollection(P1935, [], ['building', 'water', 'land_use'])];

  it('says so in every group and lists every plate with its years and coverage', () => {
    const r = report(buildReport(inputs(reviewedEverything)));
    for (const g of r.groups) {
      expect(g.findings).toHaveLength(1);
      const f = g.findings[0]!.finding;
      expect(f.status).toBe('nothing_found');
      expect(f.text).toContain(P1911);
      expect(f.text).toContain(P1935);
      expect(f.text).toContain('1911, revised to 1914');
      expect(f.text).toContain('1931, revised to 1935');
      expect(f.text).toContain('checked here');
      expect(checkedRecordsText(f)).toEqual([`${P1911} (1911–1914, clear)`, `${P1935} (1931–1935, clear)`]);
    }
    expect(r.groups[2].findings[0]!.finding.text).toContain('No building is drawn at this lot or within 10 m in these records.');
    expect(r.groups.every((g) => g.nextStep === null)).toBe(true);
  });

  it('says "Not covered" for water where the reviewed areas attest buildings only', () => {
    const buildingsOnly = [plateCollection(P1911, []), plateCollection(P1935, [])];
    const r = report(buildReport(inputs(buildingsOnly)));
    expect(r.groups[0].findings[0]!.finding.status).toBe('not_covered');
    expect(r.groups[0].findings[0]!.finding.text).toContain('No record Buried has read has been checked for water at this lot.');
    expect(r.groups[2].findings[0]!.finding.status).toBe('nothing_found');
    // Land use needs the land_use attestation too.
    expect(r.groups[1].findings.map((f) => f.finding.status)).toEqual(['not_covered']);
  });

  it('says "Not covered" where a plate shows the lot but nobody has checked it', () => {
    const r = report(buildReport(inputs([mappedOnly(P1911, []), mappedOnly(P1935, [])])));
    expect(r.groups[2].findings.map((f) => f.finding.status)).toEqual(['not_covered']);
    expect(r.groups[2].findings[0]!.finding.text).toContain('shows this lot, not fully checked here');
  });

  it('adds a "not covered" finding beside a Documented one when another plate was not checked', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
    const r = report(buildReport(inputs([plateCollection(P1911, [a]), mappedOnly(P1935, [])])));
    expect(r.groups[2].findings.map((f) => f.finding.status)).toEqual(['documented', 'not_covered']);
  });

  it('lists a plate that has no evidence file as not read', () => {
    const r = report(buildReport(inputs([plateCollection(P1911, [])])));
    const f = r.groups[2].findings[0]!.finding;
    expect(f.text).toContain(`${P1935} (1931, revised to 1935): not read into Buried yet.`);
  });
});

describe('estimated, conflicting and unprintable records', () => {
  it('marks a building with an estimated confidence as Estimated and gives the reason', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
    a.properties.confidence = 'estimated';
    a.properties.confidence_reason = 'Storeys not lettered.';
    const r = report(buildReport(inputs([plateCollection(P1911, [a]), plateCollection(P1935, [])])));
    const f = r.groups[2].findings[0]!;
    expect(f.finding.status).toBe('estimated');
    expect(f.finding.text).toContain('Estimated: Storeys not lettered.');
    expect(f.confidence[0]).toEqual({ label: 'Estimated', reason: 'Storeys not lettered.', pattern: 'dashed' });
  });

  it('names the sources that disagree for a conflicted set and picks no side', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin'), obs(P1935, true, 'clear', 'match_auto')], { seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
    const b = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin'), obs(P1911, false, 'clear', 'match_auto')], { seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
    a.properties.same_as = [{ feature: b.id, method: 'match_auto' }];
    b.properties.same_as = [{ feature: a.id, method: 'match_auto' }];
    const r = report(buildReport(inputs([plateCollection(P1911, [a]), plateCollection(P1935, [b])])));
    const f = r.groups[2].findings[0]!;
    expect(f.finding.status).toBe('estimated');
    expect(f.finding.text).toContain('The records disagree');
    expect(f.finding.text).toContain('It needs review.');
    const era1911 = r.coreSample.find((band) => band.eraId === '1911')!;
    expect(era1911.sentences.map((s) => s.text).join(' ')).toContain('need review');
  });

  it('does not quote a use that contains a banned word', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
    a.properties.attributes = { use: 'Clean works', storeys: 1 };
    const r = report(buildReport(inputs([plateCollection(P1911, [a]), plateCollection(P1935, [])])));
    const text = allText(r).join('\n');
    expect(text).not.toMatch(/clean/i);
    expect(r.groups[1].findings.map((f) => f.finding.text).join(' ')).toContain(`A use printed on ${P1911} is recorded for a building on this lot.`);
  });

  it('quotes a printable use and groups the same use together', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
    const b = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 2, at: [E0 + 6, N0 + 20], size: [8, 8] });
    a.properties.attributes = { use: 'Stores 2nd floor' };
    b.properties.attributes = { use: 'Stores 2nd floor' };
    const r = report(buildReport(inputs([plateCollection(P1911, [a, b]), plateCollection(P1935, [])])));
    expect(r.groups[1].findings[0]!.finding.text).toContain("'Stores 2nd floor' is recorded for 2 buildings on this lot on ");
  });

  it('says "near this lot (within X m)" for a building off the lot', () => {
    const a = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 1, at: [E0 + 21, N0 + 10], size: [8, 8] });
    const r = report(buildReport(inputs([plateCollection(P1911, [a]), plateCollection(P1935, [])])));
    const f = r.groups[2].findings.find((x) => x.finding.status !== 'not_covered' && x.finding.status !== 'nothing_found')!;
    expect(f.finding.text).toContain('near this lot (within 8 m)');
    expect(f.finding.text).not.toContain('on this lot');
  });

  it('writes the water-then-building finding as two records and not as filling', () => {
    const water = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 1, kind: 'water', at: [E0 + 4, N0 + 6], size: [10, 10] });
    const building = makeFeature(P1935, [obs(P1935, true, 'clear', 'origin')], { seq: 1, at: [E0 + 6, N0 + 10], size: [8, 8] });
    const r = report(buildReport(inputs([plateCollection(P1911, [water]), plateCollection(P1935, [building])])));
    const pair = r.groups[2].findings.find((f) => f.finding.text.startsWith('Water is drawn on this lot'));
    expect(pair?.finding.text).toContain('(Last seen 1911)');
    expect(pair?.finding.text).toContain('(Built by 1935)');
    expect(pair?.finding.text).not.toMatch(/fill/i);
  });
});

describe('the workspace section', () => {
  it('is separate, labelled, and leaves the canon parts and the share link unchanged', () => {
    const canon = linkedBuildingOnLot();
    const wsBuilding = makeFeature(P1911, [obs(P1911, true, 'clear', 'origin')], { seq: 9001, at: [E0 + 6, N0 + 4], size: [6, 6] });
    const workspace = { collections: [makeCollection(P1911, [wsBuilding])], sources: [] };
    const without = report(buildReport(inputs(canon)));
    const withWs = report(buildReport(inputs(canon, { workspace })));
    expect(withWs.workspace?.line.text).toBe(copy.WORKSPACE_LINE);
    expect(withWs.workspace?.groups[2].findings).toHaveLength(1);
    const { workspace: _a, ...restWith } = withWs;
    const { workspace: _b, ...restWithout } = without;
    expect(restWith).toEqual(restWithout);
    expect(JSON.stringify(withWs.links)).not.toContain(wsBuilding.id);
    expect(JSON.stringify([withWs.coreSample, withWs.groups, withWs.sources])).not.toContain(wsBuilding.id);
  });
});

describe('aerials', () => {
  it('count for the core sample only when a sidecar covers the lot', async () => {
    const { aerialSidecar } = await import('./testing/fixtures');
    const plain = report(buildReport(inputs(linkedBuildingOnLot())));
    const withAerial = report(buildReport(inputs(linkedBuildingOnLot(), { canon: { ...inputs([]).canon, collections: linkedBuildingOnLot(), sidecars: [aerialSidecar()] } })));
    expect(plain.coreSample.find((b) => b.eraId === '1947')!.sentences[0]!.text).toBe('Not covered by these records.');
    expect(withAerial.coreSample.find((b) => b.eraId === '1947')!.sentences[0]!.text).toContain(AERIAL);
    expect(withAerial.cannotTell.map((s) => s.text).join(' ')).toContain('1947');
  });
});
