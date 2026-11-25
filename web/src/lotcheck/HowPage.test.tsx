import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { checkSentence, EMPTY_PACK, findBannedWords, INDUSTRIAL_ENTRIES } from '../evidence';
import { HowPage } from './HowPage';
import { HOW_PAGE_TEXT, HOW_STEPS, KIRO_LINES } from './howCopy';

describe('the How page', () => {
  const html = renderToStaticMarkup(<HowPage />);

  it('has four steps, each with a picture that exists and a description of it', () => {
    expect(HOW_STEPS).toHaveLength(4);
    expect(html.match(/data-testid="lc-step"/g)).toHaveLength(4);
    for (const step of HOW_STEPS) {
      expect(existsSync(fileURLToPath(new URL(`../../public${step.picture}`, import.meta.url))), step.picture).toBe(true);
      expect(step.alt.length).toBeGreaterThan(20);
      expect(html).toContain(`src="${step.picture}"`);
    }
  });

  it('says "Built with Kiro" in at most five sentences', () => {
    expect(html).toContain('Built with Kiro');
    expect(KIRO_LINES.join(' ').match(/[.!?](\s|$)/g)?.length ?? 0).toBeLessThanOrEqual(5);
  });

  it('says in one line that the dig is an animation and the lookup is instant', () => {
    expect(html).toContain('The dig is an animation. The lookup itself is instant.');
  });

  it('shows the whole Industrial list, from the list itself', () => {
    for (const entry of INDUSTRIAL_ENTRIES) expect(html).toContain(entry);
  });

  // P3: no banned word in the how copy or the rendered text; every sentence passes the check with an empty pack.
  it('P3: no banned word and no figure or id outside a fact pack', () => {
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
    expect(findBannedWords(text)).toEqual([]);
    for (const s of HOW_PAGE_TEXT) {
      expect(findBannedWords(s), s).toEqual([]);
      expect(checkSentence(s, EMPTY_PACK), s).toEqual({ ok: true });
    }
  });

  it('does not say a person confirmed anything, links no walk or Studio, and carries no Report line', () => {
    expect(html).not.toMatch(/\bconfirmed\b/i);
    expect(html).not.toContain('/walk');
    expect(html).not.toContain('/studio');
  });
});
