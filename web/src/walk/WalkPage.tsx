import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createBridge } from '../bridge/bridge';
import type { Bridge } from '../bridge/bridge';
import { fetchBuildFiles, startUnity } from '../bridge/unityLoader';
import type { UnityInstance } from '../bridge/unityLoader';
import { FindCard } from '../block/FindCard';
import { findBySlug } from '../block/finds';
import { useBlockData } from '../block/useBlockData';
import { hasWebGL2 } from '../explorer/webgl';
import { exhibitView } from './exhibit';
import { buildWalkEnter, buildWalkExit, buildWalkResume, buildWalkTeleport } from './walkMessages';
import {
  INITIAL_WALK_STATE,
  PLAQUE_PROMPT,
  WALK_HINT,
  hintVisible,
  introButtonEnabled,
  introButtonLabel,
  promptVisible,
  walkPhase,
  walkReducer,
} from './walkState';
import '../block/block.css';
import './walk.css';

export const WALK_KICKER = 'Queen Street East at River Street';
export const WALK_TITLE = '1911';
export const WALK_LINE = 'Rebuilt from a fire-insurance plan. Walk it.';
export const NO_WEBGL_SENTENCE =
  'The walk needs 3D graphics, which this browser has turned off: switch on hardware acceleration in the browser settings, then reload this page.';
export const PAUSED_LINE = 'Paused. Click to keep walking.';

/** Shown instead of the walk when the browser has no WebGL 2: one plain sentence and a way out. */
export function NoWebGl() {
  return (
    <main className="walk walk-unavailable" data-testid="walk-no-webgl">
      <p className="walk-sentence">{NO_WEBGL_SENTENCE}</p>
      <a className="walk-link" href="/">
        Back to the block
      </a>
    </main>
  );
}

/** The dark overlay before the visitor steps inside. */
export function WalkIntro({ label, enabled, onStepInside }: { label: string; enabled: boolean; onStepInside: () => void }) {
  return (
    <>
      <p className="walk-kicker">{WALK_KICKER}</p>
      <h1 className="walk-title" id="walk-title">
        {WALK_TITLE}
      </h1>
      <p className="walk-line">{WALK_LINE}</p>
      <button type="button" className="walk-button" onClick={onStepInside} disabled={!enabled} data-testid="walk-step-inside">
        {label}
      </button>
    </>
  );
}

function requestLock(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  canvas.focus({ preventScroll: true });
  try {
    const result = canvas.requestPointerLock() as unknown;
    if (result instanceof Promise) result.catch(() => {});
  } catch {
    // The browser refused (no user gesture): the paused sentence stays and a click asks again.
  }
}

/**
 * `/walk` (spec 07): one street corner in 1911, walked in first person. The page owns the pointer lock (it asks for it in the
 * click that enters, which is a user gesture); the Player reports whether it holds. Everything the visitor reads about a find
 * comes from the same records as the Block page's card.
 */
