import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  it('holds the mark, the wordmark (a link to /) and "Sources", and no other link', () => {
    const html = renderToStaticMarkup(<Header current="block" />);
    expect(html).toContain('data-testid="mark"');
    expect(html).toContain('<span>Buried</span>');
    expect(html).toMatch(/<a class="wordmark" href="\/"/);
    expect(html).toContain('href="/sources"');
    expect(html).toContain('>Sources</a>');
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).not.toContain('href="/studio"');
    expect(html).not.toContain('href="/explorer"');
    expect(html).not.toContain('>Studio</a>');
    expect(html).not.toContain('>Explorer</a>');
  });

  it('marks Sources when it is the current page, and nothing on any other page', () => {
    const sources = renderToStaticMarkup(<Header current="sources" />);
    expect(sources.match(/aria-current="page"/g)).toHaveLength(1);
    expect(sources).toMatch(/aria-current="page"[^>]*data-testid="nav-sources"/);
    for (const page of ['block', 'search', 'place', 'report', 'studio', 'explorer'] as const) {
      expect(renderToStaticMarkup(<Header current={page} />), page).not.toContain('aria-current');
    }
  });

  it('shows the address of the place on screen, and nothing when there is none', () => {
    expect(renderToStaticMarkup(<Header current="place" address="1 Eastern Ave" />)).toContain('>1 Eastern Ave</p>');
    expect(renderToStaticMarkup(<Header current="place" />)).not.toContain('header-address');
  });

  it('puts the wordmark in the heading font and the links in the body font through classes, with no colour of its own', () => {
    const html = renderToStaticMarkup(<Header current="block" />);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain('style=');
  });

  it('draws the favicon in the parchment and soot tokens, with four strata lines', () => {
    const svg = readFileSync(fileURLToPath(new URL('../../public/favicon.svg', import.meta.url)), 'utf8');
    const css = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8');
    const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase();
    expect(svg).toContain(`stroke="${token('parchment')}"`);
    expect(svg).toContain(`fill="${token('soot')}"`);
    expect(svg.match(/h\d+/g)).toHaveLength(4);
  });
});
