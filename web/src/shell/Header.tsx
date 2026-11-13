import { Mark } from './Mark';

/**
 * The Shell's header (design.md "Identity", "Place page layout"): the core-sample mark and the
 * wordmark "Buried" in Fraunces at the left, then the address of the place on screen when there is
 * one, then the nav (Explorer, Studio, Sources) with a `lantern` underline on the active item. No
 * router library: a link is a full page load. The Report and the place page are not nav items; they
 * are what a search opens.
 */
export type HeaderPage = 'explorer' | 'studio' | 'report' | 'place' | 'sources';

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
        <a href="/explorer" aria-current={current === 'explorer' ? 'page' : undefined} data-testid="nav-explorer">
          Explorer
        </a>
        <a href="/studio" aria-current={current === 'studio' ? 'page' : undefined} data-testid="nav-studio">
          Studio
        </a>
        <a href="/sources" aria-current={current === 'sources' ? 'page' : undefined} data-testid="nav-sources">
          Sources
        </a>
      </nav>
    </header>
  );
}
