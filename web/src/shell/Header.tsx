import { Mark } from './Mark';

/**
 * The Shell's header (design.md "Identity", "The raised scene and the card"; spec 06 requirement
 * 1.3): the core-sample mark and the wordmark "Buried" in Libre Baskerville at the left, a link to
 * `/`, then the address of the place on screen when there is one, then "Sources". Nothing else: the
 * Studio and the Explorer have no link here (the Sources page links the workshop). No router
 * library: a link is a full page load. `current` says which page is on screen; only Sources is a nav
 * item, so only it can be marked.
 */
export type HeaderPage = 'block' | 'search' | 'explorer' | 'studio' | 'report' | 'place' | 'sources';

export function Header({ current, address, era }: { current: HeaderPage; address?: string | null; era?: string | null }) {
  return (
    <header className="site-header">
      <a className="wordmark" href="/" data-testid="wordmark" aria-label="Buried, home">
        <Mark size={26} />
        <span>Buried</span>
      </a>
      {address ? (
        <p className="header-address" data-testid="header-address">
          {address}
        </p>
      ) : null}
      {era ? (
        <p className="header-era" data-testid="header-era">
          {era}
        </p>
      ) : null}
      <nav className="site-nav" aria-label="Pages">
        <a href="/sources" aria-current={current === 'sources' ? 'page' : undefined} data-testid="nav-sources">
          Sources
        </a>
      </nav>
    </header>
  );
}
