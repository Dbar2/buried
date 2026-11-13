import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { descriptionFor, findDescriptionFor, findTitleFor, SITE_DESCRIPTION, titleFor } from './pageTitle';
import type { PageName } from './pageTitle';

const BANNED = /\b(contaminated|unsafe|safe|safer|safest|clean|cleaner|cleanest)\b|will flood/i;
const PAGES: PageName[] = ['block', 'landing', 'place', 'report', 'studio', 'sources', 'explorer'];

describe('page titles', () => {
  it('names a place by its address, then the site', () => {
    expect(titleFor('place', '541 and 543 Queen St E')).toBe('541 and 543 Queen St E · Buried');
    expect(titleFor('report', '541 and 543 Queen St E')).toBe('541 and 543 Queen St E · Buried');
  });

  it('has a plain title for every route, each ending with the site name', () => {
    expect(titleFor('place')).toBe('The place · Buried');
    expect(titleFor('report')).toBe('Report · Buried');
    expect(titleFor('studio')).toBe('Studio · Buried');
    expect(titleFor('sources')).toBe('Sources · Buried');
    expect(titleFor('explorer')).toBe('Explorer · Buried');
    expect(titleFor('landing')).toBe('Buried · What was here?');
    expect(titleFor('block')).toBe('Buried · Forgotten maps, rebuilt with proof.');
  });

  it('never writes a banned word, whatever the address', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PAGES), fc.option(fc.string({ maxLength: 30 }), { nil: null }), (page, address) => {
        // An address from the City's own layer is data; the words around it are ours.
        const safeAddress = address && BANNED.test(address) ? null : address;
        expect(titleFor(page, safeAddress)).not.toMatch(BANNED);
        expect(descriptionFor(page, safeAddress)).not.toMatch(BANNED);
      }),
    );
  });

  it('says what the page is and makes no finding about a lot', () => {
    expect(descriptionFor('place', '541 and 543 Queen St E')).toBe(
      "The documented history of 541 and 543 Queen St E, Toronto, from archival fire insurance plans. Buried screens; it doesn't certify.",
    );
    expect(descriptionFor('landing')).toBe(SITE_DESCRIPTION);
  });
});

describe('index.html', () => {
  const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');

  it('carries a title, a description and the Open Graph tags a crawler reads without running the script', () => {
    expect(html).toContain('<title>Buried · What was here?</title>');
    expect(html).toContain(`<meta name="description" content="${SITE_DESCRIPTION}" />`);
    for (const property of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:image', 'og:image:width', 'og:image:height', 'og:image:alt']) {
      expect(html, property).toContain(`property="${property}"`);
    }
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).not.toMatch(BANNED);
  });

  it('points og:image at the social card in public/, which exists, on the live site', () => {
    expect(html).toContain('content="https://buried.pages.dev/social-card.png"');
    expect(() => readFileSync(fileURLToPath(new URL('../../public/social-card.png', import.meta.url)))).not.toThrow();
  });
});

describe('the title and description of a find (spec 06 requirement 7.2)', () => {
  it('names the find as lettered and its plan, then the site', () => {
    expect(findTitleFor('Glove & Overall Factory', '1911 plan')).toBe('Glove & Overall Factory, 1911 plan · Buried');
  });

  it('says what the plan lettered, at the block, with the map that proves it, and finds nothing', () => {
    const text = findDescriptionFor('the 1911 plan');
    expect(text).toBe('Lettered on the 1911 plan at Queen Street East and River Street, Toronto, with the map that proves it.');
    expect(text).not.toMatch(BANNED);
  });
});
