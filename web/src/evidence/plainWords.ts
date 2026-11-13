/**
 * Plain wording for sources and for how a feature came to be (product.md "Plain words in the body,
 * ids in the footnotes"). Body sentences say "the 1911 plan" and "the 1931-35 plan"; ids and plate
 * numbers stay in the sources block and in `title` text.
 *
 * Everything here is a pure function of facts in the record. Nothing is guessed: a feature is
 * "traced automatically" only when its provenance names an extraction parameter set, and "checked by
 * a person" only when its confidence is `documented`.
 */
import type { Feature, Source } from './types.generated';

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
  /** A person has checked it: the feature's confidence is `documented`. */
  checkedByPerson: boolean;
};

export function provenanceFacts(feature: Pick<Feature, 'properties'>): ProvenanceFacts {
  return {
    tracedAutomatically: feature.properties.provenance.extraction_params_id !== undefined,
    checkedByPerson: feature.properties.confidence === 'documented',
  };
}

/** "traced automatically from" or "read from", the verb phrase before a plain source name. */
export function originPhrase(facts: ProvenanceFacts): string {
  return facts.tracedAutomatically ? 'traced automatically from' : 'read from';
}

/** "Checked by a person." or "Not yet checked by a person." */
export function checkedSentence(facts: ProvenanceFacts): string {
  return facts.checkedByPerson ? 'Checked by a person.' : 'Not yet checked by a person.';
}
