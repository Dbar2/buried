/** The place page for a lot: `/place?lot=<id>`, with the era when one is asked for. */
export function placeLink(lotId: string, eraId: string | null = null): string {
  const parts = [`lot=${encodeURIComponent(lotId)}`];
  if (eraId !== null) parts.push(`era=${encodeURIComponent(eraId)}`);
  return `/place?${parts.join('&')}`;
}

/** Which page a path and query ask for. `/` is the landing unless it carries a query: the Studio's and
 *  the tests' `/?era=...&debug=1` links open the Explorer, as they always have. */
export type Route = 'landing' | 'place' | 'report' | 'studio' | 'sources' | 'explorer';

export function routeFor(pathname: string, search: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/place') return 'place';
  if (path === '/report') return 'report';
  if (path === '/studio') return 'studio';
  if (path === '/sources') return 'sources';
  if (path === '/explorer') return 'explorer';
  return search.replace(/^\?/, '') === '' ? 'landing' : 'explorer';
}
