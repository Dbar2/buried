/**
 * The exhibit panel of the walk test (spec 07 requirement 5.2): the catalogue card of a find with the kicker "EXHIBIT.
 * LETTERED ON THE 1911 PLAN", then two lines that say what the walk takes from the plan and what it imagines. Every
 * sentence about the record comes from `findCardView` and the Evidence Library; this module adds only the three fixed
 * labels below and the storeys read from the feature, in words.
 */
import { findCardView } from '../block/blockModel';
import type { CardContext } from '../block/blockModel';
import type { CardViewModel } from '../block/FindCard';
import type { ResolvedFind } from '../block/finds';

export const EXHIBIT_KICKER_PREFIX = 'EXHIBIT. ';
export const IMAGINED_LINE = 'Imagined: the brick, the windows, the sign paint.';
export const BACK_TO_THE_STREET = 'Back to the street';

const WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;

/** "one storey", "three storeys"; null when the plan gives none. */
export function storeysInWords(storeys: number | undefined): string | null {
  if (storeys === undefined || !Number.isInteger(storeys) || storeys < 1) return null;
  const word = storeys <= WORDS.length ? WORDS[storeys - 1] : String(storeys);
  return `${word} ${storeys === 1 ? 'storey' : 'storeys'}`;
}

/** "From the plan: the outline, three storeys, the name." (no storeys: "From the plan: the outline, the name.") */
export function fromPlanLine(storeys: number | undefined): string {
  const words = storeysInWords(storeys);
  return `From the plan: the outline, ${words === null ? '' : `${words}, `}the name.`;
}

export type ExhibitView = {
  card: CardViewModel;
  fromPlan: string;
  imagined: string;
  back: string;
};

export type ExhibitContext = Pick<CardContext, 'model' | 'siteOrigin'>;

/** The exhibit for a find: the card with no actions of its own (the panel has one button), and the two labelled lines. */
export function exhibitView(find: ResolvedFind, ctx: ExhibitContext): ExhibitView {
  const card = findCardView(find, {
    ...ctx,
    eraId: '1911',
    anchorOffScreen: false,
    canShowOriginal: false,
    lotFor: null,
  });
  return {
    card: {
      ...card,
      kicker: `${EXHIBIT_KICKER_PREFIX}${card.kicker}`,
      rulerLine: null,
      actions: { showOriginalSheet: false, share: false, fullRecord: false, showOnMap: false },
      fullRecordHref: null,
      shareLink: null,
    },
    fromPlan: fromPlanLine(find.primary.feature.properties.attributes.storeys),
    imagined: IMAGINED_LINE,
    back: BACK_TO_THE_STREET,
  };
}
