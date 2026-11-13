import { describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { featuresForEra, findBannedWords } from '../evidence';
import { CardError, buildGateCard, formatUtc } from './gateCard';
import { diskFetch } from './testing/diskFetch';

async function setup() {
  const data = await loadData(diskFetch());
  const era = data.project.eras.find((e) => e.id === '1911') as NonNullable<(typeof data.project.eras)[number]>;
  const list = featuresForEra(data.evidence, data.sources, era);
  const byId = new Map(data.evidence.flatMap((c) => c.features).map((f) => [f.id, f]));
  return { data, list, byId };
}

describe('formatUtc', () => {
  it('words an ISO time as day, month name, year and UTC time', () => {
    expect(formatUtc('2026-11-12T21:32:05Z')).toBe('12 Nov 2026, 21:32 UTC');
    expect(formatUtc('2026-01-02T03:04:00+00:00')).toBe('2 Jan 2026, 03:04 UTC');
    expect(formatUtc('2026-11-12T23:32:00-05:00')).toBe('13 Nov 2026, 04:32 UTC');
  });
  it('returns text it cannot parse unchanged', () => {
    expect(formatUtc('not a time')).toBe('not a time');
  });
});

describe('buildGateCard for a workspace feature (spec 04 requirement 6.5)', () => {
  it('says it is from the workspace and that it is not part of the reviewed record', async () => {
    const { data, list, byId } = await setup();
    const entry = list.features.find((f) => f.id === 'bld_fip_v3_1911_229_0001') as NonNullable<(typeof list.features)[number]>;
    const feature = byId.get('bld_fip_v3_1911_229_0001') as NonNullable<ReturnType<typeof byId.get>>;
    const card = buildGateCard(entry, feature, data.sources, 'workspace');
    const origin = card.rows.find((r) => r.label === 'Origin')?.value;
    expect(origin).toBe("From your workspace. Not part of Buried's reviewed record.");
    expect(card.rows.some((r) => r.label === 'Confirmed by')).toBe(false);
    expect(card.rows.some((r) => /confirmed/i.test(`${r.label} ${r.value}`))).toBe(false);
    // a canon card has no such row
    expect(buildGateCard(entry, feature, data.sources).rows.some((r) => r.label === 'Origin')).toBe(false);
  });
});

describe('buildGateCard (requirement 24.3)', () => {
  it('shows the feature id, origin source, position phrase, review status and the attribution line', async () => {
    const { data, list, byId } = await setup();
    const entry = list.features.find((f) => f.id === 'bld_fip_v3_1911_229_0001');
    expect(entry).toBeDefined();
    const card = buildGateCard(entry as NonNullable<typeof entry>, byId.get('bld_fip_v3_1911_229_0001') as NonNullable<ReturnType<typeof byId.get>>, data.sources);

    const row = (label: string) => card.rows.find((r) => r.label === label)?.value;
    expect(card.heading).toBe('dwelling');
    expect(row('Feature')).toBe('bld_fip_v3_1911_229_0001');
    expect(row('Position')).toBe('Positioned within about 4.5 m');
    expect(row('Read from')).toBe('Synthetic plate 229, 1911 edition (fip_v3_1911_229)');
    expect(row('Status')).toMatch(/^Status: (draft, not yet reviewed|reviewed by .+, \d{4}-\d{2}-\d{2})$/);
    expect(card.rows.some((r) => /confirmed/i.test(`${r.label} ${r.value}`))).toBe(false);
    expect(row('Attribution')).toBe('Synthetic attribution for the 1911 plate.');
    expect(row('Confidence')).toBe('Documented. Synthetic: outline and storeys read from the synthetic plate.');
  });

  it('names a feature with no recorded use by its kind', async () => {
    const { data, list, byId } = await setup();
    const entry = list.features.find((f) => f.id === 'bld_fip_v3_1911_229_0002');
    const card = buildGateCard(entry as NonNullable<typeof entry>, byId.get('bld_fip_v3_1911_229_0002') as NonNullable<ReturnType<typeof byId.get>>, data.sources);
    expect(card.heading).toBe('Building');
    expect(card.rows.find((r) => r.label === 'Confidence')?.value.startsWith('Estimated. ')).toBe(true);
  });

  it('words the position through the Evidence Library, never with a plus-minus sign', async () => {
    const { data, list, byId } = await setup();
    for (const entry of list.features) {
      const card = buildGateCard(entry, byId.get(entry.id) as NonNullable<ReturnType<typeof byId.get>>, data.sources);
      for (const r of card.rows) expect(r.value).not.toContain('±');
      expect(card.rows.find((r) => r.label === 'Position')?.value).toMatch(/^Positioned within about \d+\.\d m$/);
    }
  });

  it('contains no banned word anywhere on the card (requirement 7.4)', async () => {
    const { data, list, byId } = await setup();
    for (const entry of list.features) {
      const card = buildGateCard(entry, byId.get(entry.id) as NonNullable<ReturnType<typeof byId.get>>, data.sources);
      const text = [card.heading, ...card.rows.flatMap((r) => [r.label, r.value])].join('\n');
      expect(findBannedWords(text), text).toEqual([]);
    }
  });

  it('refuses a feature that is not the Era list entry', async () => {
    const { data, list, byId } = await setup();
    const entry = list.features[0] as NonNullable<(typeof list.features)[number]>;
    const other = byId.get('bld_fip_v3_1911_229_0002') as NonNullable<ReturnType<typeof byId.get>>;
    expect(() => buildGateCard(entry, other, data.sources)).toThrow(CardError);
  });
});
