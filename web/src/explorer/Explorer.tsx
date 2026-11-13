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
import { buildGateCard } from './gateCard';
import { buildGateModel } from './gateModel';
import type { GateModel } from './gateModel';
import { INITIAL_PLAYER_STATE } from './playerState';
import type { PlayerState } from './playerState';
import { PRESENT_BUILDINGS_SOURCE } from './presentBuildings';
import { useDepth } from './useDepth';
import { NO_WEBGL2_MESSAGE, hasWebGL2 } from './webgl';

// The Player is loaded on demand, so the Sources page and (later) the Report never pull it in.
const UnityView = lazy(() => import('./UnityView'));

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: GateModel; problems: string[]; rising: ReadonlySet<string>; db: WorkspaceDb | null };

type Selection = { featureId: string; eraId: string };

/**
 * The Explorer: the Player filling the view, the depth gauge on its right edge, the evidence card
 * at its left edge and the attribution lines along its bottom edge (design.md "Layout"). The list
 * view, search and 2D map come in later task groups.
 */
export function Explorer() {
  const debug = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
  const reducedMotion = useMemo(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const webgl2 = useMemo(() => hasWebGL2(), []);

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [player, setPlayer] = useState<PlayerState>(INITIAL_PLAYER_STATE);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
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
    [goTo],
  );
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !model || deepLinkEra === null) return;
    deepLinked.current = true;
    const target = model.order.find((era) => era.id === deepLinkEra);
    if (target) chooseEra(target.index);
  }, [model, deepLinkEra, chooseEra]);
  const dragDepth = useCallback(
    (value: number) => {
      drag(value);
      setSelection(null);
    },
    [drag],
  );

  // The plain wheel over the 3D view is Dig's (requirement 16.5): it is taken in the capture phase,
  // so the Player never sees it. Ctrl, Cmd or Shift with the wheel go on to the Player to zoom; the
  // page itself is kept from zooming.
  const viewRef = useRef<HTMLElement>(null);
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
      const list = model?.lists.get(eraId);
      if (!list || !list.features.some((f) => f.id === featureId)) {
        // requirement 11.6: a click on something the Shell does not know is ignored and logged
        console.warn(`[explorer] ignored a click on ${featureId} in era ${eraId}: not in the current Era list`);
        return;
      }
      setSelection({ featureId, eraId });
    },
    [model],
  );

  const card = useMemo(() => {
    if (!model || !selection) return null;
    const entry = model.lists.get(selection.eraId)?.features.find((f) => f.id === selection.featureId);
    const feature = model.features.get(selection.featureId);
    if (!entry || !feature) return null;
    return buildGateCard(entry, feature, model.sources, model.workspaceFeatureIds.has(selection.featureId) ? 'workspace' : 'canon');
  }, [model, selection]);

  const closeCard = useCallback(() => setSelection(null), []);

  // The sources whose pictures are on screen: the drapes of the era shown, and today's building
  // outlines, which are drawn in every era (solid at Today, a faint outline in the others).
  const visibleSources = useMemo(() => {
    if (!model || !currentEra || !player.eraLoaded.includes(currentEra.id)) return [];
    const ids = (model.drapes.get(currentEra.id) ?? []).map((d) => d.sourceId);
    if (model.present.length > 0) ids.push(PRESENT_BUILDINGS_SOURCE);
    return ids;
  }, [model, currentEra, player.eraLoaded]);

  let stage: ReactNode;
  if (load.status === 'loading') {
    stage = <p className="stage-message">Loading the records.</p>;
  } else if (load.status === 'error') {
    stage = <p className="stage-message">The records could not be loaded. {load.message}</p>;
  } else if (!webgl2) {
    stage = <p className="stage-message">{NO_WEBGL2_MESSAGE}</p>;
  } else if (unavailable !== null) {
    stage = <p className="stage-message">The 3D view did not load: {unavailable}</p>;
  } else {
    stage = (
      <Suspense fallback={<p className="stage-message">Loading the 3D view.</p>}>
        <UnityView
          model={load.model}
          depth={depth}
          debug={debug}
          cameraCommand={debug ? cameraCommand : null}
          reducedMotion={reducedMotion}
          onPlayerState={setPlayer}
          onFeatureClicked={onFeatureClicked}
          onUnavailable={setUnavailable}
          risingIds={load.rising}
          onRose={onRose}
        />
      </Suspense>
    );
  }

  return (
    <main
      ref={viewRef}
      className="view"
      aria-label="Explorer"
      data-testid="view"
      data-player-ready={player.ready ? 'true' : 'false'}
      data-eras-loaded={player.eraLoaded.join(',')}
      data-workspace-features={model ? model.workspaceFeatureIds.size : undefined}
      data-workspace-rose={player.addedFeatureIds.length}
      data-camera={player.camera ? JSON.stringify({ viewProjection: player.camera.viewProjection, canvas: player.camera.canvas }) : undefined}
    >
      {stage}

      {model && <DepthGauge eras={model.order} index={dig.state.target} depth={depth} onChange={chooseEra} onDrag={dragDepth} onRelease={release} />}

      {card ? (
        <EvidenceCard card={card} onClose={closeCard} />
      ) : eraNote ? (
        <p className="view-hint view-note" role="status" data-testid="era-note">
          {eraNote}
        </p>
      ) : (
        model && <p className="view-hint">Click a building in the 3D view to see the evidence behind it.</p>
      )}

      {load.status === 'ready' && load.problems.length > 0 && (
        <div role="status" className="view-notes" data-testid="data-problems">
          {load.problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      )}

      <p role="status" aria-live="polite" className="visually-hidden" data-testid="era-announcement">
        {announcementFor(announcedEra)}
      </p>
      {model && <Attribution lines={attributionLines(visibleSources, model.sources)} />}
      {debug && <DebugState depth={depth} player={player} />}
      {debug && <DebugCamera onPose={sendPose} />}
    </main>
  );
}
