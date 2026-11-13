import { useDocumentTitle } from './pageTitle';
import type { PageName } from './pageTitle';

/** Renders nothing; sets the page's title and description while it is on screen (session 031). */
export function SetPageTitle({ page, address = null }: { page: PageName; address?: string | null }) {
  useDocumentTitle(page, address);
  return null;
}
