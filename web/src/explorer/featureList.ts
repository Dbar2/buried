/**
 * The list view (session 029, design.md "Accessibility"): the text equivalent of the ghosts for the
 * era on screen. One row per entry of the era's list, in the list's order, with the words the record
 * has: the use as lettered (or the kind), the date window the Evidence Library worded, the confidence
 * label, the position phrase and the review status line ("Status: draft, not yet reviewed"). Pure.
 */
import { findBannedWords, positionPhrase } from '../evidence';
import type { EraFeatureList, Feature } from '../evidence';
import { reviewOf, statusSentence } from '../report/reviewStatus';
import { CONFIDENCE_LABELS } from './gateCard';

export type FeatureRow = {
  id: string;
  /** The use as lettered, or the kind ("Building"). */
  name: string;
  /** The feature comes from the visitor's workspace, not from Buried's published records. */
  workspace: boolean;
  confidence: 'documented' | 'estimated' | 'unknown';
  confidenceLabel: string;
  /** "Positioned within about X m". */
  position: string;
  /** "Status: reviewed by <by>, <on>" or "Status: draft, not yet reviewed"; null when the feature record is not at hand. */
  status: string | null;
  /** The Evidence Library's date phrases ("Built by 1911"), as one line. */
  dates: string;
};

export function featureRows(list: EraFeatureList | undefined, features: ReadonlyMap<string, Feature>, workspaceIds: ReadonlySet<string> = new Set()): FeatureRow[] {
  return (list?.features ?? []).map((entry) => {
    const kindName = entry.kind === 'building' ? 'Building' : entry.kind === 'water' ? 'Water' : 'Land use';
    const use = entry.attributes.use;
    const feature = features.get(entry.id);
    return {
      id: entry.id,
      name: use !== undefined && findBannedWords(use).length === 0 ? use : kindName,
      workspace: workspaceIds.has(entry.id),
      confidence: entry.confidence,
      confidenceLabel: CONFIDENCE_LABELS[entry.confidence],
      position: positionPhrase(entry.positionErrorM),
      status: feature ? statusSentence(reviewOf(feature)).text : null,
      dates: entry.phrases.join('. '),
    };
  });
}
