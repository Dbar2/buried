import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { browserFetchText, loadData } from '../data/loadData';
import { openWorkspace } from '../workspace/db';
import type { WorkspaceDb } from '../workspace/db';
import { loadWorkspaceEvidence } from '../workspace/load';
import { mergeForDisplay } from '../workspace/merge';
import { unseenIds } from '../workspace/seen';
import { Attribution, attributionLines } from './Attribution';
import { DebugCamera } from './DebugCamera';
import type { CameraPose } from './cameraPose';
import { DebugState } from './DebugState';
import { EMPTY_WHEEL, settledEra, wheelIsDig, wheelNotches } from './depth';
import { DepthGauge, announcementFor } from './DepthGauge';
import { noImageryNote } from './eraNote';
import { EvidenceCard } from './EvidenceCard';
import { Fallback2D } from './Fallback2D';
import { featureRows } from './featureList';
import { FeatureList } from './FeatureListPanel';
import { buildGateCard } from './gateCard';
import { buildGateModel } from './gateModel';
import type { GateModel } from './gateModel';
import { INITIAL_PLAYER_STATE } from './playerState';
import type { PlayerState } from './playerState';
import { lotPolygon } from './pinnedLot';
import { lanternEra, lanternHelp, lanternLabel } from './lantern';
import { LanternToggle } from './LanternToggle';
import { evidenceCommand } from './showEvidence';
import { useLantern } from './useLantern';
import { useSeenOnce } from './useSeenOnce';
import { PRESENT_BUILDINGS_SOURCE } from './presentBuildings';
import { fallbackPlan, fallbackReason } from './sceneFallback';
import { useDepth } from './useDepth';
import { NO_WEBGL2_MESSAGE, hasWebGL2 } from './webgl';
import { Loading } from '../shell/Mark';

// The Player is loaded on demand, so the Sources page and (later) the Report never pull it in.
const UnityView = lazy(() => import('./UnityView'));

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: GateModel; problems: string[]; rising: ReadonlySet<string>; db: WorkspaceDb | null };

export type Selection = { featureId: string; eraId: string };

/** What the stage shows: the records are loading, the Player is running, or the 2D map stands in for it. */
export type StageKind = 'pending' | 'player' | 'fallback';

/**
 * How the place page drives the Explorer (session 029): the selected feature and the "View original
 * scan" mode live in the page, because the card is part of the report column. The Explorer reports
 * what it knows back: the model, the era on screen and what the stage is showing.
 */
export type PlaceBinding = {
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
  onModel: (model: GateModel | null) => void;
  /** The era on screen. It follows the depth, so it changes while the gauge is dragged. */
  onEraShown: (eraId: string, label: string) => void;
  onStage: (stage: StageKind) => void;
  drapeMode: 'lit' | 'original';
  /** Show the untouched scan beneath the selected building (the card's toggle). Off when nothing is selected. */
  showEvidence: boolean;
  /** Asks the Explorer to go to an era. `n` changes with every request, so the same era can be asked for twice. */
  eraRequest: { id: string; n: number } | null;
};

/**
 * `full` is the Explorer page. `place` is the scene on the place page: the same view with the depth
 * gauge on its left edge (design.md "Place page layout"). `backdrop` is the dusk scene behind the
 * landing: nothing on top of it, hidden from assistive technology, and not a target for the pointer.
 */
export type ExplorerVariant = 'full' | 'place' | 'backdrop';

/** What the landing is told about the scene behind it. */
export type SceneState = 'ready' | 'unavailable';

/**
 * The Explorer: the Player filling the view, the depth gauge on its right edge, the evidence card
 * at its left edge and the attribution lines along its bottom edge (design.md "Layout"). The list
 * view, search and 2D map come in later task groups.
 */
