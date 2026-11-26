import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from '../evidence';
import { DigOverlay, holdFrom, skipKeyCounts } from './DigOverlay';

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

describe('holdFrom (the test hook does nothing for a real visitor)', () => {
  it('is honoured only when navigator.webdriver is true', () => {
    expect(holdFrom(1, true)).toBe(1);
    expect(holdFrom(0, true)).toBe(0);
    expect(holdFrom(1, false)).toBeNull();
    expect(holdFrom(0, false)).toBeNull();
  });
  it('ignores anything that is not a whole, non-negative number', () => {
    for (const v of [undefined, null, '1', -1, 1.5, Number.NaN, {}]) expect(holdFrom(v, true)).toBeNull();
  });
});

describe('skipKeyCounts (the Enter that chose the address must not skip the dig)', () => {
  const press = (key: string, repeat = false) => ({ key, repeat });
  it('ignores any key in the first 600 ms', () => {
    expect(skipKeyCounts(press('Enter'), 1000, 1000)).toBe(false);
    expect(skipKeyCounts(press('Enter'), 1000, 1599)).toBe(false);
    expect(skipKeyCounts(press('Escape'), 1000, 1200)).toBe(false);
  });
  it('counts a fresh Enter or Escape from 600 ms on', () => {
    expect(skipKeyCounts(press('Enter'), 1000, 1600)).toBe(true);
    expect(skipKeyCounts(press('Escape'), 1000, 3000)).toBe(true);
  });
  it('never counts a held key (repeat) or another key', () => {
    expect(skipKeyCounts(press('Enter', true), 1000, 3000)).toBe(false);
    expect(skipKeyCounts(press('a'), 1000, 3000)).toBe(false);
  });
});
