import type { FeatureCollection } from '../types.generated';

/** Deterministic Fisher-Yates shuffle driven by an integer seed (so fast-check can shrink it). */
export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  let state = (seed >>> 0) || 1;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = next() % (i + 1);
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The same evidence with collections, features, links and observations in a different order. */
export function permuteCollections(
  collections: readonly FeatureCollection[],
  seed: number,
): FeatureCollection[] {
  const copy = structuredClone(collections) as FeatureCollection[];
  for (const [i, c] of copy.entries()) {
    c.features = shuffled(c.features, seed + i + 1);
    for (const [j, f] of c.features.entries()) {
      f.properties.observations = shuffled(f.properties.observations, seed + i * 31 + j + 7) as typeof f.properties.observations;
      if (f.properties.same_as) f.properties.same_as = shuffled(f.properties.same_as, seed + j + 13);
    }
  }
  return shuffled(copy, seed + 101);
}
