import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { copyLink, findLink, LINK_COPIED } from './share';

describe('share', () => {
  it('builds <origin>/find/<slug>', () => {
    expect(findLink('https://buried.pages.dev', 'overall-factory')).toBe('https://buried.pages.dev/find/overall-factory');
    expect(findLink('https://buried.pages.dev/', 'bank')).toBe('https://buried.pages.dev/find/bank');
  });

  it('property: a link is the origin, "/find/" and the slug, and routes back to the same slug', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z0-9]+(-[a-z0-9]+)*$/), (slug) => {
        const link = findLink('http://127.0.0.1:4173', slug);
        expect(link).toBe(`http://127.0.0.1:4173/find/${slug}`);
        expect(decodeURIComponent(new URL(link).pathname.slice('/find/'.length))).toBe(slug);
      }),
    );
  });

  it('copies through the clipboard', async () => {
    const copied: string[] = [];
    const outcome = await copyLink('https://x/find/a', { writeText: async (text) => void copied.push(text) });
    expect(outcome).toBe('copied');
    expect(copied).toEqual(['https://x/find/a']);
    expect(LINK_COPIED).toBe('Link copied.');
  });

  it('takes the refused path when the clipboard is missing, rejects, or throws', async () => {
    expect(await copyLink('l', undefined)).toBe('refused');
    expect(await copyLink('l', null)).toBe('refused');
    expect(await copyLink('l', { writeText: () => Promise.reject(new Error('denied')) })).toBe('refused');
    expect(
      await copyLink('l', {
        writeText: () => {
          throw new Error('no permission');
        },
      }),
    ).toBe('refused');
  });
});
