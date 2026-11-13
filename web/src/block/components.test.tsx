import { renderToStaticMarkup } from 'react-dom/server';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BottomSheet, settleSheet } from './BottomSheet';
import { EraRuler, stopIndexForKey } from './EraRuler';
import { cropStyles, FindCard } from './FindCard';
import type { CardCrop } from './FindCard';
import { FindTags } from './FindTags';
import { FLAT_DRAW_S, flatStagger, FlatSheet } from './FlatSheet';
import { LanternLens } from './LanternLens';
import { LeaderLine } from './LeaderLine';
import { RaiseButton } from './RaiseButton';
import { sampleCardView, sampleFootprints, sampleRulerStops, sampleTags, sampleTile } from './sample';
import { StillPicture } from './StillPicture';
import { layoutMarkers, layoutTags } from './tagLayout';

const noop = () => undefined;

describe('StillPicture', () => {
  const sources = { wide: { src: '/still/block-wide.jpg' }, tall: { src: '/still/block-tall.jpg' } };

  it('shows the wide or the tall source by kind, with its own size, and no alt text', () => {
    const wide = renderToStaticMarkup(<StillPicture sources={sources} kind="wide" faded={false} />);
    expect(wide).toContain('src="/still/block-wide.jpg"');
    expect(wide).toContain('width="1600"');
    expect(wide).toContain('height="1000"');
    expect(wide).toContain('alt=""');
    const tall = renderToStaticMarkup(<StillPicture sources={sources} kind="tall" faded={false} />);
    expect(tall).toContain('src="/still/block-tall.jpg"');
    expect(tall).toContain('width="780"');
    expect(tall).not.toContain('block-wide');
  });

  it('fades out on a prop', () => {
    expect(renderToStaticMarkup(<StillPicture sources={sources} kind="wide" faded={false} />)).not.toContain('is-faded');
    const faded = renderToStaticMarkup(<StillPicture sources={sources} kind="wide" faded />);
    expect(faded).toContain('is-faded');
    expect(faded).toContain('data-faded="true"');
  });
});

describe('RaiseButton', () => {
  it('reads "Raise the past", and announces nothing, until it is waiting', () => {
    const html = renderToStaticMarkup(<RaiseButton waiting={false} onPress={noop} />);
    expect(html).toMatch(/<button [^>]*data-testid="raise-button"[^>]*>Raise the past<\/button>/);
    expect(html).toMatch(/role="status" aria-live="polite"[^>]*><\/p>/);
    expect(html).not.toContain('aria-busy');
    expect(html).not.toContain('Lighting the lamp');
  });

  it('reads "Lighting the lamp" when told it is waiting, and announces it politely', () => {
    const html = renderToStaticMarkup(<RaiseButton waiting onPress={noop} />);
    expect(html).toMatch(/<button [^>]*aria-disabled="true"[^>]*>Lighting the lamp<\/button>/);
    expect(html).toMatch(/aria-live="polite"[^>]*>Lighting the lamp<\/p>/);
    expect(html).not.toContain('>Raise the past<');
  });
});

