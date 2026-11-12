/**
 * Findings (spec 01 requirement 14): the only way to make one is through the constructors here,
 * so a finding without a source, with an unregistered source, or with a banned word cannot exist.
 *
 * Which findings a Report contains and how its sentences read is the Report spec's job. This
 * module guarantees the invariants and nothing else.
 */
import type { LotRelation } from './lot';
import type { SourceIndex } from './sources';
import { HonestyError, findBannedWords } from './text';
import type { Visibility } from './dates';

export type FindingStatus = 'documented' | 'estimated' | 'nothing_found' | 'not_covered';

/** One record that was looked at, with the years the Registry gives its source. */
export type CheckedRecord = {
  sourceId: string;
  yearFrom: number;
  yearTo: number;
  visibility: Visibility;
};

type NonEmpty<T> = [T, ...T[]];

export type Finding =
  | {
      status: 'documented' | 'estimated';
      text: string;
      sourceIds: NonEmpty<string>;
      featureIds: string[];
      relation: LotRelation;
    }
  | {
      status: 'nothing_found' | 'not_covered';
      text: string;
      sourceIds: NonEmpty<string>;
      checked: NonEmpty<CheckedRecord>;
    };

export type FindingInput = {
  status: 'documented' | 'estimated';
  text: string;
  sourceIds: readonly string[];
  featureIds?: readonly string[];
  relation: LotRelation;
};

/** What the caller says was checked. The years are looked up, never taken from the caller. */
export type CheckedInput = { sourceId: string; visibility: Visibility };

const LABELS: Record<FindingStatus, string> = {
  documented: 'Documented',
  estimated: 'Estimated',
  nothing_found: 'Nothing found in these records',
  not_covered: 'Not covered',
};

/** The label shown for a status. */
export function statusLabel(status: FindingStatus): string {
  return LABELS[status];
}

function checkText(text: string): void {
  const banned = findBannedWords(text);
  if (banned.length > 0) {
    throw new HonestyError(`finding text contains a banned word: ${banned.join(', ')}`);
  }
}

function checkSources(ids: readonly string[], sources: SourceIndex): NonEmpty<string> {
  if (ids.length === 0) throw new HonestyError('a finding needs at least one source id');
  const unknown = ids.filter((id) => !sources.has(id));
  if (unknown.length > 0) {
    throw new HonestyError(`source ids not in the registry: ${[...new Set(unknown)].sort().join(', ')}`);
  }
  const unique = [...new Set(ids)].sort();
  return unique as NonEmpty<string>;
}

/** A Documented or Estimated finding. Throws `HonestyError` for no source ids, a source id that is
 * not registered, or a banned word in the text. */
export function createFinding(input: FindingInput, sources: SourceIndex): Finding {
  const sourceIds = checkSources(input.sourceIds, sources);
  checkText(input.text);
  return {
    status: input.status,
    text: input.text,
    sourceIds,
    featureIds: [...new Set(input.featureIds ?? [])].sort(),
    relation: input.relation,
  };
}

function createChecked(
  status: 'nothing_found' | 'not_covered',
  text: string,
  checked: readonly CheckedInput[],
  sources: SourceIndex,
): Finding {
  if (checked.length === 0) {
    throw new HonestyError(`a "${statusLabel(status)}" finding must list the records checked`);
  }
  checkSources(
    checked.map((c) => c.sourceId),
    sources,
  );
  checkText(text);

  const bySource = new Map<string, CheckedRecord>();
  for (const c of checked) {
    const source = sources.get(c.sourceId);
    if (source === undefined || source.year_from === null) {
      throw new HonestyError(`source ${c.sourceId} has no start year yet, so it cannot be listed as checked`);
    }
    const seen = bySource.get(c.sourceId);
    if (seen !== undefined && seen.visibility !== c.visibility) {
      throw new HonestyError(
        `source ${c.sourceId} is listed as both ${seen.visibility} and ${c.visibility}; a record is listed once`,
      );
    }
    bySource.set(c.sourceId, {
      sourceId: c.sourceId,
      yearFrom: source.year_from,
      yearTo: source.year_to,
      visibility: c.visibility,
    });
  }
  const records = [...bySource.values()].sort(
    (a, b) => a.yearFrom - b.yearFrom || (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0),
  ) as NonEmpty<CheckedRecord>;
  return {
    status,
    text,
    sourceIds: [...bySource.keys()].sort() as NonEmpty<string>,
    checked: records,
  };
}

/**
 * "Nothing found in these records". Requires the records checked, `obscured` and `not_covered`
 * ones included, and stores each with its source's years from the registry. `sourceIds` is derived
 * from them. A source listed twice with the same visibility is listed once; with two visibilities
 * it is refused.
 */
export function createNothingFound(
  text: string,
  checked: readonly CheckedInput[],
  sources: SourceIndex,
): Finding {
  return createChecked('nothing_found', text, checked, sources);
}

/** "Not covered": the same rules as `createNothingFound`, with the other status. */
export function createNotCovered(
  text: string,
  checked: readonly CheckedInput[],
  sources: SourceIndex,
): Finding {
  return createChecked('not_covered', text, checked, sources);
}

function yearsText(yearFrom: number, yearTo: number): string {
  return yearFrom === yearTo ? String(yearFrom) : `${yearFrom}–${yearTo}`;
}

/** One line per checked record: `<source id> (<year_from>–<year_to>, <visibility>)`, with a single
 * year when the two are equal. Empty for a Documented or Estimated finding. */
export function checkedRecordsText(finding: Finding): string[] {
  if (!('checked' in finding)) return [];
  return finding.checked.map(
    (r) => `${r.sourceId} (${yearsText(r.yearFrom, r.yearTo)}, ${r.visibility})`,
  );
}
