import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildReport } from './buildReport';
import { ReportView } from './ReportView';
import { inputs, linkedBuildingOnLot, LOT_ID, plateCollection, P1911, P1935 } from './testing/fixtures';

const html = (collections = linkedBuildingOnLot(), onBandSelect?: (eraId: string) => void) => {
  const model = buildReport(inputs(collections));
  return renderToStaticMarkup(<ReportView model={model} onBandSelect={onBandSelect} />);
};

describe('ReportView', () => {
  it('starts with the screens line, then the address as the one h1, then h2 sections in the required order', () => {
    const out = html();
    expect(out.indexOf("Buried screens; it doesn&#x27;t certify.")).toBeGreaterThan(-1);
    expect(out.indexOf('report-screens')).toBeLessThan(out.indexOf('<h1'));
    expect(out.match(/<h1/g)).toHaveLength(1);
    expect(out).toMatch(/<h1[^>]*>1 Synthetic St<\/h1>/);
    expect(out).toMatch(/data-testid="report-subtitle">The documented history of this place\.</);
    const headings = [...out.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toEqual(['Core sample', 'Water', 'What the land was used for', 'Old buildings and fill', 'What these records cannot tell you', 'Before you dig', 'Sources']);
  });

  it('has no "Address:" line, no quoted machine string and no bare id in the body; the lot id is in the sources block', () => {
    const out = html();
    expect(out).not.toContain('Address:');
    const body = out.slice(0, out.indexOf('report-sources'));
    const text = body.replace(/<[^>]+>/g, '');
    // Source ids, in the finding "Sources:" lines, are footnotes; none may sit in a sentence.
    const sentences = [...body.matchAll(/<p class="(?:finding-sentence|report-coverage[^"]*)"[^>]*>(.*?)<\/p>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ''));
    for (const s of sentences) expect(s).not.toMatch(/fip_|aerial_|present_|_229|_232/);
    expect(text).not.toMatch(/\bLot [a-z0-9_]+\./);
    const sourcesBlock = out.slice(out.indexOf('report-sources'));
    expect(sourcesBlock).toContain('data-testid="report-lot"');
    expect(sourcesBlock).toContain(`<span class="mono">${LOT_ID}</span>`);
  });

  it('says the summary and the coverage line in plain words', () => {
    const out = html();
    const summary = out.slice(out.indexOf('data-testid="report-summary"'), out.indexOf('</div>', out.indexOf('data-testid="report-summary"'))).replace(/<[^>]+>/g, '');
    expect(summary).toMatch(/Two fire insurance plans cover this lot: <?1911|1911.*1931-35/);
    expect(summary).toContain('building outline');
    expect(out).toContain('Buried holds the 1911 plan and the 1931-35 plan for this area. Coverage today is one block of Toronto.');
  });

  it("shows each finding's status as text and in a pattern class", () => {
    const out = html();
    expect(out).toContain('data-status="documented"');
    expect(out).toContain('status-solid');
    expect(out).toContain('>Documented<');
    // "Not covered" is a plain run-in label, not a boxed badge.
    expect(out).toContain('data-status="not_covered"');
    expect(out).toContain('<span class="status-text">Not covered.</span>');
    expect(out).not.toContain('status-dotted');
    const nothing = html([plateCollection(P1911, [], ['building', 'water', 'land_use']), plateCollection(P1935, [], ['building', 'water', 'land_use'])]);
    expect(nothing).toContain('<span class="status-text">Nothing found in these records.</span>');
  });

  it('gives an empty group one line that says what was checked, with the years', () => {
    const out = html([plateCollection(P1911, [], ['building', 'water', 'land_use']), plateCollection(P1935, [], ['building', 'water', 'land_use'])]);
    expect(out).toContain('data-testid="checked-records"');
    const line = out.slice(out.indexOf('data-testid="checked-records"')).replace(/<[^>]+>/g, '').slice(0, 400);
    expect(line).toContain('Checked here: the 1911 plan (1911, revised to 1914) and the 1931-35 plan (1931, revised to 1935).');
    expect(out).not.toContain('<ul class="checked"');
    // Ids and sheet numbers are available on hover, not in the line.
    expect(out).toContain('title="Records checked: fip_v3_1911_229');
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
