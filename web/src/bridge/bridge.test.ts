import { describe, expect, it } from 'vitest';
import bridgeSchema from '../../../data/schema/bridge.schema.json';
import {
  BRIDGE_VERSION,
  BridgeError,
  PLAYER_TO_SHELL,
  SHELL_TO_PLAYER,
  checkMessage,
  createBridge,
  defNameFor,
  parseMessage,
  serialiseMessage,
} from './bridge';
import type { UnityLike } from './bridge';
import { bridgeDefinitionNames } from './bridge.schema';
import { fixtureFiles } from './testing/fixtureFiles';
import type { BridgeMessage } from './types.generated';

const valid = (directory: string, name: string): string => {
  const file = fixtureFiles('valid').find((f) => f.path === `${directory}/${name}.json`);
  if (!file) throw new Error(`no valid fixture ${directory}/${name}`);
  return file.text;
};

function fakeUnity() {
  const calls: Array<[string, string, string | number | undefined]> = [];
  const unity: UnityLike = { SendMessage: (o, m, v) => void calls.push([o, m, v]) };
  return { unity, calls };
}

describe('the schema', () => {
  it('has the version this module reports', () => {
    expect(BRIDGE_VERSION).toBe('0.7.0');
  });

  it('has one message definition and one payload definition per message type', () => {
    const names = bridgeDefinitionNames();
    for (const type of [...SHELL_TO_PLAYER, ...PLAYER_TO_SHELL]) {
      expect(names, type).toContain(`${defNameFor(type)}Message`);
      expect(names, type).toContain(`${defNameFor(type)}Payload`);
    }
  });

  it('names no property like a year or a date (the Player never dates anything)', () => {
    const offenders: string[] = [];
    const visit = (node: unknown, path: string) => {
      if (Array.isArray(node)) return node.forEach((n, i) => visit(n, `${path}[${i}]`));
      if (node === null || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'properties' && value && typeof value === 'object') {
          for (const name of Object.keys(value)) {
            if (/year|date|window|phrase/i.test(name)) offenders.push(`${path}.properties.${name}`);
          }
        }
        visit(value, `${path}.${key}`);
      }
    };
    visit(bridgeSchema, '$');
    expect(offenders).toEqual([]);
  });

  it('defines every object with additionalProperties: false', () => {
    const loose: string[] = [];
    for (const [name, def] of Object.entries(bridgeSchema.$defs)) {
      const d = def as { type?: string; additionalProperties?: boolean };
      if (d.type === 'object' && d.additionalProperties !== false) loose.push(name);
    }
    expect(loose).toEqual([]);
  });
});

describe('defNameFor', () => {
  it('turns a message type into its schema definition name', () => {
    expect(defNameFor('scene/init')).toBe('sceneInit');
    expect(defNameFor('scene/loadEra')).toBe('sceneLoadEra');
    expect(defNameFor('debug/markers')).toBe('debugMarkers');
    expect(defNameFor('debug/setCamera')).toBe('debugSetCamera');
    expect(defNameFor('ready')).toBe('ready');
    expect(defNameFor('cameraChanged')).toBe('cameraChanged');
  });
});

