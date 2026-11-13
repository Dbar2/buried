/**
 * Fixed Report copy (spec 05 design "Fixed copy"). Every string here passes `findBannedWords`
 * (copy.test.ts). None holds a figure or a source id, so none needs a fact pack.
 * The group headings are plain words (session 027): "Water", "What the land was used for",
 * "Old buildings and fill".
 *
 * Two URLs are not set yet: the City of Toronto's land acknowledgement page and its basement
 * flooding protection subsidy page. Spec 05 task 5.3 looks them up and link-checks them; they are
 * not guessed. Until then they are `null`, the Report leaves out the two sentences that link to
 * them, and nothing else changes.
 */
export const SCREENS_LINE = "Buried screens; it doesn't certify.";
export const TITLE = 'The documented history of this place.';
export const NOT_RECONSTRUCTED = 'Not reconstructed yet.';
export const COULD_NOT_PRODUCE = 'This report could not be produced.';
export const RECORDS_CHANGED = 'The records have changed since this link was made. This report uses the current records.';
export const COVERAGE_TODAY = 'Coverage today is one block of Toronto.';
export const NO_ADDRESS_HEADING = 'This lot';
export const NO_PLAN_SUMMARY = "No plan in Buried's published records covers this lot.";

export const CANNOT_CONDITION = 'These records cannot tell you about present-day soil, water or structural condition.';
export const CANNOT_UTILITIES = 'They do not show underground utilities.';
export const BEFORE_COLONIAL =
  'History before colonial maps is outside what these records cover. The records Buried uses begin with colonial-era mapping.';
export const LAND_ACKNOWLEDGEMENT_LINK = "Read the City of Toronto's land acknowledgement";

export const DIG_NOT_LOCATES = "Buried's maps are not utility locates.";
export const DIG_REQUEST = 'Request locates through Ontario Dig Authority before you dig.';
export const ONTARIO_DIG_AUTHORITY_URL = 'https://ontariodigauthority.ca/';
export const DIG_LINK_TEXT = 'Ontario Dig Authority';

export const NEXT_WATER =
  'Ask your inspector to look for signs of past water, and ask the seller about basement water. The City of Toronto offers basement flooding protection subsidies.';
export const NEXT_LAND_USE = 'If any of these uses was industrial or fuel-related, ask whether an environmental review exists before you dig.';
export const NEXT_STRUCTURES = 'Mention these records to your structural engineer before underpinning or extending.';

export const WORKSPACE_LINE =
  "These findings come from work saved in this browser. They are not part of Buried's published records, and the share link does not include them.";

/** Task 5.3 sets these. `null` means not looked up yet. */
export const CITY_LAND_ACKNOWLEDGEMENT_URL: string | null = null;
export const CITY_FLOOD_SUBSIDY_URL: string | null = null;

export const GROUP_HEADINGS = {
  water: 'Water',
  land_use: 'What the land was used for',
  structures: 'Old buildings and fill',
} as const;

export const SECTION_HEADINGS = {
  coreSample: 'Core sample',
  cannotTell: 'What these records cannot tell you',
  beforeYouDig: 'Before you dig',
  sources: 'Sources',
  workspace: 'From your workspace',
} as const;

/** Every fixed string, for the banned-word and wording tests. */
export const ALL_FIXED_COPY: readonly string[] = [
  SCREENS_LINE,
  TITLE,
  NOT_RECONSTRUCTED,
  COULD_NOT_PRODUCE,
  RECORDS_CHANGED,
  COVERAGE_TODAY,
  NO_ADDRESS_HEADING,
  NO_PLAN_SUMMARY,
  CANNOT_CONDITION,
  CANNOT_UTILITIES,
  BEFORE_COLONIAL,
  LAND_ACKNOWLEDGEMENT_LINK,
  DIG_NOT_LOCATES,
  DIG_REQUEST,
  DIG_LINK_TEXT,
  NEXT_WATER,
  NEXT_LAND_USE,
  NEXT_STRUCTURES,
  WORKSPACE_LINE,
  ...Object.values(GROUP_HEADINGS),
  ...Object.values(SECTION_HEADINGS),
];
