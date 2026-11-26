/**
 * The Sources page body on the committed registry and tile sidecars (session 027, spec 03 task 17.3):
 * every source with its credit and rights note, and each plate's whole photograph with its size set.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findBannedWords, sourceYearsText } from '../evidence';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { parseImagined, parsePhotos } from '../lotcheck/photos';
import { cropStyle, fullImageAlt, loadSourcesData, SourcesView } from './SourcesPage';

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

  it('says the night illustrations were made with an image model and are decoration, not evidence', () => {
    expect(html).toContain('<h2 id="sources-illustrations">Illustrations</h2>');
    expect(html).toContain('The lantern, the earth cross-section, the paper, the skyline and the spade are illustrations made with an image model. They are decoration, not evidence.');
  });

  it('lists the aerial photographs with their licence, credit and the City\'s caveat for 1939, and the imagined views as not evidence (session 055)', () => {
    const read = (p: string): unknown => JSON.parse(readFileSync(resolve(__dirname, '../../public/lotcheck', p), 'utf8'));
    const photos = parsePhotos(read('aerial/aerial.json'));
    const imagined = parseImagined(read('imagined/imagined.json'));
    const page = decode(renderToStaticMarkup(<SourcesView data={{ ...data, photos, imagined }} />));
    expect(page).toContain('<h2 id="sources-aerial">Aerial photographs</h2>');
    for (const p of photos) {
      const entry = page.slice(page.indexOf(`data-testid="aerial-${p.id}"`));
      const text = entry.slice(0, entry.indexOf('</article>'));
      expect(text).toContain(p.label);
      expect(text).toContain('Open Government Licence - Toronto');
      expect(text).toContain('Contains information licensed under the Open Government Licence - Toronto.');
      expect(text).toContain(p.sourceUrl);
      expect(text).toContain('loading="lazy"');
      expect(text.includes('were not orthorectified'), p.id).toBe(p.approximate);
    }
    expect(page).toContain('<h2 id="sources-imagined">Imagined views</h2>');
    expect(page).toContain('Made with an image model from the plans: decoration and illustration, not evidence.');
    for (const v of imagined.views) expect(page).toContain(`data-testid="imagined-${v.slug}"`);
    expect(findBannedWords(page.replace(/<[^>]+>/g, ' '))).toEqual([]);
  });

  it('leaves both sections out when the indexes are not there', () => {
    expect(html).not.toContain('sources-aerial');
    expect(html).not.toContain('sources-imagined');
  });

  it('cuts the small crop of a photograph around a point, inside the picture', () => {
    const style = cropStyle({ bounds: [632295, 4834745, 632715, 4835185], widthPx: 1680, heightPx: 1760 }, [632410.5, 4834915.3], { width: 320, height: 180 });
    expect(style.objectFit).toBe('none');
    const [x, y] = String(style.objectPosition).split(' ').map((v) => Number.parseInt(v, 10));
    expect(-(x as number)).toBeGreaterThanOrEqual(0);
    expect(-(x as number) + 320).toBeLessThanOrEqual(1680);
    expect(-(y as number)).toBeGreaterThanOrEqual(0);
    expect(-(y as number) + 180).toBeLessThanOrEqual(1760);
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
