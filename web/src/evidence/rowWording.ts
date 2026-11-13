/**
 * How a core-sample row names the plan an outline came from (spec 06 requirement 10, property P4).
 *
 * A row for plan X says what plan X shows. An outline first read from another plan Y is named in
 * that row only as "First drawn on the <Y> plan; drawn again on the <X> plan.", and only when plan X
 * has a clear presence for it. Where X has no clear presence the row does not name the outline's
 * origin at all: it is not X's to claim.
 *
 * Pure functions of the sources and the records' observations. Nothing is guessed.
 */
import { plainSourceName } from './plainWords';
import type { Feature, Source } from './types.generated';

export type RowPlan = Pick<Source, 'id' | 'type' | 'year_from' | 'year_to'>;

/** The phrase that carries the other plan's name, and nothing else may. Matched case-insensitively. */
export const FIRST_DRAWN_ON = 'First drawn on';

export type OutlineAttribution =
  /** The outline was first read from plan X itself: "read from the 1911 plan". */
  | { kind: 'read_here'; plan: RowPlan }
  /** First read from another plan; plan X shows it clearly too. */
  | { kind: 'drawn_again'; first: RowPlan; again: RowPlan }
  /** Plan X does not show it clearly, or its origin is not known: the row says nothing about it. */
  | { kind: 'not_shown' };

/** The ids of the sources that show the set clearly present (`present: true`, `visibility: clear`). */
export function clearPresenceSourceIds(members: ReadonlyArray<Pick<Feature, 'properties'>>): Set<string> {
  const ids = new Set<string>();
  for (const member of members) {
    for (const o of member.properties.observations) {
      if (o.present && o.visibility === 'clear') ids.add(o.source);
    }
  }
  return ids;
}

/**
 * What a row for the plan(s) in `rowPlans` may say about an outline whose origin is `origin`.
 * `rowPlans` are the sources whose years contain the row's era (two plates of one edition share a
 * plain name, "the 1911 plan"); `clearOn` are the ids of the sources that show the outline clearly.
 */
export function outlineAttribution(args: {
  origin: RowPlan | undefined;
  rowPlans: readonly RowPlan[];
  clearOn: ReadonlySet<string>;
}): OutlineAttribution {
  const { origin, rowPlans, clearOn } = args;
  if (!origin) return { kind: 'not_shown' };
  if (rowPlans.some((p) => p.id === origin.id)) return { kind: 'read_here', plan: origin };
  const again = [...rowPlans].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).find((p) => clearOn.has(p.id));
  if (!again) return { kind: 'not_shown' };
  // The same edition on another sheet is the same plan to a reader: nothing was "drawn again".
  if (plainSourceName(origin) === plainSourceName(again)) return { kind: 'read_here', plan: origin };
  return { kind: 'drawn_again', first: origin, again };
}

/** "First drawn on the 1911 plan; drawn again on the 1931-35 plan." */
export function firstDrawnText(first: RowPlan, again: RowPlan): string {
  return `${FIRST_DRAWN_ON} ${plainSourceName(first)}; drawn again on ${plainSourceName(again)}.`;
}
