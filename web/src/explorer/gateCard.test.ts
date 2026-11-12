import { describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { featuresForEra } from '../evidence';
import { CardError, buildGateCard } from './gateCard';
import { diskFetch } from './testing/diskFetch';

// Spec 01 task 8 adds findBannedWords to the Evidence Library; until it lands this is the same
// whole-word, case-insensitive rule from product.md honesty rule 1.
const BANNED = /\b(contaminated|unsafe|safe|safer|safest|clean|cleaner|cleanest)\b|\bwill flood\b/i;

async function setup() {
  const data = await loadData(diskFetch());
  const era = data.project.eras.find((e) => e.id === '1911') as NonNullable<(typeof data.project.eras)[number]>;
  const list = featuresForEra(data.evidence, data.sources, era);
  const byId = new Map(data.evidence.flatMap((c) => c.features).map((f) => [f.id, f]));
  return { data, list, byId };
}

describe('buildGateCard (requirement 24.3)', () => {
  it('shows the feature id, origin source, position phrase, who confirmed it and when, and the attribution line', async () => {
    const { data, list, byId } = await setup();
    const entry = list.features.find((f) => f.id === 'bld_fip_v3_1911_229_0001');
    expect(entry).toBeDefined();
    const card = buildGateCard(entry as NonNullable<typeof entry>, byId.get('bld_fip_v3_1911_229_0001') as NonNullable<ReturnType<typeof byId.get>>, data.sources);

    const row = (label: string) => card.rows.find((r) => r.label === label)?.value;
    expect(card.heading).toBe('dwelling');
    expect(row('Feature')).toBe('bld_fip_v3_1911_229_0001');
    expect(row('Position')).toBe('Positioned within about 4.5 m');
    expect(row('Read from')).toBe('Synthetic plate 229, 1911 edition (fip_v3_1911_229)');
    expect(row('Confirmed by')).toBe('Synthetic Reviewer');
    expect(row('Confirmed at')).toBe('2026-11-13T10:00:00Z');
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
      expect(BANNED.test(text), text).toBe(false);
    }
  });

  it('refuses a feature that is not the Era list entry', async () => {
    const { data, list, byId } = await setup();
    const entry = list.features[0] as NonNullable<(typeof list.features)[number]>;
    const other = byId.get('bld_fip_v3_1911_229_0002') as NonNullable<ReturnType<typeof byId.get>>;
    expect(() => buildGateCard(entry, other, data.sources)).toThrow(CardError);
  });
});
