import { useCallback, useEffect, useRef, useState } from 'react';
import { BRIDGE_VERSION, createBridge } from '../bridge/bridge';
import type { Bridge, PayloadOf } from '../bridge/bridge';
import { fetchBuildFiles, startUnity } from '../bridge/unityLoader';
import type { UnityInstance } from '../bridge/unityLoader';
import { buildFrameFeature, buildRaise, buildSelectFeature, buildSetAnchors } from '../block/playerMessages';
import type { GateModel } from './gateModel';
import type { CameraPose } from './cameraPose';
import { buildAddFeatures, buildLoadEra, buildMarkers, buildSceneInit, buildSetCamera, buildSetDepth, listForPlayer } from './gateScene';
import { buildClearLot, buildFocusLot, buildSetDrapeMode, unpinOnLeave } from './pinnedLot';
import type { LotPolygon } from './pinnedLot';
import { buildSetLantern, buildShowEvidence } from './lantern';
import type { EvidenceCommand, LensCommand } from './lantern';
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
  /** A debug-only camera pose to send as debug/setCamera; `seq` changes with every new command. */
  cameraCommand: { seq: number; pose: CameraPose } | null;
  reducedMotion: boolean;
  /** The lot to pin (`/?lot=<id>`), or null for none. The Player outlines it, lights it and flies to it. */
  lot: LotPolygon | null;
  /** The Lantern lens (bridge 0.6.0): null until it has been on once, then always the latest state. */
  lantern: LensCommand | null;
  /** Show Evidence (bridge 0.6.0): the ghost to make transparent and the drape to put beneath it, or null. */
  evidence: EvidenceCommand | null;
  /** "View original scan": `original` shows the untouched rasters; `lit` is the default look. */
  drapeMode: 'lit' | 'original';
  /**
   * False leaves the land-use areas out of what the Player is sent (`?areas=0`, read when the Explorer mounts: the place
   * page rewrites its address as the era changes, so the query is not there later). A debug aid for tests.
   */
  areas: boolean;
  onPlayerState: (state: PlayerState) => void;
  onFeatureClicked: (featureId: string, eraId: string) => void;
  /** The Player cannot be used; the reason is fit to show. */
  onUnavailable: (reason: string) => void;
  /**
   * Workspace feature ids the visitor has not seen in the Explorer. Their eras load without them;
   * once the Player is running they arrive by scene/addFeatures and rise (spec 04 requirement 15.2).
   */
  risingIds: ReadonlySet<string>;
  /** Called with the ids that were sent by scene/addFeatures, so they can be recorded as seen. */
  onRose: (ids: string[]) => void;
  /** The Block page's extra conversation with the Player (bridge 0.8.0). Absent on the Explorer and the place page. */
  block?: BlockBinding;
};

/**
 * What the Block page (spec 06) adds to the Player's conversation. Everything here is a message of bridge 0.8.0 or the
 * Player's answer to one; `n` changes with every request so the same one can be asked for twice.
 */
