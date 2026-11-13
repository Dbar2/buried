import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { browserFetchText, loadData } from '../data/loadData';
import { Attribution, attributionLines } from './Attribution';
import { DebugState } from './DebugState';
import { DepthGauge, announcementFor } from './DepthGauge';
import { EvidenceCard } from './EvidenceCard';
import { buildGateCard } from './gateCard';
import { buildGateModel } from './gateModel';
import type { GateModel } from './gateModel';
import { INITIAL_PLAYER_STATE } from './playerState';
import type { PlayerState } from './playerState';
import { PRESENT_BUILDINGS_SOURCE } from './presentBuildings';
import { NO_WEBGL2_MESSAGE, hasWebGL2 } from './webgl';

// The Player is loaded on demand, so the Sources page and (later) the Report never pull it in.
const UnityView = lazy(() => import('./UnityView'));

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: GateModel; problems: string[] };

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
  const [depth, setDepth] = useState(0);
  const [player, setPlayer] = useState<PlayerState>(INITIAL_PLAYER_STATE);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadData(browserFetchText)
      .then((data) => {
        if (!cancelled) setLoad({ status: 'ready', model: buildGateModel(data), problems: data.problems });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const model = load.status === 'ready' ? load.model : null;
  const currentEra = model?.order.find((era) => era.index === depth) ?? null;

  const chooseEra = useCallback((index: number) => {
    setDepth(index);
    setSelection(null);
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
    return buildGateCard(entry, feature, model.sources);
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
          reducedMotion={reducedMotion}
          onPlayerState={setPlayer}
          onFeatureClicked={onFeatureClicked}
          onUnavailable={setUnavailable}
        />
      </Suspense>
    );
  }

  return (
    <main
      className="view"
      aria-label="Explorer"
      data-testid="view"
      data-player-ready={player.ready ? 'true' : 'false'}
      data-eras-loaded={player.eraLoaded.join(',')}
      data-camera={player.camera ? JSON.stringify({ viewProjection: player.camera.viewProjection, canvas: player.camera.canvas }) : undefined}
    >
      {stage}

      {model && <DepthGauge eras={model.order} index={depth} onChange={chooseEra} />}

      {card ? (
        <EvidenceCard card={card} onClose={closeCard} />
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
        {announcementFor(currentEra ?? undefined)}
      </p>
      {model && <Attribution lines={attributionLines(visibleSources, model.sources)} />}
      {debug && <DebugState depth={depth} player={player} />}
    </main>
  );
}
