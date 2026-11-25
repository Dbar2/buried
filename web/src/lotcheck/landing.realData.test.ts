/** The Landing's fact and examples on the committed data (session 051, task 3: report the count and the addresses). */
import { describe, expect, it } from 'vitest';
import { industrialLots, landingFact, pickExamples } from './landing';
import { checkLot, realWorld } from './testing/realWorld';

describe('the Landing on the committed data', () => {
  it('computes the fact from the evidence and the address points', async () => {
    const w = await realWorld();
    const fact = landingFact(w.data.evidence, w.addresses, w.data.registry);
    console.info('landing fact', JSON.stringify({ text: fact?.sentence.text, count: fact?.count, addresses: fact?.addresses, areas: fact?.areas.map((a) => a.featureId) }));
    expect(fact).not.toBeNull();
    expect(fact!.key).toBe('coal and wood yard');
    expect(fact!.areas.map((a) => a.sourceId).sort()).toEqual(['fip_v3_1911_229', 'fip_v3_1935_229']);
  });

  it('lists as examples lots whose check says "Past industrial use recorded", and only those', async () => {
    const w = await realWorld();
    const tagged = industrialLots(w.data.evidence, w.lots, w.addresses, w.data.registry);
    for (const t of tagged) {
      const c = checkLot(w, t.lotId);
      expect(c.kind === 'check' && c.verdict.tag, t.lotId).toBe('past_industrial');
    }
    // Every lot the check tags 4.2 that has an address is in the list.
    const ids = new Set(tagged.map((t) => t.lotId));
    for (const lot of w.lots.features) {
      const c = checkLot(w, lot.id);
      if (c.kind === 'check' && c.verdict.tag === 'past_industrial' && c.title.text !== 'This lot') expect(ids.has(lot.id), lot.id).toBe(true);
    }
    const examples = pickExamples(tagged);
    console.info('landing examples', JSON.stringify(examples), 'tagged lots', tagged.length);
    expect(examples).toHaveLength(3);
  });
});
