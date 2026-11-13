/**
 * Plain wording for sources and for how a feature came to be (product.md "Plain words in the body,
 * ids in the footnotes"). Body sentences say "the 1911 plan" and "the 1931-35 plan"; ids and plate
 * numbers stay in the sources block and in `title` text.
 *
 * Everything here is a pure function of facts in the record. Nothing is guessed: a feature is
 * "traced automatically" only when its provenance names an extraction parameter set.
 */
import type { Feature, Source } from './types.generated';
import type { SourceIndex } from './sources';

/** The year or years a plan or photograph is called by: "1911", "1931-35", "1947". */
export function plainYears(source: Pick<Source, 'id' | 'year_from' | 'year_to'>): string {
  const from = source.year_from;
  if (from === null) return String(source.year_to);
  const edition = /^fip_v\d+_(\d{4})_/.exec(source.id)?.[1];
  // A plan is named by its edition year when that is its first year ("1911"). When the edition year
  // is the last year of the range (the 1935 edition covers 1931 to 1935) the range is named.
  if (edition !== undefined && Number(edition) === from) return String(from);
  if (from === source.year_to) return String(from);
  return `${from}-${String(source.year_to % 100).padStart(2, '0')}`;
}

/** "the 1911 plan", "the 1931-35 plan", "the 1947 photograph". */
export function plainSourceName(source: Pick<Source, 'id' | 'type' | 'year_from' | 'year_to'>): string {
  const noun = source.type === 'aerial_photograph' ? 'photograph' : source.type === 'historical_map' ? 'map' : 'plan';
  return `the ${plainYears(source)} ${noun}`;
}

/** The numeric strings that appear in `plainSourceName`, for a sentence's fact pack. */
export function plainSourceNumbers(source: Pick<Source, 'id' | 'year_from' | 'year_to'>): string[] {
  return plainYears(source).match(/\d+/g) ?? [];
}

export type ProvenanceFacts = {
  /** The outline came from the extraction pipeline (its provenance names a parameter set). */
  tracedAutomatically: boolean;
};

/**
 * Whether a feature was traced automatically. Who confirmed it is never derived here: confidence says
 * how the footprint and storeys were read, not who checked them. The page shows the record's own
 * `confirmed_by` and `confirmed_at` (see `report/confirmed.ts`).
 */
export function provenanceFacts(feature: Pick<Feature, 'properties'>): ProvenanceFacts {
  return { tracedAutomatically: feature.properties.provenance.extraction_params_id !== undefined };
}

/** "traced automatically from" or "read from", the verb phrase before a plain source name. */
export function originPhrase(facts: ProvenanceFacts): string {
  return facts.tracedAutomatically ? 'traced automatically from' : 'read from';
}

const SOURCE_ID_TOKEN = /\b(?:fip|aerial|present|ws_upload)_[a-z0-9_]*[a-z0-9]/g;

/**
 * A recorded confidence reason in plain words. The record's own text can hold a source id ("Area and
 * use traced by a person from fip_v3_1911_229"). A body sentence names the source as "the 1911 plan"
 * and does not say who traced it: that comes only from the record's "Status" line. So a
 * registered id becomes its plain name, an id nobody registered becomes "the source", and "traced by
 * a person" becomes "traced". Text with no id and no such phrase is returned unchanged.
 */
export function plainReason(reason: string, sources: SourceIndex): string {
  return reason
    .replace(SOURCE_ID_TOKEN, (token) => {
      const source = sources.get(token);
      return source ? plainSourceName(source) : 'the source';
    })
    .replace(/\btraced by a person\b/gi, (m) => (m.charAt(0) === 'T' ? 'Traced' : 'traced'));
}
