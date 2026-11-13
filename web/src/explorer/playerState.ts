import type { PayloadOf } from '../bridge/bridge';
import type { GateMarker } from './gateMarkers';

/** What the Shell knows about the Player. Updated from bridge events; shown by DebugState when ?debug=1. */
export type PlayerState = {
  /** The Player reported ready (its first frame is drawn). */
  ready: boolean;
  /** scene/init and the gate eras are sent and loaded. */
  running: boolean;
  /** Era ids the Player has built and reported with eraLoaded. */
  eraLoaded: string[];
  /** Debug markers sent to the Player. */
  markersSent: GateMarker[];
  /** How many cameraChanged messages have arrived. The gate test waits for this to go up. */
  cameraSeq: number;
  camera: PayloadOf<'cameraChanged'> | null;
  /** Feature ids sent by scene/addFeatures (they rise). The Studio end-to-end test reads this. */
  addedFeatureIds: string[];
  /** Errors and dropped messages, newest last. */
  errors: string[];
};

export const INITIAL_PLAYER_STATE: PlayerState = {
  ready: false,
  running: false,
  eraLoaded: [],
  markersSent: [],
  cameraSeq: 0,
  camera: null,
  addedFeatureIds: [],
  errors: [],
};
