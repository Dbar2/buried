import { useEffect } from 'react';

/** The name of the site, last in every title: "541 and 543 Queen St E · Buried". */
export const SITE_NAME = 'Buried';

/** The description in `index.html`, and the one the landing keeps. */
export const SITE_DESCRIPTION =
  "Forgotten maps, rebuilt with proof. Type an address in the part of Toronto Buried covers and read what archival fire insurance plans show stood there. Buried screens; it doesn't certify.";

export type PageName = 'landing' | 'place' | 'report' | 'studio' | 'sources' | 'explorer';

/** The text before " · Buried" for each page; a place or a report is named by its address when it has one. */
const LABELS: Record<Exclude<PageName, 'landing' | 'place' | 'report'>, string> = {
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
