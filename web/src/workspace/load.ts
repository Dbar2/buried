/**
 * Loads the workspace's evidence files for display (spec 04 design "Loading").
 *
 * Each file is validated against the Schema, must cite only sources the canon registry knows, and
 * loses any feature whose id is also a canon feature id (canon wins; one sentence in `problems`).
 * A file that fails is left out whole and reported. Nothing here changes canon.
 *
 * This slice stores a published plate's *additions*: the features a publish added to a registered
 * plate, not the canon features beside them. So, unlike a workspace source with its own plate, a
 * workspace evidence file for a source that has canon evidence is accepted, and only its new
 * features are kept. A feature id already in canon is never kept.
 */
import { evidenceSourceProblem } from '../data/loadData';
import { parseEvidenceFile } from '../evidence';
import type { FeatureCollection, SourceIndex } from '../evidence';
import type { WorkspaceDb } from './db';

export const WORKSPACE_EVIDENCE_PREFIX = 'evidence/';

export type WorkspaceLoad = {
  collections: FeatureCollection[];
  /** One sentence per file or item that was left out. */
  problems: string[];
};

export async function loadWorkspaceEvidence(
  db: WorkspaceDb | null,
  canon: readonly FeatureCollection[],
  sources: SourceIndex,
): Promise<WorkspaceLoad> {
  if (db === null) return { collections: [], problems: [] };

  const canonIds = new Set<string>();
  for (const c of canon) for (const f of c.features) canonIds.add(f.id);

  const collections: FeatureCollection[] = [];
  const problems: string[] = [];
  let paths: string[];
  try {
    paths = await db.listFiles(WORKSPACE_EVIDENCE_PREFIX);
  } catch {
    return { collections: [], problems: ['Your workspace could not be read, so nothing from it is shown.'] };
  }

  for (const path of paths) {
    const left = (reason: string) => problems.push(`Your workspace file ${path} was left out: ${reason}.`);
    try {
      const file = await db.getFile(path);
      if (!file) continue;
      const collection = parseEvidenceFile(file.text, path);
      const problem = evidenceSourceProblem(collection, sources);
      if (problem) {
        left(problem);
        continue;
      }
      const features = collection.features.filter((f) => {
        if (!canonIds.has(f.id)) return true;
        problems.push(`Your workspace feature ${f.id} was left out: it conflicts with Buried's records.`);
        return false;
      });
      if (features.length > 0) collections.push({ ...collection, features });
    } catch (error) {
      left(error instanceof Error ? error.message : String(error));
    }
  }
  return { collections, problems };
}
