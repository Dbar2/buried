/**
 * The Shell side of the one typed bridge between the web shell and the Unity Player.
 *
 *   Shell to Player:  unityInstance.SendMessage("Bridge", "Receive", json)
 *   Player to Shell:  the .jslib calls window.buriedBridge.onMessage(json)
 *
 * This module is the only code that sends, receives, parses or serialises bridge messages, and the
 * only one that names `SendMessage` or `buriedBridge` (a boundary test scans for both). Every
 * outgoing message is validated and a bad one throws instead of being sent; every incoming message
 * is validated and a bad one is logged and dropped.
 */
import { BRIDGE_VERSION, bridgeValidator, describeErrors } from './bridge.schema';
import type { BridgeMessage } from './types.generated';

export { BRIDGE_VERSION };

export type MessageType = BridgeMessage['type'];
export type MessageOf<T extends MessageType> = Extract<BridgeMessage, { type: T }>;
export type PayloadOf<T extends MessageType> = MessageOf<T>['payload'];

export const SHELL_TO_PLAYER = ['scene/init', 'scene/loadEra', 'scene/setDepth', 'debug/markers'] as const;
export const PLAYER_TO_SHELL = ['ready', 'eraLoaded', 'featureClicked', 'cameraChanged', 'error'] as const;
export type ShellToPlayerType = (typeof SHELL_TO_PLAYER)[number];
export type PlayerToShellType = (typeof PLAYER_TO_SHELL)[number];

// Compile-time check: every message type in the schema has a direction, and no type is invented.
type Uncovered = Exclude<MessageType, ShellToPlayerType | PlayerToShellType>;
type Invented = Exclude<ShellToPlayerType | PlayerToShellType, MessageType>;
export const DIRECTIONS_COVER_THE_SCHEMA: [Uncovered, Invented] extends [never, never] ? true : never = true;

export const ALL_MESSAGE_TYPES: readonly string[] = [...SHELL_TO_PLAYER, ...PLAYER_TO_SHELL];

/** An outgoing message was invalid, or the Player is not attached. Nothing was sent. */
export class BridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BridgeError';
  }
}

/** 'scene/init' is the definition `sceneInit` in the Bridge Schema; 'ready' is `ready`. */
export function defNameFor(type: string): string {
  const [head = '', ...rest] = type.split('/');
  return head + rest.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

type Position = readonly number[];
type RingHolder = { type: string; coordinates: unknown };

function samePosition(a: Position, b: Position): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Every polygon ring of a geometry, for the closed-ring check. */
function* ringsOf(geometry: RingHolder): Generator<readonly Position[]> {
  if (geometry.type === 'Polygon') {
    yield* geometry.coordinates as readonly (readonly Position[])[];
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates as readonly (readonly (readonly Position[])[])[]) yield* polygon;
  }
}

function firstOpenRing(geometry: RingHolder): boolean {
  for (const ring of ringsOf(geometry)) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!first || !last || !samePosition(first, last)) return true;
  }
  return false;
}

function firstDuplicate(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) return v;
    seen.add(v);
  }
  return null;
}

/**
 * The rules JSON Schema cannot express. The Player's BridgeParser makes the same checks, and the
 * same invalid fixtures exercise both. Returns the reason, or null when the message passes.
 */
export function semanticProblem(message: BridgeMessage): string | null {
  switch (message.type) {
    case 'scene/init': {
      const p = message.payload;
      const dupEra = firstDuplicate(p.eras.map((e) => e.id));
      if (dupEra !== null) return `payload.eras has the era id "${dupEra}" more than once`;
      const indexes = p.eras.map((e) => e.index).sort((a, b) => a - b);
      if (!indexes.every((index, i) => index === i)) return 'payload.eras indexes must be 0 to n-1, each once';
      const dupBuilding = firstDuplicate(p.present.map((b) => b.id));
      if (dupBuilding !== null) return `payload.present has the building id "${dupBuilding}" more than once`;
      if (p.present.some((b) => firstOpenRing(b.geometry))) return 'payload.present has a ring that is not closed';
      return null;
    }
    case 'scene/loadEra': {
      const p = message.payload;
      const dupFeature = firstDuplicate(p.features.map((f) => f.id));
      if (dupFeature !== null) return `payload.features has the feature id "${dupFeature}" more than once`;
      const dupDrape = firstDuplicate(p.drapes.map((d) => d.sourceId));
      if (dupDrape !== null) return `payload.drapes has the source id "${dupDrape}" more than once`;
      if (p.features.some((f) => firstOpenRing(f.geometry))) return 'payload.features has a ring that is not closed';
      return null;
    }
    case 'debug/markers': {
      const dup = firstDuplicate(message.payload.markers.map((m) => m.id));
      return dup === null ? null : `payload.markers has the marker id "${dup}" more than once`;
    }
    default:
      return null;
  }
}

