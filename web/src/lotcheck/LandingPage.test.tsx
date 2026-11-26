import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from '../evidence';
import { LandingPage } from './LandingPage';

describe('LandingPage before the data has loaded', () => {
  const html = renderToStaticMarkup(<LandingPage />);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('shows the kicker, the headline, the sentence, the field and the button in order', () => {
    const order = ['A LOT CHECK FROM OLD FIRE-INSURANCE PLANS', 'What is buried under your address?', 'Type an address. We dig down through the old plans and show you what stood there.', 'role="combobox"', 'Dig'].map((s) => html.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('aria-autocomplete="list"');
  });

  it('has no fact, caption or coverage line until the records are read (they are computed, never typed)', () => {
    expect(html).not.toContain('data-testid="lc-fact"');
    expect(html).toContain('data-testid="lc-caption"></figcaption>');
    expect(html).toContain('Each dig shows the old plan, a 1939 aerial photograph, and a photograph of what stands there today.');
    expect(html).not.toContain('Covered so far');
  });

  it('does not carry the Report line, a banned word or a link to the walk (requirements 7.3, 7.4, 1.2)', () => {
    expect(text).not.toContain("Buried screens; it doesn't certify.");
    expect(findBannedWords(text)).toEqual([]);
    expect(html).not.toContain('/walk');
    expect(html).not.toContain('/studio');
  });
});
