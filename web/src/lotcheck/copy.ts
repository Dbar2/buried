/**
 * Fixed texts of the lot check pages (spec 08). Every string here passes `findBannedWords`
 * (copy.test.ts) and holds no figure or id, so none needs a fact pack. Figures and names are built
 * with the sentence builder where they are used.
 */
import { plainYears } from '../evidence';
import type { SourceRegistry } from '../evidence';
import { joined, listOf, sentence, words } from '../report/sentence';
import type { Sentence, Slot } from '../report/sentence';

/** The five tags (product.md "The lot check", spec 08 requirement 4). */
export type LotTag = 'past_industrial' | 'industrial_next' | 'past_use' | 'no_industrial' | 'not_covered';

export const TAG_TEXT: Record<LotTag, string> = {
  past_industrial: 'Past industrial use recorded',
  industrial_next: 'Industrial use recorded next to this lot',
  past_use: 'A past use is lettered on these plans',
  no_industrial: 'No industrial use lettered on these plans',
  not_covered: 'Not covered yet',
};

/** Beside the tag "No industrial use lettered on these plans" (product rule 15). */
export const NOT_A_CLEARANCE = 'This is not a clearance. It says nothing about the land today.';

export const NOT_RECONSTRUCTED = 'Not reconstructed yet.';
export const COULD_NOT_PRODUCE = 'This check could not be produced.';

/** The row of a plan whose lettering holds a word this site does not print. */
export const WORDING_NOT_REPRODUCED = 'Its wording is not reproduced here. The crop shows it as lettered.';

/** The line under a use that the Industrial list matched: "Counts as industrial use (matched: coal)". */
export const countsAsIndustrial = (matched: string): string => `Counts as industrial use (matched: ${matched})`;

export const LOADING_PLAN = 'Loading the plan.';

/** The note where the compare frame reaches past the sheet's map area: "edge of sheet 229". */
export const edgeOfSheet = (sheet: string): string => `edge of sheet ${sheet}`;

export const SECTION = {
  plans: 'What the plans show',
  cannotTell: 'What this does not tell you',
  provenance: 'Where this comes from',
} as const;

export const ACTIONS = {
  download: 'Download the one-page record',
  share: 'Share this check',
  copied: 'Link copied.',
  block: 'See this block in 3D',
} as const;

export const LANDING = {
  kicker: 'A LOT CHECK FROM OLD FIRE-INSURANCE PLANS',
  headline: 'What was on this land?',
  line: 'Before you buy, dig or plant, see what the old plans recorded on your lot.',
  button: 'Check this address',
  fieldLabel: 'Address',
  fieldHint: 'For example 2A Percy St',
  try: 'Try:',
} as const;

/** Every fixed string, for the banned-word test. */
export const ALL_FIXED_COPY: readonly string[] = [
  ...Object.values(TAG_TEXT),
  NOT_A_CLEARANCE,
  NOT_RECONSTRUCTED,
  COULD_NOT_PRODUCE,
  WORDING_NOT_REPRODUCED,
  LOADING_PLAN,
  ...Object.values(SECTION),
  ...Object.values(ACTIONS),
  ...Object.values(LANDING),
];

// ---------- coverage line ----------

/** "1911-14", "1931-35", "1947": the years of a source as the coverage line writes them. */
function rangeText(from: number, to: number): string {
  return from === to ? String(from) : `${from}-${String(to % 100).padStart(2, '0')}`;
}

/**
 * "Covered so far: one block of Toronto. Plans of 1911-14 and 1931-35." The years come from the
 * registry's confirmed fire insurance plans, earliest first, each range once.
 */
export function coverageSentences(registry: SourceRegistry | undefined): Sentence[] {
  const plans = (registry?.sources ?? [])
    .filter((s) => s.type === 'fire_insurance_plan' && s.attribution_status === 'confirmed' && s.year_from !== null)
    .map((s) => ({ from: s.year_from as number, to: s.year_to }))
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const seen = new Set<string>();
  const slots: Slot[] = [];
  for (const p of plans) {
    const text = rangeText(p.from, p.to);
    if (seen.has(text)) continue;
    seen.add(text);
    slots.push({ text, numbers: text.match(/\d+/g) ?? [] });
  }
  const first = sentence`Covered so far: one block of Toronto.`;
  if (slots.length === 0) return [first];
  return [first, sentence`${words('Plans of ')}${listOf(slots)}.`];
}

/** The coverage sentences as one line of text. */
export const coverageText = (registry: SourceRegistry | undefined): string => coverageSentences(registry).map((s) => s.text).join(' ');

// ---------- plan lists ----------

/** "the 1911 and 1931-35 plans" (or "the 1911 plan"): a list of plan sources by their plain years. */
export function plansSlot(sources: ReadonlyArray<Parameters<typeof plainYears>[0]>, capital = false): Slot {
  const years: string[] = [];
  for (const s of sources) {
    const y = plainYears(s);
    if (!years.includes(y)) years.push(y);
  }
  const noun = years.length === 1 ? 'plan' : 'plans';
  const lead = capital ? 'The' : 'the';
  const slots = years.map((y): Slot => ({ text: y, numbers: y.match(/\d+/g) ?? [] }));
  return joined([words(`${lead} `), listOf(slots), words(` ${noun}`)], '');
}