export type CheckResult = { ok: true; message: BridgeMessage } | { ok: false; reason: string };

/** Validate an unknown value as a bridge message: Envelope, payload, then the semantic rules. */
export function checkMessage(value: unknown): CheckResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'a message must be an object' };
  }
  const type = (value as { type?: unknown }).type;
  if (typeof type !== 'string') return { ok: false, reason: 'message.type must be a string' };
  if (!ALL_MESSAGE_TYPES.includes(type)) return { ok: false, reason: `"${type}" is not a known message type` };

  const validate = bridgeValidator(`${defNameFor(type)}Message`);
  if (!validate(value)) return { ok: false, reason: `${type} ${describeErrors(validate.errors)}` };

  const message = value as BridgeMessage;
  const problem = semanticProblem(message);
  return problem === null ? { ok: true, message } : { ok: false, reason: `${type}: ${problem}` };
}

/** Parse JSON text and validate it as a bridge message. */
export function parseMessage(json: string): CheckResult {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (cause) {
    return { ok: false, reason: `not valid JSON (${cause instanceof Error ? cause.message : String(cause)})` };
  }
  return checkMessage(value);
}

/** Validate a message and turn it into JSON text. Throws BridgeError when the message is invalid. */
export function serialiseMessage(message: BridgeMessage): string {
  const result = checkMessage(message);
  if (!result.ok) throw new BridgeError(`Refusing to send an invalid bridge message: ${result.reason}`);
  return JSON.stringify(message);
}

/** What the Unity loader's instance offers the bridge. */
export type UnityLike = {
  SendMessage(objectName: string, methodName: string, value?: string | number): void;
};

type BridgeHost = { buriedBridge?: { onMessage(json: string): void } };

export type BridgeOptions = {
  /** Where to install buriedBridge. Default: the page (globalThis). Tests pass their own object. */
  host?: BridgeHost;
  log?: (message: string) => void;
};

export interface Bridge {
  /** Give the bridge the Unity instance. Messages sent before this throw. */
  attach(instance: UnityLike): void;
  /** Validate, then SendMessage("Bridge", "Receive", json). Throws BridgeError and sends nothing if invalid. */
  send(message: MessageOf<ShellToPlayerType>): void;
  /** Listen for one kind of Player message. Returns an unsubscribe function. */
  on<T extends PlayerToShellType>(type: T, handler: (payload: PayloadOf<T>) => void): () => void;
  /** Listen for messages that were dropped as malformed, with the reason. */
  onDropped(handler: (reason: string, raw: string) => void): () => void;
  /** Remove buriedBridge from the host and forget every handler. */
  dispose(): void;
}

export function createBridge(options: BridgeOptions = {}): Bridge {
  const host: BridgeHost = options.host ?? (globalThis as unknown as BridgeHost);
  const log = options.log ?? ((m: string) => console.warn(`[bridge] ${m}`));

  let unity: UnityLike | null = null;
  const handlers = new Map<string, Set<(payload: never) => void>>();
  const droppedHandlers = new Set<(reason: string, raw: string) => void>();

  const drop = (reason: string, raw: string) => {
    log(`dropped a message from the Player: ${reason}`);
    for (const h of droppedHandlers) h(reason, raw);
  };

  const onMessage = (json: string) => {
    const result = parseMessage(typeof json === 'string' ? json : String(json));
    if (!result.ok) return drop(result.reason, String(json).slice(0, 200));

    const message = result.message;
    if (!(PLAYER_TO_SHELL as readonly string[]).includes(message.type)) {
      return drop(`"${message.type}" is a Shell-to-Player message`, String(json).slice(0, 200));
    }
    for (const h of handlers.get(message.type) ?? []) {
      try {
        (h as (payload: unknown) => void)(message.payload);
      } catch (error) {
        log(`a handler for ${message.type} threw: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const installed = { onMessage };
  host.buriedBridge = installed;

  return {
    attach(instance) {
      unity = instance;
    },
    send(message) {
      if (!(SHELL_TO_PLAYER as readonly string[]).includes(message.type)) {
        throw new BridgeError(`"${message.type}" is not a Shell-to-Player message`);
      }
      const json = serialiseMessage(message as BridgeMessage);
      if (unity === null) throw new BridgeError('The Player is not attached to the bridge yet');
      unity.SendMessage('Bridge', 'Receive', json);
    },
    on(type, handler) {
      const set = handlers.get(type) ?? new Set<(payload: never) => void>();
      handlers.set(type, set);
      set.add(handler as (payload: never) => void);
      return () => {
        set.delete(handler as (payload: never) => void);
      };
    },
    onDropped(handler) {
      droppedHandlers.add(handler);
      return () => {
        droppedHandlers.delete(handler);
      };
    },
    dispose() {
      if (host.buriedBridge === installed) delete host.buriedBridge;
      handlers.clear();
      droppedHandlers.clear();
      unity = null;
    },
  };
}
