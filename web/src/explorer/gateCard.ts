/**
 * The gate version of the evidence card (spec 03 requirement 24.3): the feature id, the origin
 * source, the position phrase, who confirmed it and when, and the origin source's attribution line,
 * plus the confidence label and reason. The full card (dates, sources checked, crop) is task 5.1.
 *
 * Wording comes from the Evidence Library: the position phrase is `positionPhrase`, never written here.
 */
import type { EraFeature, Feature, SourceIndex } from '../evidence';
import { positionPhrase } from '../evidence';

export type CardRow = { label: string; value: string; mono: boolean };

export type GateCard = {
  heading: string;
  rows: CardRow[];
};

export const CONFIDENCE_LABELS: Readonly<Record<EraFeature['confidence'], string>> = {
  documented: 'Documented',
  estimated: 'Estimated',
  unknown: 'Unknown',
};

export class CardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CardError';
  }
}

export function buildGateCard(entry: EraFeature, feature: Feature, sources: SourceIndex): GateCard {
  if (feature.id !== entry.id) throw new CardError(`Era list entry ${entry.id} does not match feature ${feature.id}`);
  const provenance = feature.properties.provenance;
  const origin = sources.get(provenance.origin_source);
  if (!origin) throw new CardError(`Source ${provenance.origin_source} is not in the registry`);

  const kindName = entry.kind === 'building' ? 'Building' : entry.kind === 'water' ? 'Water' : 'Land use';
  return {
    heading: entry.attributes.use ?? kindName,
    rows: [
      { label: 'Feature', value: entry.id, mono: true },
      { label: 'Confidence', value: `${CONFIDENCE_LABELS[entry.confidence]}. ${entry.confidenceReason}`, mono: false },
      { label: 'Position', value: positionPhrase(entry.positionErrorM), mono: true },
      { label: 'Read from', value: `${origin.title} (${origin.id})`, mono: false },
      { label: 'Confirmed by', value: provenance.confirmed_by, mono: false },
      { label: 'Confirmed at', value: provenance.confirmed_at, mono: true },
      { label: 'Attribution', value: origin.attribution_line, mono: false },
    ],
  };
}
