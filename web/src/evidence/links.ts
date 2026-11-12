import { EvidenceLoadError } from './load';
import type { Feature, FeatureCollection } from './types.generated';

/** A connected group of published features joined by `same_as`; a feature with no links is a set of one. */
export type LinkedSet = {
  /** Sorted. Length at least 1. */
  memberIds: string[];
  /** In the same order as memberIds. */
  members: Feature[];
};

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Linked sets over the published features of the given evidence collections.
 *
 * Connected components of the undirected graph made by `same_as` links between published features.
 * Links to missing or unpublished features are ignored here (the Validator rejects them). Members
 * are sorted by id and sets by their first member id, so the result does not depend on input order.
 */
export function linkedSets(collections: readonly FeatureCollection[]): LinkedSet[] {
  const published = new Map<string, Feature>();
  for (const collection of collections) {
    for (const feature of collection.features) {
      if (published.has(feature.id)) {
        throw new EvidenceLoadError(
          `data/evidence/${collection.origin_source}.geojson`,
          'featureCollection',
          `duplicate feature id ${feature.id}`,
        );
      }
      if (feature.properties.status === 'published') published.set(feature.id, feature);
    }
  }

  const parent = new Map<string, string>([...published.keys()].map((id) => [id, id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    let cursor = id;
    while (cursor !== root) {
      const next = parent.get(cursor) as string;
      parent.set(cursor, root);
      cursor = next;
    }
    return root;
  };
  for (const feature of published.values()) {
    for (const link of feature.properties.same_as ?? []) {
      if (published.has(link.feature) && link.feature !== feature.id) {
        const a = find(feature.id);
        const b = find(link.feature);
        if (a !== b) parent.set(a < b ? b : a, a < b ? a : b);
      }
    }
  }

  const groups = new Map<string, string[]>();
  for (const id of published.keys()) {
    const root = find(id);
    groups.set(root, [...(groups.get(root) ?? []), id]);
  }
  return [...groups.values()]
    .map((ids) => ids.sort(byId))
    .sort((a, b) => byId(a[0] as string, b[0] as string))
    .map((ids) => ({
      memberIds: ids,
      members: ids.map((id) => published.get(id) as Feature),
    }));
}
