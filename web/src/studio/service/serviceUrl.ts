/**
 * Where the Studio finds its service (session 027, spec 04 group 15). The static site and the
 * Service live on different hosts, so the address is set when the site is built:
 *
 *   VITE_STUDIO_SERVICE_URL=https://buried-service.example.com   that origin
 *   VITE_STUDIO_SERVICE_URL=/                                    the page's own origin (a server that passes /v1 on)
 *   unset, in the dev server                                     the page's own origin (Vite proxies /v1)
 *   unset, in a production build                                 no service: the Studio says it is unavailable
 *
 * A value that is not "/" or an http(s) address counts as unset. The result is a base to put in front
 * of "/v1/...": "" for the same origin, an address without a trailing slash, or null for no service.
 */
export function resolveServiceBase(configured: string | undefined, dev: boolean): string | null {
  const value = (configured ?? '').trim();
  if (value === '') return dev ? '' : null;
  if (value === '/') return '';
  if (!/^https?:\/\/[^\s/?#]+(?:\/[^\s?#]*)?$/.test(value)) return null;
  return value.replace(/\/+$/, '');
}

/** The base for this build, read once from Vite's environment. */
export function studioServiceBase(): string | null {
  return resolveServiceBase(import.meta.env.VITE_STUDIO_SERVICE_URL as string | undefined, import.meta.env.DEV);
}
