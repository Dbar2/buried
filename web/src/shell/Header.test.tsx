import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  it('has the wordmark and links to the Explorer and the Sources page', () => {
    const html = renderToStaticMarkup(<Header current="explorer" />);
    expect(html).toContain('>Buried</a>');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/sources"');
    expect(html).toContain('>Explorer</a>');
    expect(html).toContain('>Sources</a>');
  });

  it('marks the current page, and only that one', () => {
    const explorer = renderToStaticMarkup(<Header current="explorer" />);
    expect(explorer.match(/aria-current="page"/g)).toHaveLength(1);
    expect(explorer).toMatch(/aria-current="page"[^>]*data-testid="nav-explorer"/);
    const sources = renderToStaticMarkup(<Header current="sources" />);
    expect(sources).toMatch(/aria-current="page"[^>]*data-testid="nav-sources"/);
  });

  it('puts the wordmark in the heading font and the links in the body font through classes, with no colour of its own', () => {
    const html = renderToStaticMarkup(<Header current="explorer" />);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain('style=');
  });
});
