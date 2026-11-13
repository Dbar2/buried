import { lazy, Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { plainSourceName } from '../evidence';
import type { AnchorReport } from './playerMessages';
import { anchorsInStage, readAnchors } from './playerMessages';
import type { BlockBinding } from '../explorer/UnityView';
import { settledEra } from '../explorer/depth';
import { featureRows } from '../explorer/featureList';
import { FeatureList } from '../explorer/FeatureListPanel';
import { evidenceCommand } from '../explorer/showEvidence';
import { LENS_RADIUS, lanternLabel } from '../explorer/lantern';
import type { LensCommand } from '../explorer/lantern';
import { useDepth } from '../explorer/useDepth';
import { NO_WEBGL2_MESSAGE } from '../explorer/webgl';
import { useFindDocumentTitle, findDescriptionFor, findTitleFor } from '../shell/pageTitle';
import { SetPageTitle } from '../shell/SetPageTitle';
import { BottomSheet } from './BottomSheet';
import { EraRuler } from './EraRuler';
import { FindCard } from './FindCard';
import { FindTags } from './FindTags';
import { FlatSheet } from './FlatSheet';
import { LanternLens } from './LanternLens';
import { LeaderLine } from './LeaderLine';
import { RaiseButton } from './RaiseButton';
import { StillPicture } from './StillPicture';
import { blockLayout, tagKeepOut } from './blockLayout';
import { anchorFeatureIds, featureCentre, findCardView, ghostCardView, RAISE_ERA_ID, readingForEra, rulerStops, sceneFeatureFor, tagItems } from './blockModel';
import type { CardContext, LotFinder } from './blockModel';
import { findBySlug, findForFeature } from './finds';
import type { ResolvedFind } from './finds';
import { flatFootprints, flatPresent, flatTileFor, flatViewportPoint } from './flatModel';
import { copyLink, findLink } from './share';
import type { ShareOutcome } from './share';
import { flatShouldRaise, initialRaiseState, PLAYER_TIMEOUT_MS, raiseReducer, sendsRaise } from './raiseState';
import type { RaiseState } from './raiseState';
import { anchorsInViewport, STILL_SIZES, stillKindFor } from './stillAnchors';
import { estimateTagSize, layoutTags, leaderLine } from './tagLayout';
import type { Size, TagAnchor } from './tagLayout';
import type { BlockDataState, StillAnchors } from './useBlockData';
import { useBlockLens } from './useBlockLens';
import { useStageSize } from './useStageSize';
import type { PlayerState } from '../explorer/playerState';
import { INITIAL_PLAYER_STATE } from '../explorer/playerState';

// The Player (and the Unity loader behind it) is its own chunk: the Block page paints without it (requirement 2.1).
const UnityView = lazy(() => import('../explorer/UnityView'));

export const BLOCK_HEADLINE = 'Something used to stand here.';
export const BLOCK_LINE = 'Every ghost comes with the map that proves it.';
export const BLOCK_CAPTION = 'Queen Street East at River Street, Toronto. Two fire-insurance plans, 1911 and 1931-35.';
export const NOT_FOUND_NOTICE = 'No find by that name.';
export const PLAYER_FAILED_LINE = 'The 3D view did not start, so the sheet is shown flat.';

/** On the Flat sheet the raise takes as long as the Player's: the last outline has settled by 2.2 s. */
export const FLAT_SETTLE_MS = 2200;

const STILL_SOURCES = { wide: { src: '/still/block-wide.jpg' }, tall: { src: '/still/block-tall.jpg' } } as const;

type Selection = { kind: 'find'; slug: string } | { kind: 'ghost'; featureId: string };

export type BlockStageProps = {
  data: BlockDataState;
  /** The Still's anchors from `block.json`, or null when the Still is not there. */
  still: StillAnchors | null;
  /** The slug of `/find/<slug>`, or null on `/`. */
  routeSlug: string | null;
  siteOrigin: string;
  webgl2: boolean;
  reducedMotion: boolean;
  /** Loads `lotForPoint` for "Full record" (it brings in the geometry library, so it comes after first paint). */
  lotFor: LotFinder | null;
};

const rectStyle = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h });

