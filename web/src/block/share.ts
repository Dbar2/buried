/**
 * "Share this find" (spec 06 requirement 7.1): the link for a slug, and copying it. When the clipboard
 * is refused the Shell shows the link selected in a field instead.
 */

export const LINK_COPIED = 'Link copied.';

/** `<origin>/find/<slug>`. A trailing slash on the origin is dropped; the slug is encoded. */
export function findLink(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, '')}/find/${encodeURIComponent(slug)}`;
}

export type ClipboardLike = { writeText(text: string): Promise<void> };

/** `copied` once the clipboard took the link; `refused` when there is no clipboard or it said no. */
export type ShareOutcome = 'copied' | 'refused';

export async function copyLink(link: string, clipboard: ClipboardLike | null | undefined): Promise<ShareOutcome> {
  if (!clipboard) return 'refused';
  try {
    await clipboard.writeText(link);
    return 'copied';
  } catch {
    return 'refused';
  }
}