export function WalkPage() {
  const webgl2 = useMemo(() => hasWebGL2(), []);
  const debug = useMemo(() => new URLSearchParams(window.location.search).get('debug') === '1', []);
  const reducedMotion = useMemo(
    () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [state, dispatch] = useReducer(walkReducer, INITIAL_WALK_STATE);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bridgeRef = useRef<Bridge | null>(null);
  const data = useBlockData();
  const [teleportText, setTeleportText] = useState('');

  useEffect(() => {
    document.title = `${WALK_KICKER}, ${WALK_TITLE} · Buried`;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!webgl2 || !canvas) return;
    let disposed = false;
    let instance: UnityInstance | null = null;
    const bridge = createBridge();
    bridgeRef.current = bridge;

    bridge.on('ready', () => dispatch({ type: 'playerReady' }));
    bridge.on('walk/ready', () => dispatch({ type: 'built' }));
    bridge.on('walk/state', (p) => dispatch({ type: 'pose', pose: { east: p.east, north: p.north, yawDeg: p.yaw_deg } }));
    bridge.on('walk/nearPlaque', (p) => dispatch({ type: 'near', slug: p.slug }));
    bridge.on('walk/exhibit', (p) => dispatch({ type: 'exhibit', slug: p.slug }));
    bridge.on('walk/pointerLock', (p) => dispatch({ type: 'lock', locked: p.locked }));
    bridge.on('error', (p) => {
      if (p.messageType === 'walk/enter') dispatch({ type: 'unavailable', reason: `The walk could not be built in this browser (${p.code}).` });
      else console.warn(`[walk] the Player reported ${p.code}: ${p.message}`);
    });

    // A browser release of the pointer (Esc) arrives as `pointerlockchange`: the Player reports it too, but only when its
    // own cursor state follows, so the page listens as well and the pause never waits on the Player.
    const onLockChange = () => dispatch({ type: 'lock', locked: document.pointerLockElement === canvas });
    document.addEventListener('pointerlockchange', onLockChange);

    void (async () => {
      try {
        const files = await fetchBuildFiles();
        instance = await startUnity(canvas, files);
        if (disposed) {
          void instance.Quit().catch(() => {});
          return;
        }
        bridge.attach(instance);
      } catch (error) {
        if (!disposed) dispatch({ type: 'unavailable', reason: error instanceof Error ? error.message : String(error) });
      }
    })();

    return () => {
      disposed = true;
      document.removeEventListener('pointerlockchange', onLockChange);
      try {
        bridge.send(buildWalkExit());
      } catch {
        // Not attached yet: there is nothing to leave.
      }
      bridge.dispose();
      bridgeRef.current = null;
      if (instance) void instance.Quit().catch(() => {});
    };
  }, [webgl2]);

  const stepInside = useCallback(() => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    requestLock(canvasRef.current);
    try {
      bridge.send(buildWalkEnter(reducedMotion));
      dispatch({ type: 'enter' });
    } catch (error) {
      dispatch({ type: 'unavailable', reason: error instanceof Error ? error.message : String(error) });
    }
  }, [reducedMotion]);

  const backToTheStreet = useCallback(() => {
    dispatch({ type: 'closeExhibit' });
    requestLock(canvasRef.current);
    try {
      bridgeRef.current?.send(buildWalkResume());
    } catch (error) {
      console.warn('[walk] could not resume', error);
    }
  }, []);

  const phase = walkPhase(state);

  const exhibit = useMemo(() => {
    if (state.exhibit === null || data.status !== 'ready') return null;
    const find = findBySlug(data.finds, state.exhibit);
    return find ? exhibitView(find, { model: data.model, siteOrigin: window.location.origin }) : null;
  }, [state.exhibit, data]);

  const teleport = useCallback(() => {
    const parts = teleportText.split(',').map((t) => Number(t.trim()));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return;
    try {
      bridgeRef.current?.send(buildWalkTeleport(parts[0] as number, parts[1] as number, parts[2] as number));
    } catch (error) {
      console.warn('[walk] could not teleport', error);
    }
  }, [teleportText]);

  if (!webgl2) return <NoWebGl />;

  return (
    <main className="walk" data-testid="walk" data-phase={phase}>
      <canvas ref={canvasRef} className="walk-canvas" id="unity-canvas" data-testid="unity-canvas" tabIndex={-1} aria-label="The corner of Queen Street East and River Street in 1911, in 3D" />

      {phase === 'intro' || phase === 'unavailable' ? (
        <section className="walk-intro" aria-labelledby="walk-title" data-testid="walk-intro">
          {phase === 'unavailable' ? (
            <>
              <p className="walk-kicker">{WALK_KICKER}</p>
              <h1 className="walk-title" id="walk-title">
                {WALK_TITLE}
              </h1>
              <p className="walk-sentence" role="alert" data-testid="walk-unavailable">
                {state.unavailable}
              </p>
              <a className="walk-link" href="/">
                Back to the block
              </a>
            </>
          ) : (
            <WalkIntro label={introButtonLabel(state)} enabled={introButtonEnabled(state)} onStepInside={stepInside} />
          )}
        </section>
      ) : null}

      {phase === 'walking' || phase === 'exhibit' || phase === 'paused' ? <span className="walk-dot" aria-hidden="true" /> : null}

      {hintVisible(state) ? (
        <p className="walk-hint" data-testid="walk-hint">
          {WALK_HINT}
        </p>
      ) : null}

      {promptVisible(state) ? (
        <p className="walk-prompt" role="status" data-testid="walk-prompt" data-slug={state.nearPlaque ?? undefined}>
          {PLAQUE_PROMPT}
        </p>
      ) : null}

      {phase === 'paused' ? (
        <div className="walk-paused" data-testid="walk-paused" onClick={() => requestLock(canvasRef.current)}>
          <p className="walk-sentence">{PAUSED_LINE}</p>
          <a className="walk-link" href="/" onClick={(event) => event.stopPropagation()}>
            Leave
          </a>
        </div>
      ) : null}

      {phase === 'exhibit' ? (
        <aside className="walk-exhibit" aria-label="Exhibit" data-testid="walk-exhibit">
          {exhibit ? (
            <>
              <FindCard view={exhibit.card} shareOutcome={null} onShowOriginalSheet={() => {}} onShare={() => {}} onShowOnMap={() => {}} />
              <p className="walk-note" data-testid="walk-from-plan">
                {exhibit.fromPlan}
              </p>
              <p className="walk-note" data-testid="walk-imagined">
                {exhibit.imagined}
              </p>
              <button type="button" className="walk-button" onClick={backToTheStreet} data-testid="walk-back">
                {exhibit.back}
              </button>
            </>
          ) : (
            <>
              <p className="walk-note">{data.status === 'loading' ? 'Loading the record.' : 'This exhibit has no record loaded.'}</p>
              <button type="button" className="walk-button" onClick={backToTheStreet} data-testid="walk-back">
                Back to the street
              </button>
            </>
          )}
        </aside>
      ) : null}

      {debug ? (
        <form
          className="walk-debug"
          onSubmit={(event) => {
            event.preventDefault();
            teleport();
          }}
        >
          <output
            data-testid="walk-pose"
            data-east={state.pose?.east ?? ''}
            data-north={state.pose?.north ?? ''}
            data-yaw={state.pose?.yawDeg ?? ''}
            data-locked={String(state.locked)}
            data-near={state.nearPlaque ?? ''}
          >
            {state.pose ? `${state.pose.east.toFixed(2)}, ${state.pose.north.toFixed(2)}, ${state.pose.yawDeg.toFixed(1)}` : 'no pose'}
          </output>
          <input aria-label="Teleport to east, north, heading" data-testid="walk-teleport-input" value={teleportText} onChange={(e) => setTeleportText(e.target.value)} />
          <button type="submit" data-testid="walk-teleport">
            Teleport
          </button>
        </form>
      ) : null}
    </main>
  );
}