/** Today's footprints as a path list are the Flat sheet's; this is the scene, the tags and everything over it. */
export function BlockStage(props: BlockStageProps) {
  const { data, still, routeSlug, siteOrigin, webgl2, reducedMotion, lotFor } = props;
  const stageRef = useRef<HTMLElement>(null);
  const stage = useStageSize(stageRef);
  const model = data.status === 'ready' ? data.model : null;
  const finds: readonly ResolvedFind[] = data.status === 'ready' ? data.finds : [];
  const firstFind = finds[0];
  const routeFind = routeSlug ? findBySlug(finds, routeSlug) : undefined;

  // ---- load states (requirements 2 and 3) -------------------------------------------------------------------------
  const [raise, dispatchRaise] = useReducer(raiseReducer, webgl2, (ok): RaiseState => (ok ? initialRaiseState : { phase: 'flat', pressed: false }));
  const [player, setPlayer] = useState<PlayerState>(INITIAL_PLAYER_STATE);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [afterPaint, setAfterPaint] = useState(false);
  useEffect(() => {
    // The Unity loader starts after first paint.
    const id = window.setTimeout(() => setAfterPaint(true), 0);
    const timeout = window.setTimeout(() => dispatchRaise('timeout'), PLAYER_TIMEOUT_MS);
    return () => {
      clearTimeout(id);
      clearTimeout(timeout);
    };
  }, []);
  useEffect(() => {
    if (player.running) dispatchRaise('ready');
  }, [player.running]);
  useEffect(() => {
    if (unavailable !== null) dispatchRaise('failed');
  }, [unavailable]);

  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (data.status !== 'ready' || !routeSlug) return;
    if (!routeFind) {
      // An unknown slug opens `/` with a line saying so (requirement 7.2).
      window.history.replaceState(null, '', '/');
      setNotice(NOT_FOUND_NOTICE);
    }
  }, [data.status, routeSlug, routeFind]);

  // A share link raises itself, without the animation.
  const autoPressed = useRef(false);
  useEffect(() => {
    if (routeFind && !autoPressed.current) {
      autoPressed.current = true;
      dispatchRaise('press');
    }
  }, [routeFind]);

  const flat = raise.phase === 'flat';
  const flatDrawing = flatShouldRaise(raise);
  const [flatSettled, setFlatSettled] = useState(false);
  useEffect(() => {
    if (!flatDrawing) return;
    // A share link, like reduced motion, has no animation: the outlines and the card are there at once.
    const id = window.setTimeout(() => setFlatSettled(true), reducedMotion || routeFind ? 0 : FLAT_SETTLE_MS);
    return () => clearTimeout(id);
  }, [flatDrawing, reducedMotion, routeFind]);
  const raised = raise.phase === 'raised' || flatSettled;

  // ---- the ruler and the depth ------------------------------------------------------------------------------------
  const dig = useDepth(model?.order.length ?? 0);
  const [eraId, setEraId] = useState('today');
  const eraIndex = useCallback((id: string): number => model?.order.find((e) => e.id === id)?.index ?? 0, [model]);

  // ---- the raise message ------------------------------------------------------------------------------------------
  const prevRaise = useRef(raise);
  const raiseN = useRef(0);
  const [raiseCmd, setRaiseCmd] = useState<NonNullable<BlockBinding['raise']> | null>(null);
  useEffect(() => {
    if (sendsRaise(prevRaise.current, raise) && model) {
      const first = firstFind ? (readingForEra(firstFind, RAISE_ERA_ID, model) ?? firstFind.primary).reading.feature_id : model.lists.get(RAISE_ERA_ID)?.features[0]?.id;
      if (first) {
        raiseN.current += 1;
        setRaiseCmd({ n: raiseN.current, eraId: RAISE_ERA_ID, firstFeatureId: first, animate: !reducedMotion && !routeFind });
      } else {
        dispatchRaise('raised'); // nothing to raise
      }
    }
    prevRaise.current = raise;
  }, [raise, model, firstFind, reducedMotion, routeFind]);

  // On the Flat sheet the raise era is chosen as the outlines start to draw.
  useEffect(() => {
    if (flatDrawing) setEraId(RAISE_ERA_ID);
  }, [flatDrawing]);

  // ---- selection (requirement 4) ----------------------------------------------------------------------------------
  const [selection, setSelection] = useState<Selection | null>(null);
  const [originalShown, setOriginalShown] = useState(false);
  const [shareOutcome, setShareOutcome] = useState<ShareOutcome | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [frameCmd, setFrameCmd] = useState<{ n: number; featureId: string } | null>(null);
  const select = useCallback((next: Selection | null) => {
    setSelection(next);
    setOriginalShown(false);
    setShareOutcome(null);
    setSheetExpanded(false);
  }, []);

  const wasRaised = useRef(false);
  useEffect(() => {
    if (!raised || wasRaised.current) return;
    wasRaised.current = true;
    // The raise ends: the ruler goes to 1911 (no tween through the eras between) and the first find selects itself.
    setEraId(RAISE_ERA_ID);
    dig.drag(eraIndex(RAISE_ERA_ID));
    dig.release();
    const target = routeFind ?? firstFind;
    if (target) select({ kind: 'find', slug: target.find.slug });
  }, [raised]);

  const onRaisedFromPlayer = useCallback(() => dispatchRaise('raised'), []);
  const onFeatureClicked = useCallback(
    (featureId: string, clickedEra: string) => {
      const list = model?.lists.get(clickedEra);
      if (!list || !list.features.some((f) => f.id === featureId)) {
        console.warn(`[block] ignored a click on ${featureId} in era ${clickedEra}: not in the current Era list`);
        return;
      }
      const find = findForFeature(finds, featureId);
      select(find ? { kind: 'find', slug: find.find.slug } : { kind: 'ghost', featureId });
    },
    [model, finds, select],
  );

  const selectedFind = selection?.kind === 'find' ? findBySlug(finds, selection.slug) : undefined;
  const selectedSceneId = model && selection ? (selectedFind ? sceneFeatureFor(selectedFind, eraId, model) : selection.kind === 'ghost' ? selection.featureId : null) : null;

  // ---- anchors, tags and the layout -------------------------------------------------------------------------------
  const [anchorReport, setAnchorReport] = useState<AnchorReport | null>(null);
  const anchorIds = useMemo(() => anchorFeatureIds(finds), [finds]);
  const onAnchors = useCallback((payload: Parameters<BlockBinding['onAnchors']>[0]) => setAnchorReport(readAnchors(payload)), []);

  const stillKind = stillKindFor(stage);
  const tile = model ? flatTileFor(model, eraId) : null;
  const cardOpen = raised && selection !== null;
  // Why the sheet is flat: one line in the caption bar at the foot of the page (requirement 3).
  const failedLine = flat ? (webgl2 ? PLAYER_FAILED_LINE : `${NO_WEBGL2_MESSAGE} The sheet is shown flat.`) : null;
  const rects = blockLayout({ w: stage.w, h: stage.h, cardOpen, sheetExpanded, raised, notice: failedLine !== null });
  // The Player's canvas and the Flat sheet fill the scene's box, which is the stage except on a phone after the raise.
  const scene = rects.scene;
  const sceneSize = useMemo(() => ({ w: scene.w, h: scene.h }), [scene.w, scene.h]);
  const tagAnchors = useMemo((): TagAnchor[] => {
    if (!model || finds.length === 0) return [];
    const ids = finds.map((f) => f.find.slug);
    const inStage = (a: TagAnchor): TagAnchor => ({ ...a, x: a.x + scene.x, y: a.y + scene.y });
    if (flat) {
      return finds.flatMap((f) => {
        const reading = readingForEra(f, eraId, model) ?? f.primary;
        const centre = featureCentre(reading.feature);
        if (!tile || !centre) return [];
        return [inStage({ id: f.find.slug, ...flatViewportPoint(tile, centre, sceneSize) })];
      });
    }
    if (player.running && anchorReport) {
      const sceneIds = finds.map((f) => sceneFeatureFor(f, eraId, model));
      return anchorsInStage(anchorReport, sceneIds, sceneSize).map((a, i) => inStage({ ...a, id: ids[i] as string }));
    }
    if (still) {
      const meta = still[stillKind];
      return finds.flatMap((f) => {
        const anchor = f.readings.map((r) => meta.get(r.reading.feature_id)).find((a) => a !== undefined);
        return anchor ? [inStage({ ...anchorsInViewport([anchor], STILL_SIZES[stillKind], sceneSize)[0]!, id: f.find.slug })] : [];
      });
    }
    return [];
  }, [model, finds, flat, eraId, tile, sceneSize, scene.x, scene.y, player.running, anchorReport, still, stillKind]);

  const selectedSlug = selectedFind?.find.slug ?? null;
  const tagSizes = useMemo(() => new Map<string, Size>(finds.map((f) => [f.find.slug, estimateTagSize(f.find.tag)])), [finds]);
  const tagLayoutResult = layoutTags({ anchors: tagAnchors, sizes: tagSizes, viewport: stage, keepOut: tagKeepOut(rects, raised), selectedId: raised ? selectedSlug : null });
  const items = useMemo(() => tagItems(finds), [finds]);
  const selectedAnchor = tagAnchors.find((a) => a.id === selectedSlug) ?? null;
  const leader = leaderLine({ anchor: selectedAnchor, card: rects.card, titleY: (rects.card?.y ?? 0) + 100, phone: rects.phone });

  // ---- the card -------------------------------------------------------------------------------------------------
  const cardContext: CardContext | null = model
    ? {
        model,
        eraId,
        siteOrigin,
        anchorOffScreen: !flat && selectedAnchor !== null && !selectedAnchor.onScreen,
        canShowOriginal: selectedSceneId !== null && model.tiles.some((t) => t.source === model.features.get(selectedSceneId)?.properties.provenance.origin_source),
        lotFor,
      }
    : null;
  const view = useMemo(() => {
    if (!cardContext || !selection) return null;
    if (selectedFind) return findCardView(selectedFind, cardContext);
    return selection.kind === 'ghost' ? ghostCardView(selection.featureId, cardContext) : null;
  }, [selection, selectedFind, model, eraId, siteOrigin, lotFor, flat, selectedAnchor?.onScreen, selectedSceneId]);

  const onShare = useCallback(async () => {
    if (!selectedFind) return;
    setShareOutcome(await copyLink(findLink(siteOrigin, selectedFind.find.slug), typeof navigator === 'undefined' ? null : navigator.clipboard));
  }, [selectedFind, siteOrigin]);
  const onShowOnMap = useCallback(() => {
    if (selectedSceneId) setFrameCmd((previous) => ({ n: (previous?.n ?? 0) + 1, featureId: selectedSceneId }));
  }, [selectedSceneId]);
  const closeCard = useCallback(() => select(null), [select]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelection((current) => (current === null ? current : null));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Show Evidence --------------------------------------------------------------------------------------------
  const settled = settledEra(dig.state);
  const evidence = useMemo(
    () => (model && originalShown && selectedSceneId ? evidenceCommand(model, selectedSceneId, settled) : null),
    [model, originalShown, selectedSceneId, settled],
  );

  // ---- the ruler ------------------------------------------------------------------------------------------------
  const stops = useMemo(() => (model ? rulerStops(model) : []), [model]);
  const onRulerChange = useCallback(
    (id: string) => {
      setEraId(id);
      setOriginalShown(false);
      dig.goTo(eraIndex(id));
    },
    [dig, eraIndex],
  );

  // ---- the Lantern ----------------------------------------------------------------------------------------------
  // The Player draws the lens only at Today (it ignores `scene/setLantern` on at any other depth, session 040). So on a
  // plan stop the Lantern first takes the ruler to Today and shows that plan inside the lens, and the lens is sent once
  // the depth has settled at 0. Turning it off puts the ruler back. The Flat sheet has no such limit.
  const lens = useBlockLens(raised);
  const [lensPlanEra, setLensPlanEra] = useState(RAISE_ERA_ID);
  const lensReturnEra = useRef<string | null>(null);
  useEffect(() => {
    if (flat) return;
    if (lens.on && eraId !== 'today') {
      lensReturnEra.current = eraId;
      setLensPlanEra(eraId);
      onRulerChange('today');
    } else if (!lens.on && lensReturnEra.current !== null) {
      const back = lensReturnEra.current;
      lensReturnEra.current = null;
      if (eraId === 'today') onRulerChange(back);
    }
  }, [flat, lens.on, eraId, onRulerChange]);
  const lensEraId = flat ? (eraId === 'today' ? RAISE_ERA_ID : 'today') : eraId === 'today' ? lensPlanEra : eraId;
  const lensSendable = flat || dig.state.depth === 0;
  const [lensEverOn, setLensEverOn] = useState(false);
  useEffect(() => {
    if (lens.on) setLensEverOn(true);
  }, [lens.on]);
  const lensCmd = useMemo<LensCommand | null>(
    () => (!lens.on && !lensEverOn ? null : { on: lens.on && lensSendable, center: lens.center, eraId: lensEraId }),
    [lens.on, lensSendable, lens.center, lensEverOn, lensEraId],
  );
  const lensLabel = model ? (lensEraId === 'today' ? 'Lantern: today' : lanternLabel(model.sources, model.drapes.get(lensEraId) ?? [])) : 'Lantern';

  // ---- the list -------------------------------------------------------------------------------------------------
  const [listOpen, setListOpen] = useState(false);
  const rows = useMemo(() => (model ? featureRows(model.lists.get(eraId), model.features) : []), [model, eraId]);
  const eraLabel = model?.order.find((e) => e.id === eraId)?.label ?? 'this date';

  // ---- page title for a share link -----------------------------------------------------------------------------
  const titleFind = routeFind;
  const titleSource = titleFind?.primary.source;
  const planWithArticle = titleSource ? plainSourceName(titleSource) : null;
  const firstLine = titleFind?.primary.reading.lettered[0];
  useFindDocumentTitle(
    titleFind && planWithArticle && firstLine ? findTitleFor(firstLine, planWithArticle.replace(/^the /, '')) : null,
    planWithArticle ? findDescriptionFor(planWithArticle) : null,
  );

  // ---- what is on screen ----------------------------------------------------------------------------------------
  const playerWanted = webgl2 && !flat && afterPaint && model !== null;
  // The Still stays until the Player has loaded the held era (not merely drawn a first frame) and has had two
  // animation frames to draw it; then it fades (requirement 2.3).
  const heldLoaded = player.running && player.eraLoaded.includes(RAISE_ERA_ID);
  const [heldDrawn, setHeldDrawn] = useState(false);
  useEffect(() => {
    if (!heldLoaded) {
      setHeldDrawn(false);
      return;
    }
    let second = 0;
    const first = window.requestAnimationFrame(() => {
      second = window.requestAnimationFrame(() => setHeldDrawn(true));
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
  }, [heldLoaded]);
  const stillFaded = heldDrawn && !flat;
  const introVisible = !routeFind && (raise.phase === 'still' || raise.phase === 'waiting' || raise.phase === 'ready' || (flat && !raise.pressed));
  const binding: BlockBinding = {
    holdEraId: RAISE_ERA_ID,
    anchorIds,
    onAnchors,
    onRaised: onRaisedFromPlayer,
    raise: raiseCmd,
    selectedFeatureId: raised ? selectedSceneId : null,
    frame: frameCmd,
  };

  const card = view ? (
    <FindCard view={view} shareOutcome={shareOutcome} originalShown={originalShown} onShowOriginalSheet={() => setOriginalShown((on) => !on)} onShare={onShare} onShowOnMap={onShowOnMap} onClose={closeCard} />
  ) : null;

  const flatEra = eraId;
  const flatBare = originalShown;
  const otherEra = flatEra === 'today' ? RAISE_ERA_ID : 'today';
  const flatLayer = (era: string, bare: boolean, isLens: boolean) => {
    const eraTile = model ? flatTileFor(model, era) : null;
    if (!model || !eraTile) return null;
    const today = era === 'today' && !bare;
    return (
      <FlatSheet
        tile={eraTile}
        footprints={today || bare ? [] : flatFootprints(model, era)}
        present={today ? flatPresent(model) : []}
        dimmed={today}
        toned={!bare}
        raised={bare ? false : isLens ? true : era === 'today' ? false : flatDrawing || raised}
        reducedMotion={isLens || reducedMotion || Boolean(routeFind)}
        selectedId={isLens ? null : selectedSceneId}
        onSelect={(id) => onFeatureClicked(id, era)}
      />
    );
  };

  return (
    <main
      ref={stageRef}
      className="block-stage"
      data-testid="block-page"
      data-phase={raise.phase}
      data-raised={raised}
      data-phone={rects.phone}
      data-era={eraId}
      data-flat={flat}
      data-held-loaded={heldLoaded}
    >
      <SetPageTitle page="block" />
      <div className="block-scene" style={rectStyle(scene)}>
        {flat ? (
          <>
            {flatLayer(flatEra, flatBare, false)}
            {lens.on ? (
              <div
                className="flat-lens-layer"
                data-testid="flat-lens-layer"
                style={{ clipPath: `circle(${Math.round(LENS_RADIUS * scene.h)}px at ${lens.center.x * scene.w}px ${lens.center.y * scene.h}px)` }}
              >
                {flatLayer(otherEra, false, true)}
              </div>
            ) : null}
          </>
        ) : null}
        {playerWanted && model ? (
          <Suspense fallback={null}>
            <UnityView
              model={model}
              depth={dig.state.depth}
              debug={false}
              cameraCommand={null}
              reducedMotion={reducedMotion}
              lot={null}
              lantern={lensCmd}
              evidence={evidence}
              drapeMode={originalShown ? 'original' : 'lit'}
              areas
              onPlayerState={setPlayer}
              onFeatureClicked={onFeatureClicked}
              onUnavailable={setUnavailable}
              risingIds={NO_IDS}
              onRose={noop}
              block={binding}
            />
          </Suspense>
        ) : null}
        {!flat ? <StillPicture sources={STILL_SOURCES} kind={stillKind} faded={stillFaded} /> : null}
      </div>

      <FindTags mode="pinned" items={items} layout={tagLayoutResult} selectedId={raised ? selectedSlug : null} onSelect={(slug) => select({ kind: 'find', slug })} />

      {introVisible ? (
        <div className="block-intro" data-testid="block-intro">
          {notice ? (
            <p className="block-notice" role="status" data-testid="block-notice">
              {notice}
            </p>
          ) : null}
          <h1 className="block-headline">{BLOCK_HEADLINE}</h1>
          <RaiseButton waiting={raise.phase === 'waiting'} onPress={() => dispatchRaise('press')} />
          <p className="block-line">{BLOCK_LINE}</p>
        </div>
      ) : (
        <h1 className="visually-hidden">{BLOCK_HEADLINE}</h1>
      )}

      {raised ? (
        <>
          <div className="block-top" style={rectStyle({ x: 0, y: 8, w: stage.w, h: 52 })}>
            <FindTags mode="row" items={items} selectedId={selectedSlug} onSelect={(slug) => select({ kind: 'find', slug })} />
          </div>
          <LeaderLine line={leader} />
          {rects.phone && rects.sheet && view ? (
            <div className="sheet-dock" style={rectStyle(rects.sheet)}>
              <BottomSheet
                expanded={sheetExpanded}
                onExpandedChange={setSheetExpanded}
                peek={{ kicker: view.kicker, title: view.lines[0] ?? '', status: view.status }}
              >
                {card}
              </BottomSheet>
            </div>
          ) : null}
          {!rects.phone && rects.card && card ? (
            <div className="card-dock" style={rectStyle(rects.card)} data-testid="card-dock">
              {card}
            </div>
          ) : null}
          <div className="ruler-dock" style={rectStyle(rects.ruler)}>
            <EraRuler stops={stops} value={eraId} onChange={onRulerChange} />
          </div>
          <LanternLens
            on={lens.on}
            center={lens.center}
            radius={LENS_RADIUS}
            area={{ width: scene.w, height: scene.h }}
            origin={{ x: scene.x, y: scene.y }}
            label={rects.phone ? 'Lantern' : lensLabel}
            accessibleName={rects.phone ? lensLabel : undefined}
            onToggle={lens.toggle}
            onMove={lens.setCenter}
            controlStyle={rectStyle(rects.lensControl)}
          />
          <div className="list-dock" style={{ left: rects.listControl.x, top: rects.listControl.y, minWidth: rects.listControl.w }}>
            <FeatureList rows={rows} eraLabel={eraLabel} open={listOpen} onToggle={() => setListOpen((open) => !open)} onChoose={(id) => onFeatureClicked(id, eraId)} selectedId={selectedSceneId} closedLabel="List" />
          </div>
        </>
      ) : null}

      <p className="block-caption" data-testid="block-caption" style={rectStyle(rects.caption)}>
        {failedLine ? (
          <span className="block-failed" role="status" data-testid="block-failed">
            {failedLine}
          </span>
        ) : (
          <span className="block-caption-name">{BLOCK_CAPTION}</span>
        )}{' '}
        <a href="/place" data-testid="look-up-address">
          Look up an address
        </a>
      </p>
    </main>
  );
}

const NO_IDS: ReadonlySet<string> = new Set();
const noop = () => {};
