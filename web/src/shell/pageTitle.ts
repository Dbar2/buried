import { useEffect } from 'react';

/** The name of the site, last in every title: "541 and 543 Queen St E · Buried". */
export const SITE_NAME = 'Buried';

/** The description in `index.html`, and the one the landing keeps. */
export const SITE_DESCRIPTION =
  "Forgotten maps, rebuilt with proof. Type an address in the part of Toronto Buried covers and read what archival fire insurance plans show stood there. Buried screens; it doesn't certify.";

export type PageName = 'block' | 'landing' | 'place' | 'report' | 'studio' | 'sources' | 'explorer';

/** The text before " · Buried" for each page; a place or a report is named by its address when it has one.
 *  `landing` is the address search at `/place`; `block` is the first-visit page at `/`. */
const LABELS: Record<Exclude<PageName, 'block' | 'landing' | 'place' | 'report'>, string> = {
  studio: 'Studio',
  sources: 'Sources',
  explorer: 'Explorer',
};

/**
 * The title of a page (pure, so a test can check every route). `address` is the first address the
 * records give the lot on screen, or null while it is not known.
 */
export function titleFor(page: PageName, address: string | null = null): string {
  switch (page) {
    case 'block':
      return `${SITE_NAME} · Forgotten maps, rebuilt with proof.`;
    case 'landing':
      return `${SITE_NAME} · What was here?`;
    case 'place':
      return address ? `${address} · ${SITE_NAME}` : `The place · ${SITE_NAME}`;
    case 'report':
      return address ? `${address} · ${SITE_NAME}` : `Report · ${SITE_NAME}`;
    default:
      return `${LABELS[page]} · ${SITE_NAME}`;
  }
}

/**
 * The title of `/find/<slug>` (spec 06 requirement 7.2): the find's name as lettered, then its plan, "Glove & Overall
 * Factory, 1911 plan · Buried". `plan` is the plain plan name without its article ("1911 plan").
 */
export function findTitleFor(name: string, plan: string): string {
  return `${name}, ${plan} · ${SITE_NAME}`;
}

/** The description of `/find/<slug>`. `plan` is the plain name with its article ("the 1911 plan"). */
export function findDescriptionFor(plan: string): string {
  return `Lettered on ${plan} at Queen Street East and River Street, Toronto, with the map that proves it.`;
}

/** Sets the title and description of a find's page while it is on screen. Crawlers still see the generic card (session 031). */
export function useFindDocumentTitle(title: string | null, description: string | null): void {
  useEffect(() => {
    if (title === null || description === null) return;
    document.title = title;
    const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (tag) tag.content = description;
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = title;
    const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (ogDescription) ogDescription.content = description;
  }, [title, description]);
}

/** The meta description of a page. It states only what the page is; it makes no finding about a lot. */
export function descriptionFor(page: PageName, address: string | null = null): string {
  switch (page) {
    case 'place':
    case 'report':
      return address
        ? `The documented history of ${address}, Toronto, from archival fire insurance plans. Buried screens; it doesn't certify.`
        : SITE_DESCRIPTION;
    case 'studio':
      return 'The Buried Studio: align a fire insurance plan to today\'s map, propose building footprints, review them and publish.';
    case 'sources':
      return 'Every source Buried uses, with its licence note and attribution line.';
    default:
      return SITE_DESCRIPTION;
  }
}

/** Sets `document.title` and the description meta tag for as long as the page is on screen. */
export function useDocumentTitle(page: PageName, address: string | null = null): void {
  useEffect(() => {
    document.title = titleFor(page, address);
    const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (tag) tag.content = descriptionFor(page, address);
    const ogTitle = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = titleFor(page, address);
    const ogDescription = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    if (ogDescription) ogDescription.content = descriptionFor(page, address);
  }, [page, address]);
}
