import { EvidenceLoadError } from './load';
import type { Source, SourceRegistry } from './types.generated';

export type SourceIndex = ReadonlyMap<string, Source>;

/** The registry as a map by id. Throws on a duplicate id. */
export function indexSources(registry: SourceRegistry): SourceIndex {
  const index = new Map<string, Source>();
  for (const source of registry.sources) {
    if (index.has(source.id)) {
      throw new EvidenceLoadError('data/sources.json', 'sourceRegistry', `duplicate source id ${source.id}`);
    }
    index.set(source.id, source);
  }
  return index;
}

/**
 * The one place source years are worded for display (spec 03 card, spec 04 Studio, spec 05
 * Report; spec 01 requirement 24.1). A `years_label` wins ("1931, revised to 1935"); otherwise
 * the range with an en dash ("1911–1914") or the single year ("1947"). A source with no start
 * year yet (a present-day layer awaiting its CKAN refresh year) shows its end year alone. The
 * date logic never calls this: it reads `year_from` and `year_to`.
 */
export function sourceYearsText(source: Pick<Source, 'year_from' | 'year_to' | 'years_label'>): string {
  if (source.years_label !== undefined && source.years_label !== '') return source.years_label;
  if (source.year_from === null || source.year_from === source.year_to) return String(source.year_to);
  return `${source.year_from}–${source.year_to}`;
}

/** A source's year range, for the date logic. Throws if the source is unknown or has no start year yet. */
export function yearRange(index: SourceIndex, sourceId: string): { yearFrom: number; yearTo: number } {
  const source = index.get(sourceId);
  if (!source) {
    throw new EvidenceLoadError('data/sources.json', 'sourceRegistry', `source ${sourceId} is not registered`);
  }
  if (source.year_from === null) {
    throw new EvidenceLoadError(
      'data/sources.json',
      'sourceRegistry',
      `source ${sourceId} has no year_from yet, so it cannot be dated`,
    );
  }
  return { yearFrom: source.year_from, yearTo: source.year_to };
}
