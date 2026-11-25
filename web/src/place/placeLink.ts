/** The old place page link, `/place?lot=<id>`, with the era when one is asked for. It opens the Result (spec 08 requirement 1.1). */
export function placeLink(lotId: string, eraId: string | null = null): string {
  const parts = [`lot=${encodeURIComponent(lotId)}`];
  if (eraId !== null) parts.push(`era=${encodeURIComponent(eraId)}`);
  return `/place?${parts.join('&')}`;
}

/** The Result for a lot: `/lot/<lot id>` (spec 08). */
export function lotLink(lotId: string): string {
  return `/lot/${encodeURIComponent(lotId)}`;
}

/** Which page a path and query ask for (spec 08 design "Routes", requirement 1.1).
 *
 *  - `landing`: `/` with no query, and `/place` without a `lot`.
 *  - `lot`: `/lot/<lot id>`, and `/place` with a `lot` (the Result).
 *  - `how`: `/how`.
 *  - `block`: `/block` and `/find/<slug>` (shared find links keep working).
 *  - `explorer`: `/explorer`, and `/` with any query (the Studio's and the tests' `/?era=...&debug=1`
 *    links open the Explorer, as they always have).
 *  - `report`, `studio`, `sources`: as before.
 *  - `/walk` is not routed (parked on Nov 25): it falls through to the landing.
 */
export type Route = 'landing' | 'lot' | 'how' | 'block' | 'report' | 'studio' | 'sources' | 'explorer';

/** `/find/<slug>`: one path segment after `find`, no more. */
const FIND_PATH = /^\/find\/[^/]+$/;

/** `/lot/<lot id>`: one path segment after `lot`, no more. */
const LOT_PATH = /^\/lot\/[^/]+$/;

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

/** The lot a Result path or query names (`/lot/<id>` or `/place?lot=<id>`), decoded, or null. */
export function lotIdFor(pathname: string, search: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  try {
    if (LOT_PATH.test(path)) return decodeURIComponent(path.slice('/lot/'.length)) || null;
    if (path === '/place') return new URLSearchParams(search).get('lot') || null;
  } catch {
    return null;
  }
  return null;
}

export function routeFor(pathname: string, search: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/place') return new URLSearchParams(search).get('lot') ? 'lot' : 'landing';
  if (LOT_PATH.test(path)) return 'lot';
  if (path === '/how') return 'how';
  if (path === '/block') return 'block';
  if (path === '/report') return 'report';
  if (path === '/studio') return 'studio';
  if (path === '/sources') return 'sources';
  if (path === '/explorer') return 'explorer';
  if (FIND_PATH.test(path)) return 'block';
  return search.replace(/^\?/, '') === '' ? 'landing' : 'explorer';
}
