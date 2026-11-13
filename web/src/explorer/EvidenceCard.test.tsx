import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { findBannedWords } from '../evidence';
import { EvidenceCard, isCloseKey, rowTestId } from './EvidenceCard';
import type { GateCard } from './gateCard';

const card: GateCard = {
  heading: 'Building',
  rows: [
    { label: 'Feature', value: 'bld_fip_v3_1911_229_0001', mono: true },
    { label: 'Confidence', value: 'Documented. Read from the plate.', mono: false },
    { label: 'Position', value: 'Positioned within about 4.5 m', mono: true },
    { label: 'Read from', value: 'Goad plan (fip_v3_1911_229)', mono: false },
    { label: 'Confirmed by', value: 'A reviewer', mono: false },
    { label: 'Confirmed at', value: '13 Nov 2026, 12:00 UTC', mono: true, title: '2026-11-13T12:00:00Z' },
    { label: 'Attribution', value: 'Digitized and georeferenced by the University of Toronto Map & Data Library.', mono: false },
  ],
};

describe('EvidenceCard', () => {
  const html = renderToStaticMarkup(<EvidenceCard card={card} onClose={() => {}} />);

  it('shows the heading and every field with its label', () => {
    expect(html).toContain('<h2 data-testid="card-heading">Building</h2>');
    for (const row of card.rows) {
      expect(html).toContain(`<dt>${row.label}</dt>`);
      expect(html).toContain(`data-testid="${rowTestId(row.label)}"`);
    }
    expect(html).toContain('Positioned within about 4.5 m');
  });

  it('puts ids, years and the position figure in the mono face and prose in the body face', () => {
    expect(html).toMatch(/class="mono" data-testid="card-feature"/);
    expect(html).toMatch(/class="mono" data-testid="card-position"/);
    expect(html).toMatch(/class="mono" data-testid="card-confirmed-at"/);
    expect(html).toContain('title="2026-11-13T12:00:00Z"');
    expect(html).not.toMatch(/class="mono" data-testid="card-confidence"/);
    expect(html).not.toMatch(/class="mono" data-testid="card-attribution"/);
  });

  it('has a close button, and Escape is the close key (requirement 11.5)', () => {
    expect(html).toContain('>Close</button>');
    expect(isCloseKey('Escape')).toBe(true);
    expect(isCloseKey('Enter')).toBe(false);
    expect(isCloseKey('Esc')).toBe(false);
  });

  it('carries no colour or style of its own and no banned word', () => {
    expect(html).not.toContain('style=');
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(findBannedWords(html.replace(/<[^>]+>/g, ' '))).toEqual([]);
  });
});
