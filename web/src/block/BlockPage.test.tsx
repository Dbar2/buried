import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadData } from '../data/loadData';
import { buildGateModel } from '../explorer/gateModel';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { BlockStage, BLOCK_CAPTION, BLOCK_HEADLINE, BLOCK_LINE, PLAYER_FAILED_LINE } from './BlockStage';
import type { BlockStageProps } from './BlockStage';
import { loadFinds } from './finds';
import { parseStillMeta } from './useBlockData';
import type { BlockDataState } from './useBlockData';
import { NO_WEBGL2_MESSAGE } from '../explorer/webgl';

let ready: BlockDataState;
const stillJson = { wide: { anchors: [{ feature_id: 'bld_fip_v3_1911_229_0001', x: 1025.4, y: 486.2, on_screen: true }] }, tall: { anchors: [{ feature_id: 'bld_fip_v3_1911_229_0001', x: 469.8, y: 750.4, on_screen: true }] } };

beforeAll(async () => {
  const fetchText = diskFetch(REPOSITORY_DATA);
  const data = await loadData(fetchText);
  const found = await loadFinds(fetchText, data);
  ready = { status: 'ready', model: buildGateModel(data), finds: found.finds, problems: [] };
});

const base = (): BlockStageProps => ({
  data: { status: 'loading' },
  still: null,
  routeSlug: null,
  siteOrigin: 'https://buried.example',
  webgl2: true,
  reducedMotion: false,
  lotFor: null,
});

const render = (props: Partial<BlockStageProps>) => renderToStaticMarkup(<BlockStage {...base()} {...props} />);

describe('the Block page at first paint (WebGL available, nothing loaded yet)', () => {
  const html = render({});

  it('shows the headline, the line and the Raise the past button before anything has loaded', () => {
    expect(html).toContain(`>${BLOCK_HEADLINE}</h1>`);
    expect(html).toContain(`>${BLOCK_LINE}</p>`);
    expect(html).toMatch(/<button [^>]*data-testid="raise-button"[^>]*>Raise the past<\/button>/);
    expect(html).not.toContain('Lighting the lamp');
  });

  it('has the margin caption with "Look up an address" to /place, and no search field', () => {
    expect(html).toContain(BLOCK_CAPTION);
    expect(html).toMatch(/<a href="\/place"[^>]*>\s*Look up an address\s*<\/a>/);
    expect(html).not.toMatch(/<input|type="search"|role="search"/);
  });

  it('does not show the Report line, a card, a ruler or a Lantern before the raise (requirement 1.4)', () => {
    expect(html).not.toContain("doesn't certify");
    expect(html).not.toContain('doesn&#x27;t certify');
    for (const id of ['find-card', 'era-ruler', 'lens-control', 'bottom-sheet', 'tag-row']) expect(html).not.toContain(`data-testid="${id}"`);
  });

  it('shows no Still, and no tags, until it has the Still and the anchors', () => {
    expect(html).not.toContain('data-testid="still"');
    expect(html).not.toContain('data-testid="tag-layer"><svg class="tag-strings" aria-hidden="true" focusable="false"><g');
  });
});

describe('the Still', () => {
  it('shows the picture that suits the window, with the bank tag pinned to its anchor, before the Player has loaded', () => {
    const html = render({ data: ready, still: parseStillMeta(stillJson) });
    expect(html).toMatch(/data-testid="still" data-kind="wide"/);
    expect(html).toContain('data-testid="pinned-bank"');
    expect(html).toContain('>Bank<');
    expect(html).toContain('data-faded="false"');
  });

  it('is not drawn for the Flat sheet', () => {
    expect(render({ data: ready, still: parseStillMeta(stillJson), webgl2: false })).not.toContain('data-testid="still"');
  });
});

describe('the Flat sheet landing (no WebGL 2)', () => {
  let html = '';
  beforeAll(() => {
    html = render({ data: ready, webgl2: false });
  });

  it('shows the 1911 sheet dimmed under today\'s outlines, with one line saying why', () => {
    expect(html).toContain('data-testid="flat-sheet"');
    expect(html).toContain('flat-sheet is-dimmed');
    expect(html).toContain('<path d="M');
    expect(html).toContain(`${NO_WEBGL2_MESSAGE} The sheet is shown flat.`);
    expect(html).not.toContain('data-testid="flat-footprints"');
  });

  it('keeps the headline and the button until the raise is pressed, and pins the tags on the flat sheet', () => {
    expect(html).toContain(`>${BLOCK_HEADLINE}</h1>`);
    expect(html).toContain('data-testid="raise-button"');
    expect(html).toContain('data-testid="pinned-overall-factory"');
    expect(html).toContain('data-testid="pinned-bank"');
  });

  it('says the 3D view did not start when the Player failed', () => {
    expect(PLAYER_FAILED_LINE).toMatch(/3D view did not start/);
  });
});

describe('a share link', () => {
  it('leaves out the headline and the button, since the page raises itself', () => {
    const html = render({ data: ready, routeSlug: 'coal-yard', webgl2: false });
    expect(html).not.toContain('data-testid="block-intro"');
    expect(html).toContain('<h1 class="visually-hidden">');
  });
});
