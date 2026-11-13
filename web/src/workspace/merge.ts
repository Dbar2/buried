/**
 * Display merge (spec 04 design "Display merge"): the canon collections and the workspace's, side by
 * side, with a record of which is which. The workspace collections are appended after the canon ones
 * and never replace or edit one. `originOf` answers from the ids of the two sets, so a workspace
 * feature can only ever be called a workspace feature (property S3).
 *
 * A workspace feature whose id is also a canon feature id is left out here as well as in `load.ts`:
 * canon wins, and the merge never lets one id have two origins.
 */
import type { FeatureCollection } from '../evidence';

export type Origin = 'canon' | 'workspace';

export type Merged = {
  /** Canon collections first, in their order, then the workspace's. */
  collections: FeatureCollection[];
  /** Ids of the workspace features that are in `collections`. */
  workspaceFeatureIds: ReadonlySet<string>;
  originOf(featureId: string): Origin;
};

export function mergeForDisplay(canon: readonly FeatureCollection[], workspace: readonly FeatureCollection[]): Merged {
  const canonIds = new Set<string>();
  for (const c of canon) for (const f of c.features) canonIds.add(f.id);

  const workspaceIds = new Set<string>();
  const kept: FeatureCollection[] = [];
  for (const collection of workspace) {
    const features = collection.features.filter((f) => !canonIds.has(f.id) && !workspaceIds.has(f.id));
    for (const f of features) workspaceIds.add(f.id);
    if (features.length > 0) kept.push({ ...collection, features });
  }

  return {
    collections: [...canon, ...kept],
    workspaceFeatureIds: workspaceIds,
    originOf: (featureId) => (workspaceIds.has(featureId) ? 'workspace' : 'canon'),
  };
}

/** The line a view model adds to a workspace item. */
export const WORKSPACE_NOTE = "Not part of Buried's reviewed record.";
