import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from '../evidence';
import { DigOverlay } from './DigOverlay';

const art = { lantern: '/l.webp', strata: '/s.webp', skyline: '/k.webp' };

describe('DigOverlay before the lamp is lit (markup; the sequence is tested in the browser spec)', () => {
  const html = renderToStaticMarkup(<DigOverlay build={() => null} onFinish={() => undefined} art={art} />);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  it('is a dialog that says it is lighting the lamp, with a way to skip and a live region', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(text).toContain('Lighting the lamp…');
    expect(text).toContain('Skip');
    expect(html).toContain('aria-live="polite"');
    expect(text).toContain('Digging down through the plans');
  });

  it('shows no slip and no mark before there is a lot check to read them from', () => {
    expect(html).not.toContain('data-testid="dig-slip"');
    expect(html).not.toContain('data-testid="dig-mark"');
  });

  it('has no banned word', () => {
    expect(findBannedWords(text)).toEqual([]);
  });
});
