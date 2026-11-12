/**
 * Era order for the Explorer (spec 03 requirement 8.1): depth 0 is Today, the highest index is the
 * earliest era. Eras are sorted by year_to descending, then year_from descending, then id.
 */
import type { Era } from '../evidence';

export type EraInfo = {
  id: string;
  /** The depth of this era: 0 is Today. */
  index: number;
  label: string;
  yearFrom: number;
  yearTo: number;
};

export function eraOrder(eras: readonly Era[]): EraInfo[] {
  return [...eras]
    .sort((a, b) => b.year_to - a.year_to || b.year_from - a.year_from || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((era, index) => ({
      id: era.id,
      index,
      label: era.label,
      yearFrom: era.year_from,
      yearTo: era.year_to,
    }));
}

/** What crosses the bridge about an era: its id and index, never its years. */
export function eraRefs(order: readonly EraInfo[]): Array<{ id: string; index: number }> {
  return order.map((era) => ({ id: era.id, index: era.index }));
}