describe('checkMessage', () => {
  it('accepts a valid scene/init', () => {
    expect(parseMessage(valid('scene_init', 'gate')).ok).toBe(true);
  });

  it('says why a message is refused', () => {
    const result = parseMessage('{"type":"scene/setDepth","payload":{"depth":-1}}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('scene/setDepth');
  });

  it('refuses things that are not messages', () => {
    for (const bad of [null, 3, 'x', [], {}, { type: 3 }, { type: 'nope', payload: {} }]) {
      expect(checkMessage(bad).ok).toBe(false);
    }
    expect(parseMessage('{ not json').ok).toBe(false);
  });

  it('refuses a ring that is not closed, even though the schema alone cannot say so', () => {
    const result = parseMessage(
      JSON.stringify({
        type: 'scene/loadEra',
        payload: {
          eraId: '1911',
          features: [
            {
              id: 'bld_fip_v3_1911_229_0001',
              kind: 'building',
              geometry: {
                type: 'Polygon',
                coordinates: [[[632440, 4834980], [632452, 4834980], [632452, 4834990], [632440, 4834990]]],
              },
              confidence: 'documented',
              heightM: 7,
            },
          ],
          drapes: [],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('not closed');
  });

  it('refuses era indexes that are not 0 to n-1', () => {
    const result = parseMessage(
      JSON.stringify({
        type: 'scene/init',
        payload: {
          bridgeVersion: '0.7.0',
          origin: { easting: 632500, northing: 4835000 },
          bounds: { minE: 631900, minN: 4834400, maxE: 633200, maxN: 4835600 },
          initialView: { minE: 632000, minN: 4834500, maxE: 633100, maxN: 4835500 },
          eras: [
            { id: 'today', index: 1 },
            { id: '1911', index: 2 },
          ],
          present: [],
          reducedMotion: false,
          debug: false,
        },
      }),
    );
    expect(result.ok).toBe(false);
  });
});

describe('createBridge', () => {
  it('installs buriedBridge on the host and removes it on dispose', () => {
    const host: { buriedBridge?: { onMessage(json: string): void } } = {};
    const bridge = createBridge({ host, log: () => {} });
    expect(typeof host.buriedBridge?.onMessage).toBe('function');
    bridge.dispose();
    expect(host.buriedBridge).toBeUndefined();
  });

  it('sends a valid message with SendMessage("Bridge", "Receive", json)', () => {
    const host = {};
    const bridge = createBridge({ host, log: () => {} });
    const { unity, calls } = fakeUnity();
    bridge.attach(unity);
    const message = JSON.parse(valid('scene_setDepth', 'depth_two')) as BridgeMessage;
    bridge.send(message as Extract<BridgeMessage, { type: 'scene/setDepth' }>);
    expect(calls).toEqual([['Bridge', 'Receive', JSON.stringify(message)]]);
  });

  it('throws and sends nothing when the message is invalid (requirement 4.7)', () => {
    const bridge = createBridge({ host: {}, log: () => {} });
    const { unity, calls } = fakeUnity();
    bridge.attach(unity);
    const bad = { type: 'scene/setDepth', payload: { depth: -3 } } as unknown as Extract<BridgeMessage, { type: 'scene/setDepth' }>;
    expect(() => bridge.send(bad)).toThrow(BridgeError);
    expect(calls).toEqual([]);
  });

  it('throws before the Player is attached', () => {
    const bridge = createBridge({ host: {}, log: () => {} });
    const ok = JSON.parse(valid('scene_setDepth', 'depth_two')) as Extract<BridgeMessage, { type: 'scene/setDepth' }>;
    expect(() => bridge.send(ok)).toThrow(BridgeError);
  });

  it('refuses to send a Player-to-Shell message', () => {
    const bridge = createBridge({ host: {}, log: () => {} });
    const { unity, calls } = fakeUnity();
    bridge.attach(unity);
    const ready = JSON.parse(valid('ready', 'ready')) as BridgeMessage;
    expect(() => bridge.send(ready as never)).toThrow(BridgeError);
    expect(calls).toEqual([]);
  });

  it('delivers a valid Player message to its handlers and drops an invalid one (requirement 4.6)', () => {
    const host: { buriedBridge?: { onMessage(json: string): void } } = {};
    const logged: string[] = [];
    const bridge = createBridge({ host, log: (m) => logged.push(m) });

    const clicks: string[] = [];
    bridge.on('featureClicked', (p) => clicks.push(p.featureId));
    const dropped: string[] = [];
    bridge.onDropped((reason) => dropped.push(reason));

    host.buriedBridge?.onMessage(valid('featureClicked', 'click'));
    expect(clicks).toEqual(['bld_fip_v3_1911_229_0001']);

    host.buriedBridge?.onMessage('{"type":"featureClicked","payload":{"featureId":"bld_1","eraId":"1911"}}');
    host.buriedBridge?.onMessage('not json');
    host.buriedBridge?.onMessage(valid('scene_setDepth', 'depth_two')); // wrong direction
    expect(clicks).toHaveLength(1);
    expect(dropped).toHaveLength(3);
    expect(logged).toHaveLength(3);
  });

  it('keeps going when a handler throws', () => {
    const host: { buriedBridge?: { onMessage(json: string): void } } = {};
    const bridge = createBridge({ host, log: () => {} });
    const seen: string[] = [];
    bridge.on('ready', () => {
      throw new Error('boom');
    });
    bridge.on('ready', (p) => seen.push(p.unityVersion));
    host.buriedBridge?.onMessage(valid('ready', 'ready'));
    expect(seen).toEqual(['6000.3.26f1']);
  });

  it('unsubscribes', () => {
    const host: { buriedBridge?: { onMessage(json: string): void } } = {};
    const bridge = createBridge({ host, log: () => {} });
    let n = 0;
    const off = bridge.on('ready', () => void n++);
    off();
    host.buriedBridge?.onMessage(valid('ready', 'ready'));
    expect(n).toBe(0);
  });
});

describe('serialiseMessage', () => {
  it('writes the same text JSON.stringify does for a valid message', () => {
    const message = JSON.parse(valid('debug_markers', 'three')) as BridgeMessage;
    expect(serialiseMessage(message)).toBe(JSON.stringify(message));
  });
});
