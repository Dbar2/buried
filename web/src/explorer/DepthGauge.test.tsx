import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DepthGauge, announcementFor, nextIndexForKey, stopText } from './DepthGauge';
import type { EraInfo } from './eraOrder';

const eras: EraInfo[] = [
  { id: 'today', index: 0, label: 'Today', yearFrom: 2026, yearTo: 2026 },
  { id: '1947', index: 1, label: '1947', yearFrom: 1947, yearTo: 1947 },
  { id: '1935', index: 2, label: '1935', yearFrom: 1931, yearTo: 1935 },
  { id: '1911', index: 3, label: '1911 (revised to 1914)', yearFrom: 1911, yearTo: 1914 },
];

describe('the gauge keys (requirement 17.1)', () => {
  it('Down goes deeper and Up shallower, one era at a time', () => {
    expect(nextIndexForKey('ArrowDown', 0, 4)).toBe(1);
    expect(nextIndexForKey('ArrowDown', 1, 4)).toBe(2);
    expect(nextIndexForKey('ArrowUp', 2, 4)).toBe(1);
  });

  it('Home goes to Today and End to the earliest era', () => {
    expect(nextIndexForKey('Home', 3, 4)).toBe(0);
    expect(nextIndexForKey('End', 0, 4)).toBe(3);
  });

  it('stops at the ends and ignores other keys', () => {
    expect(nextIndexForKey('ArrowUp', 0, 4)).toBeNull();
    expect(nextIndexForKey('ArrowDown', 3, 4)).toBeNull();
    expect(nextIndexForKey('Home', 0, 4)).toBeNull();
    expect(nextIndexForKey('a', 1, 4)).toBeNull();
    expect(nextIndexForKey('ArrowDown', 0, 0)).toBeNull();
  });
});

describe('the gauge markup (requirement 17.2)', () => {
  const html = renderToStaticMarkup(<DepthGauge eras={eras} index={2} onChange={() => {}} />);

  it('is a slider with its range, value and the era label as the value text', () => {
    expect(html).toContain('role="slider"');
    expect(html).toContain('aria-valuemin="0"');
    expect(html).toContain('aria-valuemax="3"');
    expect(html).toContain('aria-valuenow="2"');
    expect(html).toContain('aria-valuetext="1935"');
    expect(html).toContain('tabindex="0"');
  });

  it('lists every era, Today at the top, years in the mono face', () => {
    const order = [...html.matchAll(/data-testid="era-([a-z0-9]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['today', '1947', '1935', '1911']);
    expect(html).toContain('<span class="depth-label">Today</span>');
    expect(html).toContain('<span class="depth-year">1947</span>');
    expect(html).toContain('<span class="depth-year">1911</span>');
  });

  it('marks only the current stop, by a mark and a weight and not by a colour of its own', () => {
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="true"[^>]*data-testid="era-1935"/);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(html).not.toContain('style=');
  });

  it('keeps the full label of an era as its title', () => {
    expect(html).toContain('title="1911 (revised to 1914)"');
  });

  it('has a marker for the depth that screen readers skip, and the ARIA value stays the era', () => {
    expect(html).toMatch(/<span[^>]*class="depth-thumb"[^>]*aria-hidden="true"/);
    const between = renderToStaticMarkup(<DepthGauge eras={eras} index={2} depth={1.4} onChange={() => {}} />);
    expect(between).toContain('aria-valuenow="2"');
    expect(between).toContain('aria-valuetext="1935"');
  });
});

describe('the announcement (requirement 10.7)', () => {
  it('says which era is now showing', () => {
    expect(announcementFor(eras[0])).toBe('Now showing Today');
    expect(announcementFor(eras[2])).toBe('Now showing 1935');
    expect(announcementFor(eras[3])).toBe('Now showing 1911 (revised to 1914)');
    expect(announcementFor(undefined)).toBe('');
  });

  it('uses the year for a dated era and the label otherwise', () => {
    expect(stopText(eras[0] as EraInfo)).toEqual({ text: 'Today', mono: false });
    expect(stopText(eras[3] as EraInfo)).toEqual({ text: '1911', mono: true });
  });
});
