/**
 * The generators must reach the interesting cases, or the properties pass without testing much.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { summariseSet } from '../dates';
import { featuresForEra } from '../eras';
import { linkedSets } from '../links';
import { datasetArb, eraArb, featureCaseArb } from './arbitraries';

describe('generators reach the interesting cases', () => {
  it('datasets with links contain linked sets of more than one feature', () => {
    const samples = fc.sample(datasetArb({ links: true }), { numRuns: 400, seed: 7 });
    const withMulti = samples.filter((d) => linkedSets(d.collections).some((s) => s.members.length > 1));
    expect(withMulti.length).toBeGreaterThan(40);
  });

  it('datasets without links contain only sets of one', () => {
    for (const d of fc.sample(datasetArb({ links: false }), { numRuns: 100, seed: 7 })) {
      expect(linkedSets(d.collections).every((s) => s.members.length === 1)).toBe(true);
    }
  });

  it('some sets are conflicted, some are dated, and some features are drawn', () => {
    const samples = fc.sample(datasetArb({ links: true }), { numRuns: 400, seed: 11 });
    let conflicted = 0;
    let dated = 0;
    let drawn = 0;
    for (const d of samples) {
      for (const set of linkedSets(d.collections)) {
        const s = summariseSet(set, d.sources);
        if (s.conflicts.length > 0) conflicted++;
        if (s.kind === 'dated') {
          dated++;
          const era = { id: 'e', label: 'e', year_from: s.window.from, year_to: s.window.to };
          if (featuresForEra(d.collections, d.sources, era).features.length > 0) drawn++;
        }
      }
    }
    expect(conflicted).toBeGreaterThan(30);
    expect(dated).toBeGreaterThan(200);
    expect(drawn).toBeGreaterThan(100);
  });

  it('single features often have a clear presence and sometimes a clear absence', () => {
    const samples = fc.sample(featureCaseArb, { numRuns: 300, seed: 3 });
    const withPresence = samples.filter((c) =>
      c.feature.properties.observations.some((o) => o.present && o.visibility === 'clear'),
    );
    const withAbsence = samples.filter((c) =>
      c.feature.properties.observations.some((o) => !o.present && o.visibility === 'clear'),
    );
    expect(withPresence.length).toBeGreaterThan(150);
    expect(withAbsence.length).toBeGreaterThan(100);
  });

  it('eras are ordered ranges', () => {
    for (const e of fc.sample(eraArb, 200)) expect(e.year_from).toBeLessThanOrEqual(e.year_to);
  });
});
