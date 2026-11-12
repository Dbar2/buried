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
