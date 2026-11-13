import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildReport } from './buildReport';
import { ReportView } from './ReportView';
import { inputs, linkedBuildingOnLot, plateCollection, P1911, P1935 } from './testing/fixtures';

const html = (collections = linkedBuildingOnLot(), onBandSelect?: (eraId: string) => void) => {
  const model = buildReport(inputs(collections));
  return renderToStaticMarkup(<ReportView model={model} onBandSelect={onBandSelect} />);
};

describe('ReportView', () => {
  it('starts with the screens line, then one h1, then h2 sections in the required order', () => {
    const out = html();
    expect(out.indexOf("Buried screens; it doesn&#x27;t certify.")).toBeGreaterThan(-1);
    expect(out.indexOf('report-screens')).toBeLessThan(out.indexOf('<h1'));
    expect(out.match(/<h1/g)).toHaveLength(1);
    const headings = [...out.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual(['Place', 'Core sample', 'Water history', 'Past land use', 'Fill and old structures', 'What these records cannot tell you', 'Before you dig', 'Sources']);
  });

  it('shows each finding\'s status as text and in a pattern class', () => {
    const out = html();
    expect(out).toContain('data-status="documented"');
    expect(out).toContain('status-solid');
    expect(out).toContain('>Documented<');
    expect(out).toContain('Not covered');
    expect(out).toContain('status-dotted');
    const nothing = html([plateCollection(P1911, [], ['building', 'water', 'land_use']), plateCollection(P1935, [], ['building', 'water', 'land_use'])]);
    expect(nothing).toContain('>Nothing found in these records<');
  });

  it('lists the records checked for a "nothing found" finding, with years in monospace', () => {
    const out = html([plateCollection(P1911, [], ['building', 'water', 'land_use']), plateCollection(P1935, [], ['building', 'water', 'land_use'])]);
    expect(out).toContain('data-testid="checked-records"');
    expect(out).toContain('<span class="mono">fip_v3_1911_229</span>');
    expect(out).toContain('checked here');
  });

  it('puts the Print button and share link on the page and keeps them out of print', () => {
    const out = html();
    expect(out).toContain('data-testid="print"');
    expect(out).toContain('class="report-actions no-print"');
    expect(out).toContain('data-testid="share-link"');
  });

  it('makes a band a link on the route and a button in a panel', () => {
    expect(html()).toContain('data-testid="band-link-1911"');
    expect(html(undefined, () => undefined)).toContain('data-testid="band-select-1911"');
  });

  it('shows only "Not reconstructed yet." outside coverage', () => {
    const out = renderToStaticMarkup(<ReportView model={{ kind: 'not_reconstructed', text: 'Not reconstructed yet.' }} />);
    expect(out).toContain('Not reconstructed yet.');
    expect(out).not.toContain('<h2');
  });

  it('links to Ontario Dig Authority', () => {
    expect(html()).toContain('href="https://ontariodigauthority.ca/"');
  });
});
