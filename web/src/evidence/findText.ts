/**
 * The words of a find's catalogue card (spec 06 requirements 4 and 5.3). Pure functions of facts in the record:
 * the source, the reading's lettered lines, the feature's storeys and position error. The card renders these
 * strings and builds none.
 *
 * A lettered line that holds a banned word is never quoted (requirement 4.3, product honesty rule 1): the card
 * says "Lettering shown in the crop" and the untouched crop carries the words.
 */
import type { Reading } from './finds.types.generated';
import { plainSourceName } from './plainWords';
import { positionPhrase } from './position';
import { findBannedWords } from './text';
import type { Source } from './types.generated';

export type PlanSource = Pick<Source, 'id' | 'type' | 'year_from' | 'year_to'>;

export const LETTERING_IN_CROP = 'Lettering shown in the crop';
export const NO_RECORD_LOADED = 'No record loaded for this date.';

/** "LETTERED ON THE 1911 PLAN" for a find, "DRAWN ON THE 1911 PLAN" for a ghost that is no find's feature. */
export function kickerText(source: PlanSource, kind: 'lettered' | 'drawn'): string {
  return `${kind === 'lettered' ? 'Lettered on' : 'Drawn on'} ${plainSourceName(source)}`.toUpperCase();
}

/**
 * The lettered lines to show, in order. A line with a banned word is replaced, in its place, by
 * "Lettering shown in the crop" (once, however many lines are replaced).
 */
export function letteredLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (findBannedWords(line).length > 0) {
      if (!out.includes(LETTERING_IN_CROP)) out.push(LETTERING_IN_CROP);
    } else out.push(line);
  }
  return out;
}

/** The sheet number of a plate id: `fip_v3_1911_229` is sheet "229". Null for an id that ends in no number. */
export function sheetNumber(sourceId: string): string | null {
  return /^[a-z]+_v\d+_\d{4}_(\d+)$/.exec(sourceId)?.[1] ?? null;
}

/** "Seen on: 1911 plan, sheet 229". The plain name without its article, then the sheet. */
export function seenOnText(source: PlanSource): string {
  const name = plainSourceName(source).replace(/^the /, '');
  const sheet = sheetNumber(source.id);
  return `Seen on: ${name}${sheet ? `, sheet ${sheet}` : ''}`;
}

/** "Positioned within about 4.5 m", from the one function that words a position error. */
export function findPositionLine(positionErrorM: number): string {
  return positionPhrase(positionErrorM);
}

const WORDS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six'] as const;

/**
 * The title of a ghost that is no find's feature (requirement 4.5): "<N>-storey building" in words for 1 to 6
 * when storeys are read, else "Building on the <plan> plan" ("Area on the <plan> plan" for a land-use area).
 */
export function ghostTitle(args: { kind: 'building' | 'water' | 'land_use'; storeys: number | undefined; source: PlanSource }): string {
  const { kind, storeys, source } = args;
  if (kind === 'building' && storeys !== undefined && Number.isInteger(storeys) && storeys >= 1 && storeys <= 6) {
    return `${WORDS[storeys - 1]}-storey building`;
  }
  const plan = plainSourceName(source);
  if (kind === 'land_use') return `Area on ${plan}`;
  if (kind === 'water') return `Water on ${plan}`;
  return `Building on ${plan}`;
}

/**
 * The extra line when the era ruler moves while a find is selected (requirement 5.3).
 *
 * `eraSources` are the plans loaded for the ruler's era, or null when the era has no plan (Today): then the
 * card adds nothing. `primary` is the reading the card opened on; the line is null when the era's reading is
 * that one, since the card already shows it.
 *  - a reading on a loaded plan: "On the 1931-35 plan this factory is lettered “Glove & Overall Fac.”."
 *  - a loaded plan with no reading: "No lettering recorded here from the 1931-35 plan."
 *  - no plan loaded for the era: "No record loaded for this date."
 */
export function rulerLine(args: {
  noun: string;
  readings: readonly Reading[];
  primary: Reading;
  eraSources: readonly PlanSource[] | null;
}): string | null {
  const { noun, readings, primary, eraSources } = args;
  if (eraSources === null) return null;
  if (eraSources.length === 0) return NO_RECORD_LOADED;
  const sorted = [...eraSources].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const source of sorted) {
    const reading = readings.find((r) => r.source === source.id);
    if (!reading) continue;
    if (reading === primary) return null;
    const plan = plainSourceName(source);
    const name = reading.lettered[0];
    if (findBannedWords(name).length > 0) return `On ${plan} this ${noun} is lettered; the words are shown in the original sheet.`;
    return `On ${plan} this ${noun} is lettered “${name}”.`;
  }
  return `No lettering recorded here from ${plainSourceName(sorted[0] as PlanSource)}.`;
}