describe('FindTags and LeaderLine', () => {
  const anchors = [
    { id: 'overall-factory', x: 700, y: 420, onScreen: true },
    { id: 'bank', x: 780, y: 300, onScreen: true },
    { id: 'coal-yard', x: 500, y: 500, onScreen: false },
  ];
  const sizes = new Map(sampleTags.map((t) => [t.id, { w: 140, h: 44 }] as const));
  const layout = layoutTags({ anchors, sizes, viewport: { w: 1440, h: 800 }, keepOut: [] });

  it('draws a pinned tag and a string for each tag the layout placed, none for a hidden one', () => {
    const html = renderToStaticMarkup(<FindTags mode="pinned" items={sampleTags} layout={layout} selectedId={null} onSelect={noop} />);
    expect(html).toContain('>Overall factory</button>');
    expect(html).toContain('>Bank</button>');
    expect(html).not.toContain('Coal yard');
    expect(html.match(/<line /g)).toHaveLength(2);
    expect(html).toContain('aria-pressed="false"');
  });

  it('does not pin the selected find', () => {
    const selectedLayout = layoutTags({ anchors, sizes, viewport: { w: 1440, h: 800 }, keepOut: [], selectedId: 'bank' });
    const html = renderToStaticMarkup(<FindTags mode="pinned" items={sampleTags} layout={selectedLayout} selectedId="bank" onSelect={noop} />);
    expect(html).not.toContain('>Bank<');
    expect(html).toContain('>Overall factory</button>');
  });

  it('draws a find that is not selected as a marker button with its text beside the dot, and none for the selected or a hidden one', () => {
    const markers = layoutMarkers({ anchors, sizes, viewport: { w: 1440, h: 800 }, keepOut: [], leader: null, selectedId: 'bank' });
    const html = renderToStaticMarkup(<FindTags mode="markers" items={sampleTags} layout={markers} selectedId="bank" onSelect={noop} />);
    expect(html).toMatch(/<button [^>]*aria-label="Overall factory"[^>]*data-testid="marker-overall-factory"/);
    expect(html).toContain('class="find-marker-dot"');
    expect(html).toMatch(/data-testid="marker-label-overall-factory"[^>]*>Overall factory<\/span>/);
    expect(html).not.toContain('marker-bank');
    expect(html).not.toContain('marker-coal-yard');
    expect(html).not.toContain('<line ');
  });

  it('shows every find in the top row, with the selected one pressed', () => {
    const html = renderToStaticMarkup(<FindTags mode="row" items={sampleTags} selectedId="bank" onSelect={noop} />);
    for (const tag of sampleTags) expect(html).toContain(`>${tag.text}</button>`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="tag-bank"/);
  });

  it('draws the leader line only when it has one', () => {
    expect(renderToStaticMarkup(<LeaderLine line={null} />)).toBe('');
    const html = renderToStaticMarkup(<LeaderLine line={{ x1: 10, y1: 20, x2: 300, y2: 40 }} />);
    expect(html).toContain('x2="300"');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe('FindCard', () => {
  it('shows the card of requirement 4.2, in order, from the view model', () => {
    const html = renderToStaticMarkup(<FindCard view={sampleCardView} shareOutcome={null} onShowOriginalSheet={noop} onShare={noop} onShowOnMap={noop} />);
    const at = (text: string) => {
      const i = html.indexOf(text);
      expect(i, text).toBeGreaterThan(-1);
      return i;
    };
    const order = [
      'LETTERED ON THE 1911 PLAN',
      'Glove &amp; Overall Factory',
      'Hamilton Carhartt Mfr. Ltd.',
      'src="/data/tiles/fip_v3_1911_229.jpg"',
      'Seen on:',
      '</span>1911 plan, sheet 229',
      'Positioned within about 4.5 m',
      'Status:',
      '</span>draft, not yet reviewed',
      'On the 1931-35 plan this factory is lettered “Glove &amp; Overall Fac.”.',
      'Show the original sheet',
      'Share this find',
      'Full record',
    ].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain('Placed within');
    expect(html).not.toMatch(/confirmed/i);
    expect(html.match(/<svg class="reg-cross /g)).toHaveLength(4);
    expect(html).toContain('<h2 class="card-title"');
  });

  it('offers only the actions it is told to, and "Show on the map" when asked', () => {
    const view = { ...sampleCardView, rulerLine: null, actions: { showOriginalSheet: false, share: false, fullRecord: false, showOnMap: true } };
    const html = renderToStaticMarkup(<FindCard view={view} shareOutcome={null} onShowOriginalSheet={noop} onShare={noop} onShowOnMap={noop} />);
    expect(html).toContain('Show on the map');
    expect(html).not.toContain('Show the original sheet');
    expect(html).not.toContain('Share this find');
    expect(html).not.toContain('Full record');
    expect(html).not.toContain('card-ruler-line');
  });

  it('has one outlined button, "Show the original sheet", and the other actions as links on one line under it', () => {
    const html = renderToStaticMarkup(<FindCard view={sampleCardView} shareOutcome={null} onShowOriginalSheet={noop} onShare={noop} onShowOnMap={noop} />);
    expect(html.match(/class="card-button"/g)).toHaveLength(1);
    expect(html).toMatch(/class="card-button"[^>]*data-testid="card-show-original">Show the original sheet<\/button><div class="card-links">/);
    const links = /<div class="card-links">(.*?)<\/div>/.exec(html)![1]!;
    expect(links).toContain('Share this find');
    expect(links).toContain('Full record');
    expect(links).not.toContain('Show the original sheet');
    expect(html).not.toContain('card-share-copied');
  });

  it('announces "Link copied." and, when the clipboard is refused, shows the link in a field', () => {
    const copied = renderToStaticMarkup(<FindCard view={sampleCardView} shareOutcome="copied" onShowOriginalSheet={noop} onShare={noop} onShowOnMap={noop} />);
    expect(copied).toMatch(/aria-live="polite"[^>]*>Link copied\.<\/p>/);
    // The link itself reads "Link copied" while the outcome stands, and "Share this find" otherwise.
    expect(copied).toMatch(/data-testid="card-share">Link copied<\/button>/);
    expect(copied).not.toContain('Share this find');
    expect(copied).not.toContain('card-share-link');
    const refused = renderToStaticMarkup(<FindCard view={sampleCardView} shareOutcome="refused" onShowOriginalSheet={noop} onShare={noop} onShowOnMap={noop} />);
    expect(refused).toContain('value="https://buried.pages.dev/find/overall-factory"');
    expect(refused).toContain('readonly=""');
    expect(refused).not.toContain('Link copied.');
  });

  it('places the crop with percentages that show exactly the rectangle', () => {
    const { frame, image } = cropStyles(sampleCardView.crop as CardCrop);
    expect(frame.aspectRatio).toBe('390 / 300');
    expect(image.width).toBe(`${(3626 / 390) * 100}%`);
    expect(image.left).toBe(`${(-2090 / 390) * 100}%`);
    expect(image.top).toBe(`${(-440 / 300) * 100}%`);
  });

  it('property: the crop frame and image keep the rectangle on the tile for any rectangle', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),
        fc.integer({ min: 100, max: 5000 }),
        fc.double({ min: 0, max: 0.9, noNaN: true }),
        fc.double({ min: 0, max: 0.9, noNaN: true }),
        fc.double({ min: 0.05, max: 0.1, noNaN: true }),
        (tw, th, fx, fy, fs) => {
          const rect = { x: fx * tw, y: fy * th, width: Math.max(1, fs * tw), height: Math.max(1, fs * th) };
          const { image } = cropStyles({ src: 's', tileWidth: tw, tileHeight: th, rect, alt: '' });
          // The frame shows `rect.width` tile px across, so the whole tile is tw / rect.width frames wide, and the
          // rectangle's left edge sits at its own fraction of that width.
          expect(parseFloat(String(image.width))).toBeCloseTo((tw / rect.width) * 100, 6);
          expect(parseFloat(String(image.left))).toBeCloseTo((-rect.x / rect.width) * 100, 6);
        },
      ),
    );
  });
});

describe('BottomSheet', () => {
  const peek = { kicker: 'LETTERED ON THE 1911 PLAN', title: 'Glove & Overall Factory', status: 'Status: draft, not yet reviewed' };

  it('peeks at kicker, name and status, with the card hidden, behind a 44 px handle', () => {
    const html = renderToStaticMarkup(<BottomSheet expanded={false} onExpandedChange={noop} peek={peek}>CARD BODY</BottomSheet>);
    expect(html).toContain('LETTERED ON THE 1911 PLAN');
    expect(html).toContain('Glove &amp; Overall Factory');
    expect(html).toContain('Status: draft, not yet reviewed');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/class="sheet-body" id="bottom-sheet-body" hidden=""/);
    expect(html).toContain('aria-label="Open the card"');
  });

  it('shows the whole card when expanded, and no separate peek', () => {
    const html = renderToStaticMarkup(<BottomSheet expanded onExpandedChange={noop} peek={peek}>CARD BODY</BottomSheet>);
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain('sheet-peek"');
    expect(html).not.toMatch(/id="bottom-sheet-body" hidden/);
    expect(html).toContain('CARD BODY');
  });

  it('settles a drag: up opens, down closes, a short one leaves it', () => {
    expect(settleSheet(false, -60)).toBe(true);
    expect(settleSheet(true, 60)).toBe(false);
    expect(settleSheet(false, -10)).toBe(false);
    expect(settleSheet(true, 10)).toBe(true);
    fc.assert(
      fc.property(fc.boolean(), fc.integer({ min: -48, max: 48 }), (expanded, dy) => {
        if (Math.abs(dy) < 48) expect(settleSheet(expanded, dy)).toBe(expanded);
      }),
    );
  });
});

describe('EraRuler', () => {
  it('has three stops in order, Today, 1935, 1911, none for 1947, and one checked', () => {
    const html = renderToStaticMarkup(<EraRuler stops={sampleRulerStops} value="1911" onChange={noop} />);
    const labels = [...html.matchAll(/class="ruler-label">([^<]+)</g)].map((m) => m[1]);
    expect(labels).toEqual(['Today', '1935', '1911']);
    expect(html).not.toContain('1947');
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-checked="true" tabindex="0"[^>]*data-testid="ruler-1911"/);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-live="polite"[^>]*><\/p>/);
  });

  it('moves Left and Right between stops and stops at the ends', () => {
    expect(stopIndexForKey(2, 'ArrowLeft', 3)).toBe(1);
    expect(stopIndexForKey(1, 'ArrowLeft', 3)).toBe(0);
    expect(stopIndexForKey(0, 'ArrowLeft', 3)).toBe(0);
    expect(stopIndexForKey(0, 'ArrowRight', 3)).toBe(1);
    expect(stopIndexForKey(2, 'ArrowRight', 3)).toBe(2);
    expect(stopIndexForKey(1, 'a', 3)).toBeNull();
    expect(stopIndexForKey(0, 'ArrowRight', 0)).toBeNull();
  });
});

