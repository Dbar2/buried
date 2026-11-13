import { SetPageTitle } from '../shell/SetPageTitle';
import './block.css';

/** The headline, the button label and the line under it (spec 06 requirement 1.1). */
export const BLOCK_HEADLINE = 'Something used to stand here.';
export const BLOCK_LINE = 'Every ghost comes with the map that proves it.';
export const RAISE_LABEL = 'Raise the past';

/** For now "Raise the past" opens the Explorer at the 1911 era. Part two (task W3) replaces it. */
export const RAISE_PLACEHOLDER_HREF = '/?era=1911';

/** The block the scene shows, as the margin caption names it (product.md "Showcase area"). */
export const BLOCK_CAPTION = 'Eastern Avenue at the Don River, Toronto.';

/**
 * The Block page (`/` and `/find/<slug>`), a placeholder until spec 06 tasks W3 to W12 replace its
 * insides: the headline, the line, a button that is not yet the Raise button, and the margin
 * caption with the link to the address search. It shows no search field and none of the Report's
 * wording (requirement 1.3, 1.4).
 */
export function BlockPage() {
  return (
    <main className="block-page" data-testid="block-page">
      <SetPageTitle page="block" />
      <div className="block-intro">
        <h1 className="block-headline">{BLOCK_HEADLINE}</h1>
        {/* An anchor, not a button: until Raise exists it can only go to the Explorer. It looks
            unavailable (outlined, dim) and stays in the tab order. */}
        <a className="block-raise" href={RAISE_PLACEHOLDER_HREF} data-testid="raise-button">
          {RAISE_LABEL}
        </a>
        <p className="block-line">{BLOCK_LINE}</p>
      </div>
      <p className="block-caption" data-testid="block-caption">
        <span>{BLOCK_CAPTION}</span>{' '}
        <a href="/place" data-testid="look-up-address">
          Look up an address
        </a>
      </p>
    </main>
  );
}
