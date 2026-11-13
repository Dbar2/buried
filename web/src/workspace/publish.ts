/**
 * Keeping a publish result in the workspace (spec 04 design "Publish").
 *
 * The Service returns the whole would-be evidence file for the plate: the canon features and the new
 * ones. Only the new ones belong to the workspace, so that is what is stored, under
 * `evidence/<source id>.geojson`. Canon is never written. Nothing is stored unless the Service said
 * `ok` and the stored text itself passes the Schema (property S1, web half: publish never stores a
 * feature the validator rejected). A later publish for the same plate replaces the earlier file,
 * because the decisions it was built from are the whole review.
 */
import { parseEvidenceFile } from '../evidence';
import type { PublishResponse } from '../studio/service/types.generated';
import type { WorkspaceDb } from './db';
import { WORKSPACE_EVIDENCE_PREFIX } from './load';

export const WORKSPACE_PUBLISHED_STATEMENT =
  "Published to your workspace on this device. It is not part of Buried's reviewed record.";

export function workspaceEvidencePath(sourceId: string): string {
  return `${WORKSPACE_EVIDENCE_PREFIX}${sourceId}.geojson`;
}
/** Same as `workspaceEvidencePath`; the name the export code reads best with. */
export const workEvidenceStoredPath = workspaceEvidencePath;

/** The file text holding only the features this publish added. Throws if it is not a valid file. */
export function additionsText(evidenceFileText: string, newFeatureIds: readonly string[], path: string): string {
  const whole = JSON.parse(evidenceFileText) as { features: Array<{ id: string }> } & Record<string, unknown>;
  const keep = new Set(newFeatureIds);
  const additions = { ...whole, features: whole.features.filter((f) => keep.has(f.id)) };
  const text = `${JSON.stringify(additions, null, 2)}\n`;
  parseEvidenceFile(text, path); // throws when the Schema rejects it
  return text;
}

export type StoreResult = { stored: true; featureIds: string[] } | { stored: false; reason: string };

/** The review inputs of a publish, kept so the workspace can be exported (spec 04 design "Export bundle"). */
export type PublishWork = { proposalFileText: string; decisionsText: string };

export const workProposalsPath = (sourceId: string) => `work/proposals/${sourceId}.geojson`;
export const workDecisionsPath = (sourceId: string) => `work/review/${sourceId}.json`;
/** The whole evidence file the Service returned, verbatim: what `buried publish` should reproduce. */
export const workExpectedPath = (sourceId: string) => `work/expected/${sourceId}.geojson`;

export async function storePublished(
  db: WorkspaceDb | null,
  sourceId: string,
  response: PublishResponse,
  now: string,
  work?: PublishWork,
): Promise<StoreResult> {
  if (!response.ok) return { stored: false, reason: 'The Service did not accept the publish.' };
  if (db === null) return { stored: false, reason: 'This browser cannot keep a workspace (IndexedDB is not available).' };
  const path = workspaceEvidencePath(sourceId);
  let text: string;
  try {
    text = additionsText(response.evidence_file_text, response.new_feature_ids, path);
  } catch (error) {
    return { stored: false, reason: error instanceof Error ? error.message : String(error) };
  }
  await db.putFile(path, text, now);
  if (work) {
    await db.putFile(workProposalsPath(sourceId), work.proposalFileText, now);
    await db.putFile(workDecisionsPath(sourceId), work.decisionsText, now);
    await db.putFile(workExpectedPath(sourceId), response.evidence_file_text, now);
  }
  return { stored: true, featureIds: [...response.new_feature_ids] };
}
