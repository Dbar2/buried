import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { browserFetchText, loadData } from '../data/loadData';
import { Attribution, attributionLines } from './Attribution';
import { DebugState } from './DebugState';
import { EvidenceCard } from './EvidenceCard';
import { buildGateCard } from './gateCard';
import { buildGateModel } from './gateModel';
import type { GateModel } from './gateModel';
import { INITIAL_PLAYER_STATE } from './playerState';
import type { PlayerState } from './playerState';
import { NO_WEBGL2_MESSAGE, hasWebGL2 } from './webgl';

// The Player is loaded on demand, so the Sources page and (later) the Report never pull it in.
const UnityView = lazy(() => import('./UnityView'));

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; model: GateModel; problems: string[] };

type Selection = { featureId: string; eraId: string };

/**
 * The gate Explorer (tasks.md 1.12): the Player on the left, a minimal era switch, and a DOM
 * evidence card. The depth gauge, list view, search and 2D map come in later task groups.
 */
export function Explorer() {
  const debug = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
  const reducedMotion = useMemo(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const webgl2 = useMemo(() => hasWebGL2(), []);

  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [depth, setDepth] = useState<number | null>(null);
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
  // Gate eras in chronological order for the switch: the deepest era first. The page opens on the
  // shallower one, so choosing the deeper era is a real depth change.
  const switchEras = useMemo(() => (model ? [...model.gateEras].sort((a, b) => b.index - a.index) : []), [model]);
  const currentIndex = depth ?? model?.gateEras[0]?.index ?? 0;
  const currentEra = model?.order.find((era) => era.index === currentIndex) ?? null;

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

  const visibleSources = useMemo(() => {
    if (!model || !currentEra || !player.eraLoaded.includes(currentEra.id)) return [];
    return (model.drapes.get(currentEra.id) ?? []).map((d) => d.sourceId);
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
          depth={currentIndex}
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
    <div className="shell">
      <header className="shell-header">
        <h1>Buried</h1>
        <div className="era-switch" role="group" aria-label="Era">
          {switchEras.map((era) => (
            <button
              key={era.id}
              type="button"
              data-testid={`era-${era.id}`}
              aria-pressed={era.index === currentIndex}
              onClick={() => chooseEra(era.index)}
            >
              {era.label}
            </button>
          ))}
        </div>
        <nav aria-label="Pages">
          <a href="/sources">Sources</a>
        </nav>
      </header>

      <div className="shell-main">
        <div className="stage">{stage}</div>
        <aside className="side" aria-label="Details">
          {card ? (
            <EvidenceCard card={card} onClose={closeCard} />
          ) : (
            <p className="muted">Click a building in the 3D view to see the evidence behind it.</p>
          )}
          {load.status === 'ready' && load.problems.length > 0 && (
            <div role="status" data-testid="data-problems">
              {load.problems.map((problem) => (
                <p key={problem} className="muted">
                  {problem}
                </p>
              ))}
            </div>
          )}
          {load.status === 'ready' && !player.ready && unavailable === null && webgl2 && (
            <p className="muted">Starting the 3D view.</p>
          )}
        </aside>
      </div>

      <footer className="shell-footer">
        <p role="status" aria-live="polite" className="visually-hidden">
          {currentEra ? `Now showing ${currentEra.label}` : ''}
        </p>
        {model && <Attribution lines={attributionLines(visibleSources, model.sources)} />}
        {debug && <DebugState depth={currentIndex} player={player} />}
      </footer>
    </div>
  );
}
