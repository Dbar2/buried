import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from '../evidence';
import { Postcards } from './Postcard';
import type { ImaginedView } from './photos';

const VIEW: ImaginedView = {
  slug: 'coal-yard',
  featureIds: ['use_a'],
  planSource: 'fip_v3_1911_229',
  planName: 'the 1911 plan',
  about: 'about 1911',
  topdown: null,
  street: { src: '/lotcheck/imagined/coal-yard-street.jpg', widthPx: 1200, heightPx: 800, caption: 'The coal and wood yard of J. W. Corson & Co.' },
  note: null,
};

describe('As it may have looked', () => {
  it('shows the heading, the index caption and "Imagined from the 1911 plan. Not a photograph."', () => {
    const html = renderToStaticMarkup(<Postcards views={[VIEW]} load />);
    expect(html).toContain('As it may have looked');
    expect(html).toContain('The coal and wood yard of J. W. Corson &amp; Co.');
    expect(html).toContain('Imagined from the 1911 plan. Not a photograph.');
    expect(html).toContain('src="/lotcheck/imagined/coal-yard-street.jpg"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(findBannedWords(html.replace(/<[^>]+>/g, ' '))).toEqual([]);
  });

  it('does not ask for the picture before it is told to, but still shows the caption and the place for it', () => {
    const html = renderToStaticMarkup(<Postcards views={[VIEW]} load={false} />);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('coal-yard-street.jpg');
    expect(html).toContain('Not a photograph.');
    expect(html).toContain('aspect-ratio:1200 / 800');
  });

  it('shows nothing for a lot with no imagined view (rule 4)', () => {
    expect(renderToStaticMarkup(<Postcards views={[]} load />)).toBe('');
    expect(renderToStaticMarkup(<Postcards views={[{ ...VIEW, street: null }]} load />)).toBe('');
  });

  it('prints a plain line, not the index caption, when the caption holds a word this site does not print', () => {
    const html = renderToStaticMarkup(<Postcards views={[{ ...VIEW, street: { ...(VIEW.street as NonNullable<ImaginedView['street']>), caption: 'The clean yard' } }]} load />);
    expect(html).not.toContain('clean');
    expect(html).toContain('A view imagined from the plan.');
  });
});