export type BlockBinding = {
  /** The era whose `scene/loadEra` carries `held: true`: the landing look, until `scene/raise`. */
  holdEraId: string;
  /** The features to ask anchors of (`scene/setAnchors`), in find order. */
  anchorIds: readonly string[];
  onAnchors: (payload: PayloadOf<'scene/anchors'>) => void;
  /** `scene/raised`: the raise has settled. */
  onRaised: (eraId: string) => void;
  raise: { n: number; eraId: string; firstFeatureId: string; animate: boolean } | null;
  /** The selected feature (`scene/selectFeature`); null clears. */
  selectedFeatureId: string | null;
  /** "Show on the map" (`scene/frameFeature`). */
  frame: { n: number; featureId: string } | null;
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
  // Whether a lot is pinned in the Player (scene/focusLot sent, scene/clearLot not yet).
  const pinned = useRef(false);

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
    bridge.on('scene/anchors', (p) => latest.current.block?.onAnchors(p));
    bridge.on('scene/raised', (p) => latest.current.block?.onRaised(p.era_id));
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
        // ?areas=0 leaves the land-use areas out, so a test can compare the scene with and without them.
        const areasWanted = latest.current.areas;
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
          const eraList = model.lists.get(era.id);
          if (!eraList) throw new Error(`no Era list for ${era.id}`);
          const list = listForPlayer(eraList, areasWanted);
          bridge.send(buildLoadEra(era, list, model.drapes.get(era.id) ?? [], latest.current.risingIds, latest.current.block?.holdEraId === era.id));
          await done.promise;
          if (disposed) return;
        }
        // ?markers=0 leaves the markers out, so the drape placement test sees only the scene.
        const markersWanted = new URLSearchParams(window.location.search).get('markers') !== '0';
        if (debug && markersWanted && model.markers.length > 0) {
          bridge.send(buildMarkers(model.markers));
          update((s) => ({ ...s, markersSent: model.markers }));
        }
        update((s) => ({ ...s, running: true }));
        setRunning(true);

        // Workspace features the visitor has not seen yet rise into the scene now.
        const rose: string[] = [];
        for (const era of model.order) {
          const list = model.lists.get(era.id);
          const add = list ? buildAddFeatures(era, listForPlayer(list, areasWanted), latest.current.risingIds) : null;
          if (!add) continue;
          bridge.send(add);
          rose.push(...add.payload.features.map((f) => f.id));
        }
        if (rose.length > 0) {
          update((s) => ({ ...s, addedFeatureIds: [...new Set([...s.addedFeatureIds, ...rose])] }));
          latest.current.onRose([...new Set(rose)]);
        }
      } catch (error) {
        clearTimeout(timer);
        if (!disposed) latest.current.onUnavailable(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(timer);
      // Leaving the page: the lot is unpinned before the Player goes.
      unpinOnLeave(pinned, (message) => bridge.send(message));
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

  const { cameraCommand, lot } = props;
  // The pinned lot (bridge 0.5.0): sent once the Player is running, and cleared again if the page drops it.
  useEffect(() => {
    if (!running) return;
    if (lot) {
      bridgeRef.current?.send(buildFocusLot(lot));
      pinned.current = true;
    } else if (pinned.current) {
      bridgeRef.current?.send(buildClearLot());
      pinned.current = false;
    }
  }, [running, lot]);
  // "View original scan" (bridge 0.5.0): the default is lit, so nothing is sent until it changes.
  const sentMode = useRef<'lit' | 'original'>('lit');
  const { drapeMode } = props;
  useEffect(() => {
    if (!running || sentMode.current === drapeMode) return;
    bridgeRef.current?.send(buildSetDrapeMode(drapeMode));
    sentMode.current = drapeMode;
  }, [running, drapeMode]);
  useEffect(() => {
    if (!running || !debug || !cameraCommand) return;
    bridgeRef.current?.send(buildSetCamera(cameraCommand.pose));
  }, [running, debug, cameraCommand]);

  // The Lantern (bridge 0.6.0): every change of the lens is one message.
  const { lantern, evidence } = props;
  useEffect(() => {
    if (!running || !lantern) return;
    bridgeRef.current?.send(buildSetLantern(lantern));
  }, [running, lantern]);

  // The Block page (bridge 0.8.0). Each effect waits for `running`, so nothing is sent before the eras are loaded.
  const block = props.block;
  const anchorKey = block ? block.anchorIds.join(',') : null;
  useEffect(() => {
    if (!running || anchorKey === null) return;
    const ids = latest.current.block?.anchorIds ?? [];
    bridgeRef.current?.send(buildSetAnchors(ids));
  }, [running, anchorKey]);

  const raise = block?.raise ?? null;
  const raisedN = useRef(0);
  useEffect(() => {
    if (!running || !raise || raise.n === raisedN.current) return;
    raisedN.current = raise.n;
    bridgeRef.current?.send(buildRaise(raise.eraId, raise.firstFeatureId, raise.animate));
  }, [running, raise]);

  const selectedFeatureId = block ? block.selectedFeatureId : null;
  const sentSelection = useRef<string | null>(null);
  useEffect(() => {
    if (!running || !block || sentSelection.current === selectedFeatureId) return;
    sentSelection.current = selectedFeatureId;
    bridgeRef.current?.send(buildSelectFeature(selectedFeatureId));
  }, [running, block, selectedFeatureId]);

  const frame = block?.frame ?? null;
  const framedN = useRef(0);
  useEffect(() => {
    if (!running || !frame || frame.n === framedN.current) return;
    framedN.current = frame.n;
    bridgeRef.current?.send(buildFrameFeature(frame.featureId));
  }, [running, frame]);

  // Show Evidence (bridge 0.6.0): on for one ghost at a time, off when it ends or another takes its place.
  const evidenceOn = useRef<string | null>(null);
  useEffect(() => {
    if (!running) return;
    const bridge = bridgeRef.current;
    if (!bridge) return;
    if (evidenceOn.current !== null && evidenceOn.current !== evidence?.featureId) {
      bridge.send(buildShowEvidence(evidenceOn.current, null));
      evidenceOn.current = null;
    }
    if (evidence && evidenceOn.current !== evidence.featureId) {
      bridge.send(buildShowEvidence(evidence.featureId, evidence.drape));
      evidenceOn.current = evidence.featureId;
    }
  }, [running, evidence]);

  return (
    <canvas
      ref={canvasRef}
      id="unity-canvas"
      data-testid="unity-canvas"
      tabIndex={-1}
      onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
      aria-label="3D view of the neighbourhood"
    />
  );
}
