import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlockPage } from './BlockPage';

describe('BlockPage (placeholder)', () => {
  const html = renderToStaticMarkup(<BlockPage />);

  it('shows the headline, the line and the Raise the past link to the Explorer at 1911', () => {
    expect(html).toContain('>Something used to stand here.</h1>');
    expect(html).toContain('>Every ghost comes with the map that proves it.</p>');
    expect(html).toMatch(/<a [^>]*href="\/\?era=1911"[^>]*data-testid="raise-button">Raise the past<\/a>/);
  });

  it('has a margin caption with "Look up an address" to /place, and no search field', () => {
    expect(html).toMatch(/<a href="\/place"[^>]*>\s*Look up an address\s*<\/a>/);
    expect(html).not.toMatch(/<input|type="search"|role="search"/);
  });

  it('does not show the Report line before a card is open (requirement 1.4)', () => {
    expect(html).not.toContain("doesn't certify");
    expect(html).not.toContain('doesn&#x27;t certify');
  });
});
