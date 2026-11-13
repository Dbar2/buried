/**
 * The Sources page body on the committed registry and tile sidecars (session 027, spec 03 task 17.3):
 * every source with its credit and rights note, and each plate's whole photograph with its size set.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { sourceYearsText } from '../evidence';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { fullImageAlt, loadSourcesData, SourcesView } from './SourcesPage';

const decode = (html: string): string => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

describe('the Sources page on the committed data', async () => {
  const data = await loadSourcesData(diskFetch(REPOSITORY_DATA));
  const html = decode(renderToStaticMarkup(<SourcesView data={data} />));

  it('lists every registered source with its title, years, credit, rights note and rights date', () => {
    expect(data.sources.length).toBeGreaterThan(0);
    for (const s of data.sources) {
      const entry = html.slice(html.indexOf(`data-testid="source-${s.id}"`));
      const end = entry.indexOf('</article>');
      const text = entry.slice(0, end);
      expect(text, s.id).toContain(s.title);
      expect(text, s.id).toContain(s.attribution_line);
      expect(text, s.id).toContain(s.licence_note);
      expect(text, s.id).toContain(s.rights_checked_on ?? 'not yet');
      expect(text, s.id).toContain(s.url);
      if (s.holding !== undefined) expect(text, s.id).toContain(s.holding);
      if (s.type !== 'present_day_reference') expect(text, s.id).toContain(sourceYearsText(s));
    }
  });

  it('shows the whole photograph of each plate that has one, with its size, lazy-loaded, with alt text', () => {
    expect(data.sidecars.size).toBeGreaterThan(0);
    for (const [id, tile] of data.sidecars) {
      const entry = html.slice(html.indexOf(`data-testid="source-photo-${id}"`));
      const img = /<img [^>]*>/.exec(entry)![0];
      expect(img).toContain(`src="/data/tiles/${tile.full_image}"`);
      expect(img).toContain(`width="${tile.full_width_px}"`);
      expect(img).toContain(`height="${tile.full_height_px}"`);
      expect(img).toContain('loading="lazy"');
      const source = data.sources.find((s) => s.id === id)!;
      expect(img).toContain(`alt="${fullImageAlt(source)}"`);
    }
    expect(fullImageAlt({ id: 'fip_v3_1911_229', title: 'x' })).toBe('The whole photograph of plate 229, archive labels and ruler included.');
  });

  it('gives the 1931-35 plates the Library and Archives Canada credit', () => {
    const entry = html.slice(html.indexOf('data-testid="source-fip_v3_1935_229"'));
    const text = entry.slice(0, entry.indexOf('</article>'));
    expect(text).toContain('Library and Archives Canada');
  });

  it('links the workshop (the Studio), which the header no longer does', () => {
    expect(html).toMatch(/<a href="\/studio"[^>]*>\s*The workshop \(runs on a maintainer's machine\)\s*<\/a>/);
  });

  it('credits the three typefaces with their licence', () => {
    expect(html).toContain('<h2 id="sources-typefaces">Typefaces</h2>');
    expect(html).toContain('Libre Baskerville');
    expect(html).toContain('Source Sans 3');
    expect(html).toContain('SIL Open Font License 1.1');
  });

  it('is plain paper-theme text: no source shows a photograph it does not have', () => {
    for (const s of data.sources.filter((x) => !data.sidecars.has(x.id))) expect(html).not.toContain(`data-testid="source-photo-${s.id}"`);
    expect(html).toContain('<h2 id="sources-archival">Plans and photographs</h2>');
    expect(html).toContain('<h2 id="sources-present">City of Toronto data</h2>');
  });
});
