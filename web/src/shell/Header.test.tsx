import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Header } from './Header';

describe('Header', () => {
  it('has the mark, the wordmark and links to the Explorer, the Studio and the Sources page', () => {
    const html = renderToStaticMarkup(<Header current="explorer" />);
    expect(html).toContain('data-testid="mark"');
    expect(html).toContain('<span>Buried</span>');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/explorer"');
    expect(html).toContain('href="/studio"');
    expect(html).toContain('href="/sources"');
    expect(html).toContain('>Explorer</a>');
    expect(html).toContain('>Studio</a>');
    expect(html).toContain('>Sources</a>');
  });

  it('marks the current page, and only that one', () => {
    const explorer = renderToStaticMarkup(<Header current="explorer" />);
    expect(explorer.match(/aria-current="page"/g)).toHaveLength(1);
    expect(explorer).toMatch(/aria-current="page"[^>]*data-testid="nav-explorer"/);
    const sources = renderToStaticMarkup(<Header current="sources" />);
    expect(sources).toMatch(/aria-current="page"[^>]*data-testid="nav-sources"/);
    const place = renderToStaticMarkup(<Header current="place" />);
    expect(place).not.toContain('aria-current');
  });

  it('shows the address of the place on screen, and nothing when there is none', () => {
    expect(renderToStaticMarkup(<Header current="place" address="1 Eastern Ave" />)).toContain('>1 Eastern Ave</p>');
    expect(renderToStaticMarkup(<Header current="place" />)).not.toContain('header-address');
  });

  it('puts the wordmark in the heading font and the links in the body font through classes, with no colour of its own', () => {
    const html = renderToStaticMarkup(<Header current="explorer" />);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain('style=');
  });

  it('draws the favicon in the ink and night tokens, with four strata lines', () => {
    const svg = readFileSync(fileURLToPath(new URL('../../public/favicon.svg', import.meta.url)), 'utf8');
    const css = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8');
    const token = (name: string) => new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase();
    expect(svg).toContain(`stroke="${token('ink')}"`);
    expect(svg).toContain(`fill="${token('night')}"`);
    expect(svg.match(/h\d+/g)).toHaveLength(4);
  });
});
