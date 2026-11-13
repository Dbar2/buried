/**
 * The export bundle (spec 04 design "Export bundle", requirement 16).
 *
 * A reviewer takes the published workspace for one plate out of the browser as a zip. The maintainer
 * reads it and reproduces it with the pipeline; only then does anything reach `data/`. The bundle
 * holds the proposal file and the decisions file the publish was made from, the evidence file the
 * Service returned (verbatim, as `expected/`), and a README that names the plate and the reviewer
 * and lists the steps. Texts are copied exactly as stored; nothing is re-serialised.
 *
 * This slice exports registered plates only. Their source record, control file and alignment record
 * are already in `data/`, so the bundle does not carry them. The upload id rewrite belongs with
 * uploads, which the Studio does not have yet.
 *
 * `importBundle` is the other direction: it puts a bundle made here back into a workspace, so that
 * a reviewer can move between browsers. It trusts nothing in the zip: every file is parsed and the
 * evidence file goes through the Schema before anything is stored.
 */
import { parseEvidenceFile } from '../evidence';
import type { FeatureCollection } from '../evidence';
import type { DecisionsV2 } from '../studio/service/types.generated';
import type { WorkspaceDb } from './db';
import { additionsText, workDecisionsPath, workEvidenceStoredPath, workExpectedPath, workProposalsPath } from './publish';
import { readZip, writeZip, ZipReadError } from './zip';
import type { ZipEntry } from './zip';

export const MAX_BUNDLE_BYTES = 20 * 1024 * 1024;

const SOURCE_ID = /^[a-z0-9_]+$/;

export function bundleFileName(sourceId: string, now: string): string {
  return `buried_export_${sourceId}_${now.slice(0, 10)}.zip`;
}

export type ExportResult =
  | { ok: true; fileName: string; bytes: Uint8Array; entries: string[] }
  | { ok: false; reason: string };

function bundlePaths(sourceId: string) {
  return {
    proposals: `data/work/proposals/${sourceId}.geojson`,
    decisions: `data/work/review/${sourceId}.json`,
    expected: `expected/data/evidence/${sourceId}.geojson`,
  };
}

function parseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** The README. Names the plate and the reviewer, says where the reviewed areas are, lists the steps. */
export function exportReadme(args: {
  sourceId: string;
  reviewers: readonly string[];
  exportedAt: string;
  newFeatureIds: readonly string[];
  reviewedAreas: number;
}): string {
  const p = bundlePaths(args.sourceId);
  const reviewer = args.reviewers.length > 0 ? args.reviewers.join(', ') : 'not recorded';
  const lines = [
    `# Buried export: ${args.sourceId}`,
    '',
    `Plate: ${args.sourceId}`,
    `Reviewer: ${reviewer}`,
    `Exported: ${args.exportedAt}`,
    `Buildings added in this review: ${args.newFeatureIds.length}`,
    `Reviewed areas: ${args.reviewedAreas}`,
    '',
    'This bundle comes from a visitor\'s workspace in the Buried Studio. Nothing in it is part of',
    "Buried's reviewed record until the maintainer has read it and reproduced it with the pipeline.",
    'The extraction proposed the outlines; the reviewer named above accepted or rejected each one.',
    '',
    '## Files',
    '',
    `- \`${p.proposals}\`: the proposals the review started from, verbatim.`,
    `- \`${p.decisions}\`: the reviewer's decisions (version 2), including the reviewed areas and who confirmed them.`,
    `- \`${p.expected}\`: the evidence file the Studio service returned, verbatim. Its \`reviewed_areas\` are the areas the reviewer attests are fully decided.`,
    '',
    '## Steps (from `pipeline/`)',
    '',
    `1. Check that \`${args.sourceId}\` is in \`data/sources.json\` and has an alignment record and a map area file. This bundle does not carry them.`,
    `2. \`uv run buried fetch ${args.sourceId}\` and \`uv run buried inspect ${args.sourceId}\`, if the plate is not in \`data/raw/\`.`,
    `3. Copy \`${p.proposals}\` and \`${p.decisions}\` into \`data/work/\` at the same paths.`,
    `4. \`uv run buried publish ${args.sourceId}\`.`,
    `5. Compare \`data/evidence/${args.sourceId}.geojson\` with \`${p.expected}\` byte for byte. If they differ, do not commit; find out why.`,
    '6. `uv run buried match`, then `uv run buried validate`.',
    '7. Read the new buildings in the Explorer, then commit.',
    '',
  ];
  return lines.join('\n');
}

