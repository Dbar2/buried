import { useCallback, useEffect, useRef, useState } from 'react';
import { BRIDGE_VERSION, createBridge } from '../bridge/bridge';
import type { Bridge } from '../bridge/bridge';
import { fetchBuildFiles, startUnity } from '../bridge/unityLoader';
import type { UnityInstance } from '../bridge/unityLoader';
import type { GateModel } from './gateModel';
import { buildLoadEra, buildMarkers, buildSceneInit, buildSetDepth } from './gateScene';
import { INITIAL_PLAYER_STATE } from './playerState';
import type { PlayerState } from './playerState';

/** requirement 19.2 */
export const READY_TIMEOUT_MS = 30_000;

type Deferred = { promise: Promise<void>; resolve: () => void; reject: (reason: Error) => void };

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  promise.catch(() => {}); // a rejection nobody awaits yet must not be reported as unhandled
  return { promise, resolve, reject };
}

export type UnityViewProps = {
  model: GateModel;
  /** The depth (era index) to show. */
  depth: number;
  debug: boolean;
  reducedMotion: boolean;
  onPlayerState: (state: PlayerState) => void;
  onFeatureClicked: (featureId: string, eraId: string) => void;
  /** The Player cannot be used; the reason is fit to show. */
  onUnavailable: (reason: string) => void;
};

/**
 * Loads the Player (lazy, see Explorer.tsx), runs the start-up sequence of design.md "Startup" for
 * the gate eras, and keeps the Player's depth in step with the Shell's. This and src/bridge/ are the
 * only places that touch the Player.
 */
export default function UnityView(props: UnityViewProps) {
  const { model, debug, depth } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bridgeRef = useRef<Bridge | null>(null);
  const stateRef = useRef<PlayerState>(INITIAL_PLAYER_STATE);
  const latest = useRef(props);
  latest.current = props;
  const [running, setRunning] = useState(false);

  const update = useCallback((change: (previous: PlayerState) => PlayerState) => {
    stateRef.current = change(stateRef.current);
    latest.current.onPlayerState(stateRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let instance: UnityInstance | null = null;
    const bridge = createBridge();
    bridgeRef.current = bridge;
    stateRef.current = INITIAL_PLAYER_STATE;
    latest.current.onPlayerState(INITIAL_PLAYER_STATE);

    const ready = deferred();
    const loaded = new Map<string, Deferred>();
    const timer = setTimeout(
      () => ready.reject(new Error('the 3D view did not report that it was ready within 30 seconds')),
      READY_TIMEOUT_MS,
    );
    const addError = (text: string) => update((s) => ({ ...s, errors: [...s.errors, text] }));

    bridge.on('ready', () => {
      clearTimeout(timer);
      update((s) => ({ ...s, ready: true }));
      ready.resolve();
    });
    bridge.on('eraLoaded', (p) => {
      update((s) => ({ ...s, eraLoaded: [...s.eraLoaded, p.eraId] }));
      loaded.get(p.eraId)?.resolve();
    });
    bridge.on('featureClicked', (p) => latest.current.onFeatureClicked(p.featureId, p.eraId));
    bridge.on('cameraChanged', (p) => update((s) => ({ ...s, cameraSeq: s.cameraSeq + 1, camera: p })));
    bridge.on('error', (p) => addError(`${p.code}: ${p.message}`));
    bridge.onDropped((reason, raw) => {
      addError(`dropped a message: ${reason}`);
      // The schema fixes the bridge version in `ready`, so a Player with another version is dropped
      // as invalid. Recognise that case and say so (requirement 4.10): no scene/init is sent.
      try {
        const message = JSON.parse(raw) as { type?: unknown; payload?: { bridgeVersion?: unknown } };
        const theirs = message.payload?.bridgeVersion;
        if (message.type === 'ready' && typeof theirs === 'string' && theirs !== BRIDGE_VERSION) {
          console.warn(`[bridge] version mismatch: the Shell speaks ${BRIDGE_VERSION}, the Player speaks ${theirs}`);
          clearTimeout(timer);
          ready.reject(new Error(`the 3D view speaks bridge version ${theirs} and this page speaks ${BRIDGE_VERSION}`));
        }
      } catch {
        // Not JSON: already logged as dropped.
      }
    });

    void (async () => {
      try {
        const files = await fetchBuildFiles();
        instance = await startUnity(canvas, files);
        if (disposed) {
          void instance.Quit().catch(() => {});
          return;
        }
        bridge.attach(instance);

        await ready.promise;
        if (disposed) return;

        bridge.send(
          buildSceneInit(model.project, model.order, model.initialView, model.present, {
            reducedMotion: latest.current.reducedMotion,
            debug,
          }),
        );
        for (const era of model.order) {
          const done = deferred();
          loaded.set(era.id, done);
          const list = model.lists.get(era.id);
          if (!list) throw new Error(`no Era list for ${era.id}`);
          bridge.send(buildLoadEra(era, list, model.drapes.get(era.id) ?? []));
          await done.promise;
          if (disposed) return;
        }
        if (debug && model.markers.length > 0) {
          bridge.send(buildMarkers(model.markers));
          update((s) => ({ ...s, markersSent: model.markers }));
        }
        update((s) => ({ ...s, running: true }));
        setRunning(true);
      } catch (error) {
        clearTimeout(timer);
        if (!disposed) latest.current.onUnavailable(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(timer);
      bridge.dispose();
      bridgeRef.current = null;
      if (instance) void instance.Quit().catch(() => {});
      setRunning(false);
    };
  }, [model, debug, update]);

  useEffect(() => {
    if (!running) return;
    bridgeRef.current?.send(buildSetDepth(depth));
  }, [running, depth]);

  return <canvas ref={canvasRef} id="unity-canvas" data-testid="unity-canvas" aria-label="3D view of the neighbourhood" />;
}
