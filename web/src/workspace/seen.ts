/**
 * What the Explorer shows at once and what rises (spec 04 design "Rising into the Explorer").
 * A workspace feature the visitor has not yet seen in the Explorer is "unseen": the eras load without
 * it, and it then arrives by scene/addFeatures so that it rises. Pure.
 */
import type { Era } from '../evidence';

/** The workspace feature ids not yet recorded as seen, in the order given. */
export function unseenIds(workspaceIds: Iterable<string>, seen: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const id of workspaceIds) if (!seen.has(id)) out.push(id);
  return out;
}

/**
 * The era "View in Explorer" opens: the first, from the earliest, whose range lies inside the
 * source's year range. Null when none does (the Studio then says no Explorer era fits).
 */
export function eraForYears(eras: readonly Era[], yearFrom: number, yearTo: number): Era | null {
  const inside = eras.filter((e) => e.year_from >= yearFrom && e.year_to <= yearTo);
  inside.sort((a, b) => a.year_from - b.year_from || a.year_to - b.year_to || (a.id < b.id ? -1 : 1));
  return inside[0] ?? null;
}

export const NO_EXPLORER_ERA_MESSAGE = (years: string): string =>
  `No Explorer era falls within ${years}. Buildings from this source will not appear in the Explorer. They will appear in the Report.`;
