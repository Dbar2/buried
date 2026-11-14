/** The place page for a lot: `/place?lot=<id>`, with the era when one is asked for. */
export function placeLink(lotId: string, eraId: string | null = null): string {
  const parts = [`lot=${encodeURIComponent(lotId)}`];
  if (eraId !== null) parts.push(`era=${encodeURIComponent(eraId)}`);
  return `/place?${parts.join('&')}`;
}

/** Which page a path and query ask for (spec 06 design "Routes and modules", requirement 7.3).
 *
 *  - `block`: `/` with no query, and `/find/<slug>`.
 *  - `explorer`: `/explorer`, and `/` with any query (the Studio's and the tests' `/?era=...&debug=1`
 *    links open the Explorer, as they always have).
 *  - `place`: `/place` with a `lot`; `search`: `/place` without one (the address search, once the
 *    landing).
 *  - `report`, `studio`, `sources`: as before.
 *  - `walk`: `/walk`, the walk test (spec 07). Not linked from anywhere.
 */
export type Route = 'block' | 'search' | 'place' | 'report' | 'studio' | 'sources' | 'explorer' | 'walk';

/** `/find/<slug>`: one path segment after `find`, no more. */
const FIND_PATH = /^\/find\/[^/]+$/;

/** The slug of a `/find/<slug>` path, decoded, or null when the path is not one. */
export function findSlugFor(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (!FIND_PATH.test(path)) return null;
  try {
    return decodeURIComponent(path.slice('/find/'.length));
  } catch {
    return null;
  }
}

export function routeFor(pathname: string, search: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/place') return new URLSearchParams(search).get('lot') ? 'place' : 'search';
  if (path === '/report') return 'report';
  if (path === '/studio') return 'studio';
  if (path === '/sources') return 'sources';
  if (path === '/explorer') return 'explorer';
  if (path === '/walk') return 'walk';
  if (FIND_PATH.test(path)) return 'block';
  return search.replace(/^\?/, '') === '' ? 'block' : 'explorer';
}