describe('LanternLens', () => {
  const area = { width: 1000, height: 600 };

  it('always shows the Lantern control, and the ring only when on', () => {
    const off = renderToStaticMarkup(<LanternLens on={false} center={{ x: 0.5, y: 0.5 }} radius={0.18} area={area} label="Lantern" onToggle={noop} onMove={noop} />);
    expect(off).toMatch(/<button [^>]*aria-pressed="false"[^>]*>Lantern<\/button>/);
    expect(off).not.toContain('lens-ring');
    const on = renderToStaticMarkup(<LanternLens on center={{ x: 0.25, y: 0.5 }} radius={0.18} area={area} label="Lantern: 1931-35 plan" onToggle={noop} onMove={noop} />);
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('Lantern: 1931-35 plan');
    expect(on).toContain('left:25%');
    expect(on).toContain('width:216px');
  });
});

describe('FlatSheet', () => {
  const base = { tile: sampleTile, footprints: sampleFootprints, reducedMotion: false, selectedId: null, onSelect: noop };

  it('shows only the tile until told to raise', () => {
    const html = renderToStaticMarkup(<FlatSheet {...base} raised={false} />);
    expect(html).toContain('href="/data/tiles/fip_v3_1911_229.jpg"');
    expect(html).toContain('viewBox="0 0 3626 4096"');
    expect(html).not.toContain('flat-fp');
    expect(html).toContain('data-raised="false"');
  });

  it('draws each footprint in its confidence line style when raised, with the outlines drawing on', () => {
    const html = renderToStaticMarkup(<FlatSheet {...base} raised />);
    for (const confidence of ['documented', 'estimated', 'unknown']) expect(html).toContain(`flat-fp-${confidence}`);
    expect(html.match(/class="flat-fp-edge"/g)).toHaveLength(3);
    expect(html).toContain('is-drawing');
    expect(html.match(/<mask /g)).toHaveLength(3);
    expect(html).toMatch(/d="M\d+\.\d \d+\.\d(L\d+\.\d \d+\.\d)+Z"/);
  });

  it('tones the scan by default, leaves "the original sheet" untouched, and clips the outlines to the tile', () => {
    const toned = renderToStaticMarkup(<FlatSheet {...base} raised present={[[[[0, 0], [10, 0], [10, 10], [0, 0]]]]} />);
    expect(toned).toContain('flat-sheet is-toned');
    expect(toned).toContain('class="flat-sheet-paper"');
    expect(toned).toMatch(/<clipPath id="(flat-clip-[^"]+)"><rect width="3626" height="4096"><\/rect><\/clipPath>/);
    const id = /<clipPath id="(flat-clip-[^"]+)"/.exec(toned)![1];
    expect(toned).toContain(`clip-path="url(#${id})"`);
    const bare = renderToStaticMarkup(<FlatSheet {...base} raised={false} toned={false} />);
    expect(bare).not.toContain('is-toned');
    expect(bare).not.toContain('flat-sheet-paper');
  });

  it('puts the outlines there at once under reduced motion', () => {
    const html = renderToStaticMarkup(<FlatSheet {...base} raised reducedMotion />);
    expect(html.match(/class="flat-fp-edge"/g)).toHaveLength(3);
    expect(html).not.toContain('is-drawing');
    expect(html).not.toContain('<mask');
  });

  it('staggers so the last outline has finished drawing by 2.2 s, however many there are', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2000 }), (count) => {
        expect(Math.max(0, count - 1) * flatStagger(count) + FLAT_DRAW_S).toBeLessThanOrEqual(2.2 + 1e-9);
      }),
    );
  });

  it('marks the selected footprint', () => {
    const html = renderToStaticMarkup(<FlatSheet {...base} raised reducedMotion selectedId="sample_estimated" />);
    expect(html.match(/is-selected/g)).toHaveLength(1);
    expect(html).toMatch(/flat-fp-estimated is-selected/);
  });
});
