/**
 * The Shell's header (design.md "Layout"): the wordmark "Buried" in Fraunces at the left, links to
 * the Explorer and to Sources in Inter at the right, on `night`. No router library: a link is a
 * full page load, which is enough for two routes.
 */
export type HeaderPage = 'explorer' | 'sources';

export function Header({ current }: { current: HeaderPage }) {
  return (
    <header className="site-header">
      <a className="wordmark" href="/" data-testid="wordmark">
        Buried
      </a>
      <nav className="site-nav" aria-label="Pages">
        <a href="/" aria-current={current === 'explorer' ? 'page' : undefined} data-testid="nav-explorer">
          Explorer
        </a>
        <a href="/sources" aria-current={current === 'sources' ? 'page' : undefined} data-testid="nav-sources">
          Sources
        </a>
      </nav>
    </header>
  );
}
