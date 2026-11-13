import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { SetPageTitle } from '../shell/SetPageTitle';
import { BLOCK_HEADLINE, BLOCK_LINE } from './BlockPage';
import { BottomSheet } from './BottomSheet';
import { EraRuler } from './EraRuler';
import { FindCard } from './FindCard';
import { FindTags } from './FindTags';
import { LanternLens } from './LanternLens';
import { LeaderLine } from './LeaderLine';
import { RaiseButton } from './RaiseButton';
import { sampleCardView, sampleRulerStops, sampleTags } from './sample';
import { estimateTagSize, layoutTags, leaderLine } from './tagLayout';
import type { Rect, Size, TagAnchor } from './tagLayout';
import './block.css';
import './blockPreview.css';

/*
 * `/block-preview`: a static composition of the Block page's parts over a flat stand-in for the scene, for
 * looking at the design before the Player is wired (spec 06, session 041). Not linked from anywhere. Part three
 * removes it. `?state=landing` shows the landing (headline, button, pinned tags); the default is the raised page
 * (find tags along the top, the card, the ruler, the Lantern, the leader line).
 */

const CARD_WIDTH = 360;
const SHEET_PEEK = 168;
const RULER_WIDTH = 560;

/** Where the finds sit on the stand-in scene, as shares of the stage (wide, and phone). */
const ANCHORS = {
  wide: { 'overall-factory': [0.44, 0.52], bank: [0.56, 0.36], 'coal-yard': [0.3, 0.68] },
  phone: { 'overall-factory': [0.42, 0.4], bank: [0.66, 0.28], 'coal-yard': [0.3, 0.52] },
} as const;

function useStageSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ w: window.innerWidth, h: Math.max(0, window.innerHeight - 56) });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function BlockPreview() {
  const landing = new URLSearchParams(window.location.search).get('state') === 'landing';
  const stage = useRef<HTMLElement>(null);
  const size = useStageSize(stage);
  const phone = size.w < 720;

  const [selectedId, setSelectedId] = useState<string | null>(landing ? null : 'overall-factory');
  const [eraId, setEraId] = useState('1911');
  const [lensOn, setLensOn] = useState(!landing);
  const [lens, setLens] = useState({ x: 0.3, y: 0.58 });
  const [expanded, setExpanded] = useState(false);
  const [waiting, setWaiting] = useState(false);

  const anchors: TagAnchor[] = useMemo(() => {
    const shares = ANCHORS[phone ? 'phone' : 'wide'];
    return sampleTags.map((tag) => {
      const [fx, fy] = shares[tag.id as keyof typeof shares];
      return { id: tag.id, x: Math.round(fx * size.w), y: Math.round(fy * size.h), onScreen: true };
    });
  }, [phone, size.w, size.h]);

  // Keep-out rectangles, in the stage's own pixels, matching blockPreview.css.
  const cardRect: Rect | null = landing || phone ? null : { x: size.w - 24 - CARD_WIDTH, y: 72, w: CARD_WIDTH, h: Math.max(0, size.h - 72 - 16) };
  const sheetRect: Rect | null = landing || !phone ? null : { x: 0, y: expanded ? size.h * 0.12 : size.h - SHEET_PEEK, w: size.w, h: expanded ? size.h * 0.88 : SHEET_PEEK };
  const rulerBottom = phone ? SHEET_PEEK + 12 : 16;
  const rulerW = phone ? size.w - 32 : RULER_WIDTH;
  const rulerRect: Rect = { x: (size.w - rulerW) / 2, y: size.h - rulerBottom - 76, w: rulerW, h: 76 };
  const lensRect: Rect = phone ? { x: 16, y: size.h - SHEET_PEEK - 12 - 76 - 8 - 44, w: 150, h: 44 } : { x: 16, y: size.h - 16 - 44, w: 150, h: 44 };
  const introRect: Rect = { x: 0, y: size.h * 0.1, w: phone ? size.w : Math.min(480, size.w * 0.32) + size.w * 0.05 + 16, h: phone ? 330 : 300 };
  const keepOut: Rect[] = landing
    ? [introRect]
    : [{ x: 0, y: 0, w: size.w, h: 68 }, ...(cardRect ? [cardRect] : []), ...(sheetRect ? [sheetRect] : []), rulerRect, lensRect];

  const sizes = useMemo(() => new Map<string, Size>(sampleTags.map((tag) => [tag.id, estimateTagSize(tag.text)])), []);
  const layout = layoutTags({ anchors, sizes, viewport: size, keepOut, selectedId });

  const selectedAnchor = anchors.find((a) => a.id === selectedId) ?? null;
  const leader = leaderLine({ anchor: selectedAnchor, card: cardRect, titleY: (cardRect?.y ?? 0) + 100, phone });

  const card = (
    <FindCard view={sampleCardView} shareOutcome={null} onShowOriginalSheet={() => undefined} onShare={() => undefined} onShowOnMap={() => undefined} />
  );

  return (
    <main className="block-stage block-preview" ref={stage} data-testid="block-preview" data-phone={phone} data-state={landing ? 'landing' : 'raised'}>
      <SetPageTitle page="block" />
      <div className="preview-scene" aria-hidden="true">
        <div className="preview-plate">
          <span className="preview-label">Stand-in for the scene</span>
        </div>
      </div>

      {landing ? (
        <div className="block-intro">
          <h1 className="block-headline">{BLOCK_HEADLINE}</h1>
          <RaiseButton waiting={waiting} onPress={() => setWaiting(true)} />
          <p className="block-line">{BLOCK_LINE}</p>
        </div>
      ) : (
        <h1 className="visually-hidden">Block page parts, design check</h1>
      )}

      <FindTags mode="pinned" items={sampleTags} layout={layout} selectedId={selectedId} onSelect={setSelectedId} />

      {landing ? null : (
        <>
          <div className="block-top">
            <FindTags mode="row" items={sampleTags} selectedId={selectedId} onSelect={setSelectedId} />
          </div>
          <LeaderLine line={leader} />
          {phone ? (
            <BottomSheet
              expanded={expanded}
              onExpandedChange={setExpanded}
              peek={{ kicker: sampleCardView.kicker, title: sampleCardView.lines[0] ?? '', status: sampleCardView.status }}
            >
              {card}
            </BottomSheet>
          ) : (
            <div className="card-dock">{card}</div>
          )}
          <div className="ruler-dock">
            <EraRuler stops={sampleRulerStops} value={eraId} onChange={setEraId} />
          </div>
          <LanternLens
            on={lensOn}
            center={lens}
            radius={0.18}
            area={{ width: size.w, height: size.h }}
            label="Lantern"
            onToggle={() => setLensOn((on) => !on)}
            onMove={setLens}
          />
        </>
      )}
    </main>
  );
}