export function Explorer({
  variant = 'full',
  era: requestedEra = null,
  place,
  onScene,
}: {
  variant?: ExplorerVariant;
  era?: string | null;
  place?: PlaceBinding;
  /**
   * The landing's hook (session 031): `ready` once the Player has drawn a first frame with an era
   * built, `unavailable` when there will be no Player (no WebGL 2, the build failed, or the records
   * did not load). Each state is reported once.
   */
  onScene?: (state: SceneState) => void;
}) {
  const debug = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
  // `?areas=0` leaves the land-use areas out of the scene (a test aid). Read once: the place page rewrites its address later.
  const areasWanted = useMemo(() => new URLSearchParams(window.location.search).get('areas') !== '0', []);
  const reducedMotion = useMemo(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const webgl2 = useMemo(() => hasWebGL2(), []);
  // On a touch screen the hint says "Tap" (session 031).
  const coarsePointer = useMemo(() => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches, []);

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [player, setPlayer] = useState<PlayerState>(INITIAL_PLAYER_STATE);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [innerSelection, setInnerSelection] = useState<Selection | null>(null);
  const selection = place ? place.selection : innerSelection;
  const placeSelect = place?.onSelect;
  const setSelection = useCallback(
    (next: Selection | null) => (placeSelect ? placeSelect(next) : setInnerSelection(next)),
    [placeSelect],
  );
  // The hint "Click a building..." is shown until the first click or choice, then never again.
  const [clicked, setClicked] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [cameraCommand, setCameraCommand] = useState<{ seq: number; pose: CameraPose } | null>(null);
  const sendPose = useCallback((pose: CameraPose) => setCameraCommand((previous) => ({ seq: (previous?.seq ?? 0) + 1, pose })), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadData(browserFetchText);
      // The visitor's workspace, if the browser has one: its features are shown beside canon, never
      // in place of it (spec 04 requirement 14.4). A workspace that cannot be read is not an error.
      const db = await openWorkspace().catch(() => null);
      const workspace = await loadWorkspaceEvidence(db, data.evidence, data.sources);
      const merged = mergeForDisplay(data.evidence, workspace.collections);
      const seen = db ? await db.seenIds().catch(() => new Set<string>()) : new Set<string>();
      const rising = new Set(unseenIds(merged.workspaceFeatureIds, seen));
      const model = buildGateModel({ ...data, evidence: merged.collections }, merged.workspaceFeatureIds);
      return { model, problems: [...data.problems, ...workspace.problems], rising, db };
    })()
      .then(({ model, problems, rising, db }) => {
        if (!cancelled) setLoad({ status: 'ready', model, problems, rising, db });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const model = load.status === 'ready' ? load.model : null;
  const placeModel = place?.onModel;
  useEffect(() => {
    placeModel?.(model);
  }, [placeModel, model]);
  const rose = useRef<string[]>([]);
  const readyDb = load.status === 'ready' ? load.db : null;
  const onRose = useCallback(
    (ids: string[]) => {
      rose.current = [...rose.current, ...ids];
      void readyDb?.markSeen(ids, new Date().toISOString()).catch(() => {});
    },
    [readyDb],
  );

  // The deep link /?era=<id> opens the Explorer at that era (spec 04 requirement 15.3).
  const deepLinkEra = useMemo(() => new URLSearchParams(window.location.search).get('era'), []);
  // /?lot=<id> pins that City property boundary: outlined, lit, and framed by the camera.
  const deepLinkLot = useMemo(() => new URLSearchParams(window.location.search).get('lot'), []);
  const pinnedLot = useMemo(() => lotPolygon(model?.lots, deepLinkLot), [model, deepLinkLot]);

  // Dig (requirement 10): the Shell owns the depth. `depth` is a fraction while a transition runs.
  const dig = useDepth(model?.order.length ?? 0);
  const depth = dig.state.depth;
  const shownIndex = Math.round(depth);
  const currentEra = model?.order.find((era) => era.index === shownIndex) ?? null;
  const settled = settledEra(dig.state);
  const [announcedIndex, setAnnouncedIndex] = useState(0);
  useEffect(() => {
    if (settled !== null) setAnnouncedIndex(settled);
  }, [settled]);
  const announcedEra = model?.order.find((era) => era.index === announcedIndex);
  const settledInfo = settled === null ? undefined : model?.order.find((era) => era.index === settled);
  const eraNote = settledInfo && model ? noImageryNote(settledInfo, model.lists.get(settledInfo.id), model.drapes.get(settledInfo.id)) : null;


  const { goTo, step, drag, release } = dig;
  const chooseEra = useCallback(
    (index: number) => {
      goTo(index);
      setSelection(null);
    },
    [goTo, setSelection],
  );
  const appliedEra = useRef<string | null>(null);
  const eraRequest = place?.eraRequest ?? null;
  useEffect(() => {
    const wanted = eraRequest?.id ?? requestedEra ?? deepLinkEra;
    const key = `${wanted}#${eraRequest?.n ?? 0}`;
    if (!model || wanted === null || appliedEra.current === key) return;
    appliedEra.current = key;
    const target = model.order.find((era) => era.id === wanted);
    if (target) chooseEra(target.index);
  }, [model, requestedEra, deepLinkEra, eraRequest, chooseEra]);

  // The place page follows the era on screen: the header and the core sample's highlighted band.
  const placeEraShown = place?.onEraShown;
  const shownEraId = currentEra?.id;
  const shownEraLabel = currentEra?.label;
  useEffect(() => {
    if (shownEraId !== undefined && shownEraLabel !== undefined) placeEraShown?.(shownEraId, shownEraLabel);
  }, [placeEraShown, shownEraId, shownEraLabel]);
  const dragDepth = useCallback(
    (value: number) => {
      drag(value);
      setSelection(null);
    },
    [drag, setSelection],
  );

  // The plain wheel over the 3D view is Dig's (requirement 16.5): it is taken in the capture phase,
  // so the Player never sees it. Ctrl, Cmd or Shift with the wheel go on to the Player to zoom; the
  // page itself is kept from zooming.
  const viewRef = useRef<HTMLElement>(null);

  // The Lantern (requirement 13): Space held, a long press, or the toggle, at Today only. `?lanternEra=<id>` picks
  // the era inside the lens (default: the era at depth 1). Show Evidence: `?showEvidence=<feature id>` until the
  // evidence card has its own button.
  const lensEra = useMemo(
    () =>
      lanternEra(model?.order ?? [], new URLSearchParams(window.location.search).get('lanternEra'), (id) => (model?.drapes.get(id)?.length ?? 0) > 0),
    [model],
  );
  const lensLabel = useMemo(
    () => (model && lensEra !== null ? lanternLabel(model.sources, model.drapes.get(lensEra) ?? []) : 'Lantern'),
    [model, lensEra],
  );
  const lensHelp = useMemo(
    () => (model && lensEra !== null ? lanternHelp(model.sources, model.drapes.get(lensEra) ?? []) : null),
    [model, lensEra],
  );
  const lantern = useLantern({ viewRef, enabled: settled === 0 && player.running, eraId: lensEra });
  // One line of help the first time the control is on screen; it goes once the lens has been used.
  const lanternSeen = useSeenOnce('buried.lanternHelpSeen');
  const lensUsed = lantern.command?.on === true;
  const markLanternSeen = lanternSeen.markSeen;
  useEffect(() => {
    if (lensUsed) markLanternSeen();
  }, [lensUsed, markLanternSeen]);
  const urlEvidenceId = useMemo(() => new URLSearchParams(window.location.search).get('showEvidence'), []);
  // On the place page the card's toggle chooses the feature; `?showEvidence=<id>` still works without it.
  const evidenceId = place?.showEvidence && selection ? selection.featureId : urlEvidenceId;
  const evidence = useMemo(() => (model ? evidenceCommand(model, evidenceId, settled) : null), [model, evidenceId, settled]);
  const stepRef = useRef<(delta: number) => void>(() => {});
  stepRef.current = (delta: number) => {
    step(delta);
    setSelection(null);
  };
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;
    let accumulator = EMPTY_WHEEL;
    const onWheel = (event: WheelEvent) => {
      if (!(event.target instanceof HTMLCanvasElement)) return;
      event.preventDefault();
      if (!wheelIsDig(event)) return;
      event.stopPropagation();
      const result = wheelNotches(accumulator, event.deltaY, event.deltaMode, performance.now());
      accumulator = result.accumulator;
      if (result.notches !== 0) stepRef.current(result.notches);
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  const onFeatureClicked = useCallback(
    (featureId: string, eraId: string) => {
      setClicked(true);
      const list = model?.lists.get(eraId);
      if (!list || !list.features.some((f) => f.id === featureId)) {
        // requirement 11.6: a click on something the Shell does not know is ignored and logged
        console.warn(`[explorer] ignored a click on ${featureId} in era ${eraId}: not in the current Era list`);
        return;
      }
      setSelection({ featureId, eraId });
    },
    [model, setSelection],
  );

  const chooseFromList = useCallback(
    (featureId: string) => {
      if (!currentEra) return;
      setClicked(true);
      setSelection({ featureId, eraId: currentEra.id });
    },
    [currentEra, setSelection],
  );

  // On the place page the card is part of the report column, so the scene draws none of its own.
  const card = useMemo(() => {
    if (place || !model || !selection) return null;
    const entry = model.lists.get(selection.eraId)?.features.find((f) => f.id === selection.featureId);
    const feature = model.features.get(selection.featureId);
    if (!entry || !feature) return null;
    return buildGateCard(entry, feature, model.sources, model.workspaceFeatureIds.has(selection.featureId) ? 'workspace' : 'canon');
  }, [place, model, selection]);

  const closeCard = useCallback(() => setSelection(null), [setSelection]);

  // The sources whose pictures are on screen: the drapes of the era shown, and today's building
  // outlines, which are drawn in every era (solid at Today, a faint outline in the others).
  const visibleSources = useMemo(() => {
    if (!model || !currentEra || !player.eraLoaded.includes(currentEra.id)) return [];
    const ids = (model.drapes.get(currentEra.id) ?? []).map((d) => d.sourceId);
    if (model.present.length > 0) ids.push(PRESENT_BUILDINGS_SOURCE);
    return ids;
  }, [model, currentEra, player.eraLoaded]);

  const backdrop = variant === 'backdrop';
  // The 2D map stands in for the Player when it cannot run: no WebGL 2, or it failed to load.
  const fallbackActive = !backdrop && load.status === 'ready' && (!webgl2 || unavailable !== null);
  const plan = useMemo(
    () => (fallbackActive && model && currentEra ? fallbackPlan(model, currentEra.id, pinnedLot) : null),
    [fallbackActive, model, currentEra, pinnedLot],
  );
  const stageKind: StageKind = fallbackActive ? 'fallback' : load.status === 'ready' && player.running ? 'player' : 'pending';
  const placeStage = place?.onStage;
  useEffect(() => {
    placeStage?.(stageKind);
  }, [placeStage, stageKind]);

  // The landing waits for one of these two to decide whether to fade the scene in.
  const sceneDrawn = player.ready && player.eraLoaded.length > 0;
  const sceneGone = load.status === 'error' || (load.status === 'ready' && (!webgl2 || unavailable !== null));
  const reportedScene = useRef<SceneState | null>(null);
  useEffect(() => {
    const state: SceneState | null = sceneDrawn ? 'ready' : sceneGone ? 'unavailable' : null;
    if (state === null || reportedScene.current === state) return;
    reportedScene.current = state;
    onScene?.(state);
  }, [sceneDrawn, sceneGone, onScene]);

  let stage: ReactNode;
  if (backdrop && (load.status !== 'ready' || !webgl2 || unavailable !== null)) {
    // Behind the landing a missing scene is just the dusk colour: no message over the search field.
    stage = null;
  } else if (load.status === 'loading') {
    stage = (
      <div className="stage-message">
        <Loading text="Loading the records." />
      </div>
    );
  } else if (load.status === 'error') {
    stage = <p className="stage-message">The records could not be loaded. {load.message}</p>;
  } else if (fallbackActive) {
    stage = plan && currentEra ? <Fallback2D plan={plan} eraLabel={currentEra.label} /> : null;
  } else {
    stage = (
      <Suspense
        fallback={
          <div className="stage-message">
            <Loading text="Loading the 3D view." />
          </div>
        }
      >
        <UnityView
          model={load.model}
          depth={depth}
          debug={debug}
          cameraCommand={debug ? cameraCommand : null}
          reducedMotion={reducedMotion}
          lot={pinnedLot}
          lantern={lantern.command}
          evidence={evidence}
          drapeMode={place?.drapeMode ?? 'lit'}
          areas={areasWanted}
          onPlayerState={setPlayer}
          onFeatureClicked={onFeatureClicked}
          onUnavailable={setUnavailable}
          risingIds={load.rising}
          onRose={onRose}
        />
      </Suspense>
    );
  }

  // Text over the scene lives in one column, so that no two pieces can sit on each other: the era
  // note or the hint, the reason the 3D view is not shown, data notes, and the list of features.
  const sceneReady = load.status === 'ready';
  const showHint = sceneReady && !fallbackActive && !clicked && selection === null && !eraNote;
  const lanternOffered = !backdrop && model !== null && settled === 0 && lensEra !== null;
  const showLanternHelp = variant === 'place' && lanternOffered && !fallbackActive && !lanternSeen.seen && lensHelp !== null;
  const showList = !backdrop && model !== null && (variant === 'place' || fallbackActive);
  const rows = useMemo(() => featureRows(currentEra ? model?.lists.get(currentEra.id) : undefined, model?.features ?? new Map(), model?.workspaceFeatureIds), [model, currentEra]);
  const showStack = !backdrop && !card && sceneReady;

  const Wrapper = (backdrop ? 'div' : 'main') as 'main';
  return (
    <Wrapper
      ref={viewRef}
      className={variant === 'full' ? 'view' : `view view--${variant}`}
      aria-label={backdrop ? undefined : 'Explorer'}
      aria-hidden={backdrop ? true : undefined}
      data-testid="view"
      onClick={(event) => {
        // A click on the scene is the first click: the hint has done its job.
        if (!backdrop && event.target instanceof HTMLCanvasElement) setClicked(true);
      }}
      data-player-ready={player.ready ? 'true' : 'false'}
      data-eras-loaded={player.eraLoaded.join(',')}
      data-workspace-features={model ? model.workspaceFeatureIds.size : undefined}
      data-workspace-rose={player.addedFeatureIds.length}
      data-camera={player.camera ? JSON.stringify({ viewProjection: player.camera.viewProjection, canvas: player.camera.canvas }) : undefined}
    >
      {stage}

      {!backdrop && model && <DepthGauge eras={model.order} index={dig.state.target} depth={depth} onChange={chooseEra} onDrag={dragDepth} onRelease={release} />}
      {lanternOffered && <LanternToggle pressed={lantern.toggled} onToggle={lantern.toggle} label={lensLabel} />}

      {card && <EvidenceCard card={card} onClose={closeCard} />}

      {showStack && (
        <div className="view-top" data-testid="view-top">
          {fallbackActive && (
            <p className="view-hint view-reason" role="status" data-testid="fallback-reason">
              {fallbackReason(webgl2, unavailable, NO_WEBGL2_MESSAGE)}
            </p>
          )}
          {eraNote && (
            <p className="view-hint view-note" role="status" data-testid="era-note">
              {eraNote}
            </p>
          )}
          {showHint && (
            <p className="view-hint" data-testid="view-hint">
              {coarsePointer ? 'Tap' : 'Click'} a building in the 3D view to see the evidence behind it.
            </p>
          )}
          {showLanternHelp && (
            <p className="view-hint" data-testid="lantern-help">
              {lensHelp}
            </p>
          )}
          {load.problems.length > 0 && (
            <div role="status" className="view-notes" data-testid="data-problems">
              {load.problems.map((problem) => (
                <p key={problem}>{problem}</p>
              ))}
            </div>
          )}
          {showList && currentEra && (
            <FeatureList
              rows={rows}
              eraLabel={currentEra.label}
              open={listOpen}
              onToggle={() => setListOpen((open) => !open)}
              onChoose={chooseFromList}
              selectedId={selection?.featureId ?? null}
            />
          )}
        </div>
      )}

      {!backdrop && (
        <p role="status" aria-live="polite" className="visually-hidden" data-testid="era-announcement">
          {announcementFor(announcedEra)}
        </p>
      )}
      {!backdrop && model && <Attribution lines={attributionLines(visibleSources, model.sources)} />}
      {debug && <DebugState depth={depth} player={player} />}
      {debug && <DebugCamera onPose={sendPose} />}
    </Wrapper>
  );
}

