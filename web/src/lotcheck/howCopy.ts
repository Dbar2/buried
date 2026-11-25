/**
 * The words of the How page (spec 08 requirement 6). Plain sentences with no figure and no id, so none needs a
 * fact pack; howCopy.test.ts checks every one against `checkSentence` and the banned words.
 */
export const HOW_KICKER = 'HOW IT WORKS';
export const HOW_TITLE = 'From an old plan to a lot check';

export type HowStep = { heading: string; body: string; picture: string; alt: string };

export const HOW_STEPS: readonly HowStep[] = [
  {
    heading: 'A plan is read.',
    body: 'Buried holds scans of fire insurance plans of one block of Toronto. A plan letters what stood on each lot: a yard, a shed, a mill. The scan is shown as it was digitized, with nothing toned or sharpened.',
    picture: '/lotcheck/how-1-plan.jpg',
    alt: 'A crop of the earlier plan, with the lettering "Coal & Wood Yard" beside the name of a company.',
  },
  {
    heading: 'A person marks the outline.',
    body: 'A person traces the outline of each yard or building and writes down the lettering exactly as it reads. A tracing is labelled a draft until a named person has checked it against the scan.',
    picture: '/lotcheck/how-2-outline.jpg',
    alt: 'The same crop of the earlier plan, with the traced outline of the yard drawn over it.',
  },
  {
    heading: "The outline is placed on today's map, with a stated error.",
    body: "Each plan is lined up with the City of Toronto's map of today, and the distance it may be out is measured and printed in metres. A lot check says a use is on a lot only when the outline overlaps the lot by more than that error.",
    picture: '/lotcheck/how-3-placed.jpg',
    alt: "The plan on the left of a line and today's building outlines on the right, with the same yard outline across both.",
  },
  {
    heading: 'The lettering is checked against a word list.',
    body: 'Code, not a model, compares the lettering with one list of words. A match gives the tag you see on a lot, with the lettering and the crop it was read from. No match is not a clearance: the plans cover only some years, and say nothing about the land today.',
    picture: '/lotcheck/how-4-lettering.jpg',
    alt: 'A crop of the later plan with the lettering "Coal & Wood Yard" and a different company name.',
  },
];

export const LIST_NOTE = 'The maintainer reviews this list. It has not been signed off yet.';

/** The one line about the dig (product.md rule 17): it is presentation. */
export const DIG_NOTE = 'The dig is an animation. The lookup itself is instant.';

export const KIRO_HEADING = 'Built with Kiro';
export const KIRO_LINES: readonly string[] = [
  'Kiro agents propose work, and a person confirms every outline before it is published.',
  'Specs and steering files set the rules, and tests check them.',
  'Hooks stop writes that break a rule, such as touching the held-out plate.',
  'A read-only server answers what the records show at an address from the evidence files, and works out no dates.',
];

export const HOW_PAGE_TEXT: readonly string[] = [HOW_KICKER, HOW_TITLE, ...HOW_STEPS.flatMap((s) => [s.heading, s.body, s.alt]), LIST_NOTE, DIG_NOTE, KIRO_HEADING, ...KIRO_LINES];
