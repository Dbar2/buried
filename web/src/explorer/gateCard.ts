/**
 * The gate version of the evidence card (spec 03 requirement 24.3): the feature id, the origin
 * source, the position phrase, who confirmed it and when, and the origin source's attribution line,
 * plus the confidence label and reason. The full card (dates, sources checked, crop) is task 5.1.
 *
 * Wording comes from the Evidence Library: the position phrase is `positionPhrase`, never written here.
 */
import type { EraFeature, Feature, SourceIndex } from '../evidence';
import { positionPhrase } from '../evidence';

export type CardRow = {
  label: string;
  value: string;
  mono: boolean;
  /** Shown as the element's `title` (a tooltip): the exact value behind a shortened display. */
  title?: string;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** "2026-11-12T21:32:05Z" as "12 Nov 2026, 21:32 UTC". An unparseable string is returned unchanged. */
export function formatUtc(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}, ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} UTC`;
}

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
      { label: 'Confirmed at', value: formatUtc(provenance.confirmed_at), mono: true, title: provenance.confirmed_at },
      { label: 'Attribution', value: origin.attribution_line, mono: false },
    ],
  };
}
