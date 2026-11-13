/**
 * A sample find, for the render tests. The readings are real, from the 1911 plan, sheet 229 (spec 06 session 041). The
 * Block page reads `data/finds.json` through `finds.ts` and `blockModel.ts`; nothing outside tests imports this.
 */
import type { CardViewModel } from './FindCard';
import type { RulerStop } from './EraRuler';
import type { TagItem } from './FindTags';
import type { FlatFootprint, FlatTile } from './FlatSheet';

export const SAMPLE_TILE_SRC = '/data/tiles/fip_v3_1911_229.jpg';

export const sampleCardView: CardViewModel = {
  kicker: 'LETTERED ON THE 1911 PLAN',
  lines: ['Glove & Overall Factory', 'Hamilton Carhartt Mfr. Ltd.'],
  crop: {
    src: SAMPLE_TILE_SRC,
    tileWidth: 3626,
    tileHeight: 4096,
    rect: { x: 2090, y: 440, width: 390, height: 300 },
    alt: 'The lettering as drawn on the 1911 plan, sheet 229',
  },
  seenOn: 'Seen on: 1911 plan, sheet 229',
  position: 'Positioned within about 4.5 m',
  status: 'Status: draft, not yet reviewed',
  rulerLine: 'On the 1931-35 plan this factory is lettered “Glove & Overall Fac.”.',
  actions: { showOriginalSheet: true, share: true, fullRecord: true, showOnMap: false },
  fullRecordHref: '/report',
  shareLink: 'https://buried.pages.dev/find/overall-factory',
};

export const sampleTags: readonly TagItem[] = [
  { id: 'overall-factory', text: 'Overall factory' },
  { id: 'bank', text: 'Bank' },
  { id: 'coal-yard', text: 'Coal yard' },
];

export const sampleRulerStops: readonly RulerStop[] = [
  { id: 'today', label: 'Today', announcement: 'Now showing today' },
  { id: '1935', label: '1935', announcement: 'Now showing the 1931-35 plan' },
  { id: '1911', label: '1911', announcement: 'Now showing the 1911 plan' },
];

/** The sidecar of `data/tiles/fip_v3_1911_229.json`, corners only. */
export const sampleTile: FlatTile = {
  src: SAMPLE_TILE_SRC,
  widthPx: 3626,
  heightPx: 4096,
  corners: {
    top_left: [632312.268258896, 4835087.454831159],
    top_right: [632596.4688413026, 4835177.21913871],
    bottom_right: [632699.789440777, 4834849.898286615],
    bottom_left: [632415.5888583706, 4834760.1339790635],
  },
};

/** Three footprints, one per confidence class, as 20 m squares near the middle of the sheet. */
export const sampleFootprints: readonly FlatFootprint[] = (['documented', 'estimated', 'unknown'] as const).map((confidence, i): FlatFootprint => {
  const e = 632_450 + i * 30;
  const n = 4_834_980;
  return {
    id: `sample_${confidence}`,
    confidence,
    name: `Sample ${confidence} footprint`,
    rings: [
      [
        [e, n],
        [e + 20, n],
        [e + 20, n - 20],
        [e, n - 20],
        [e, n],
      ],
    ],
  };
});