/** Build the bundle for one plate from the workspace's stored publish. */
export async function buildExport(db: WorkspaceDb | null, sourceId: string, now: string): Promise<ExportResult> {
  if (!SOURCE_ID.test(sourceId)) return { ok: false, reason: 'That is not a source id.' };
  if (db === null) return { ok: false, reason: 'This browser cannot keep a workspace, so there is nothing to export.' };

  const [proposals, decisions, expected, additions] = await Promise.all([
    db.getFile(workProposalsPath(sourceId)),
    db.getFile(workDecisionsPath(sourceId)),
    db.getFile(workExpectedPath(sourceId)),
    db.getFile(workEvidenceStoredPath(sourceId)),
  ]);
  if (!additions || !proposals || !decisions || !expected) {
    return { ok: false, reason: `There is no published work for ${sourceId} in this workspace. Publish to your workspace first.` };
  }

  let collection: FeatureCollection;
  let newIds: string[];
  try {
    collection = parseEvidenceFile(expected.text, workExpectedPath(sourceId));
    newIds = parseEvidenceFile(additions.text, workEvidenceStoredPath(sourceId)).features.map((f) => f.id);
  } catch (error) {
    return { ok: false, reason: `The stored evidence for ${sourceId} does not pass the Schema, so it was not exported. ${error instanceof Error ? error.message : ''}`.trim() };
  }
  if (collection.origin_source !== sourceId) return { ok: false, reason: `The stored evidence names ${collection.origin_source}, not ${sourceId}.` };

  const parsedDecisions = parseJson<DecisionsV2>(decisions.text);
  if (!parsedDecisions || parsedDecisions.version !== 2 || parsedDecisions.source !== sourceId) {
    return { ok: false, reason: `The stored decisions are not a version 2 decisions file for ${sourceId}.` };
  }
  if (parseJson(proposals.text) === null) return { ok: false, reason: 'The stored proposals are not readable.' };

  const reviewers = [...new Set(parsedDecisions.reviewed_areas.map((a) => a.confirmed_by))].sort();
  const p = bundlePaths(sourceId);
  const entries: ZipEntry[] = [
    {
      path: 'README.md',
      text: exportReadme({ sourceId, reviewers, exportedAt: now, newFeatureIds: newIds, reviewedAreas: collection.reviewed_areas?.length ?? 0 }),
    },
    { path: p.proposals, text: proposals.text },
    { path: p.decisions, text: decisions.text },
    { path: p.expected, text: expected.text },
  ];
  return { ok: true, fileName: bundleFileName(sourceId, now), bytes: writeZip(entries, new Date(now)), entries: entries.map((e) => e.path) };
}

export type ImportResult = { ok: true; sourceId: string; featureIds: string[] } | { ok: false; reason: string };

/**
 * Put a bundle made by `buildExport` into a workspace. `canonIds` are the feature ids already in
 * Buried's records; a bundle's features with those ids are canon, not additions, and are not stored.
 */
export async function importBundle(db: WorkspaceDb | null, bytes: Uint8Array, canonIds: ReadonlySet<string>, now: string): Promise<ImportResult> {
  if (db === null) return { ok: false, reason: 'This browser cannot keep a workspace.' };
  if (bytes.length > MAX_BUNDLE_BYTES) return { ok: false, reason: 'This file is too large to be a Buried export.' };

  let entries: ZipEntry[];
  try {
    entries = readZip(bytes);
  } catch (error) {
    return { ok: false, reason: error instanceof ZipReadError ? error.message : 'This file could not be read.' };
  }
  const byPath = new Map(entries.map((e) => [e.path, e.text]));

  const expectedEntry = entries.find((e) => /^expected\/data\/evidence\/[a-z0-9_]+\.geojson$/.test(e.path));
  if (!expectedEntry) return { ok: false, reason: 'This is not a Buried export: it has no expected evidence file.' };
  const sourceId = expectedEntry.path.slice('expected/data/evidence/'.length, -'.geojson'.length);
  const p = bundlePaths(sourceId);
  if (!SOURCE_ID.test(sourceId) || p.expected !== expectedEntry.path) return { ok: false, reason: 'The bundle names an invalid source id.' };

  const proposals = byPath.get(p.proposals);
  const decisions = byPath.get(p.decisions);
  if (proposals === undefined || decisions === undefined) return { ok: false, reason: `The bundle is missing its proposals or decisions for ${sourceId}.` };
  const parsedDecisions = parseJson<DecisionsV2>(decisions);
  if (!parsedDecisions || parsedDecisions.version !== 2 || parsedDecisions.source !== sourceId) {
    return { ok: false, reason: `The bundle's decisions are not a version 2 decisions file for ${sourceId}.` };
  }
  if (parseJson(proposals) === null) return { ok: false, reason: "The bundle's proposals are not readable." };

  let collection: FeatureCollection;
  try {
    collection = parseEvidenceFile(expectedEntry.text, p.expected);
  } catch (error) {
    return { ok: false, reason: `The bundle's evidence file does not pass the Schema. ${error instanceof Error ? error.message : ''}`.trim() };
  }
  if (collection.origin_source !== sourceId) return { ok: false, reason: `The bundle's evidence names ${collection.origin_source}, not ${sourceId}.` };

  const featureIds = collection.features.map((f) => f.id).filter((id) => !canonIds.has(id));
  if (featureIds.length === 0) return { ok: false, reason: 'The bundle adds no buildings that are not already in Buried\'s records.' };

  let additions: string;
  try {
    additions = additionsText(expectedEntry.text, featureIds, workEvidenceStoredPath(sourceId));
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
  await db.putFile(workEvidenceStoredPath(sourceId), additions, now);
  await db.putFile(workProposalsPath(sourceId), proposals, now);
  await db.putFile(workDecisionsPath(sourceId), decisions, now);
  await db.putFile(workExpectedPath(sourceId), expectedEntry.text, now);
  return { ok: true, sourceId, featureIds };
}

/** Offer bytes to the visitor as a download. Browser only. */
export function downloadBytes(fileName: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/zip' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
