/**
 * The Block page against a fake Player (spec 06 session 042): the messages the page sends are valid bridge 0.8.0
 * messages, the Player's answers parse, and the raise goes out once, in the order the reducer allows. The real Player
 * is built in another checkout; the maintainer runs the browser suites against it after the lanes merge.
 */
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { checkMessage, createBridge } from '../bridge/bridge';
import { loadData } from '../data/loadData';
import { buildLoadEra } from '../explorer/gateScene';
import { buildGateModel } from '../explorer/gateModel';
import type { GateModel } from '../explorer/gateModel';
import { diskFetch, REPOSITORY_DATA } from '../explorer/testing/diskFetch';
import { RAISE_ERA_ID } from './blockModel';
import { anchorsInStage, buildFrameFeature, buildRaise, buildSelectFeature, buildSetAnchors, readAnchors } from './playerMessages';
import { initialRaiseState, raiseReducer, sendsRaise } from './raiseState';
import type { RaiseEvent, RaiseState } from './raiseState';

let model: GateModel;
beforeAll(async () => {
  model = buildGateModel(await loadData(diskFetch(REPOSITORY_DATA)));
});

describe('the messages the page sends', () => {
  it('are all valid bridge messages', () => {
    for (const message of [
      buildSetAnchors(['bld_fip_v3_1911_229_0001', 'bld_fip_v3_1911_229_0101']),
      buildRaise('1911', 'bld_fip_v3_1911_229_0101', true),
      buildRaise('1911', 'bld_fip_v3_1911_229_0101', false),
      buildSelectFeature('bld_fip_v3_1911_229_0101'),
      buildSelectFeature(null),
      buildFrameFeature('use_fip_v3_1911_229_0001'),
    ]) {
      expect(checkMessage(message), message.type).toEqual({ ok: true, message });
    }
  });

  it('use the snake_case names of the Schema', () => {
    expect(buildRaise('1911', 'bld_a_1', false).payload).toEqual({ era_id: '1911', first_feature_id: 'bld_a_1', animate: false });
    expect(buildSetAnchors(['a', 'a', 'b']).payload.feature_ids).toEqual(['a', 'b']);
    expect(buildSelectFeature(null).payload).toEqual({});
  });

  it('carry held: true on the raise era\'s first load only when asked (the landing look)', () => {
    const era = model.order.find((e) => e.id === RAISE_ERA_ID)!;
    const held = buildLoadEra(era, model.lists.get(era.id)!, model.drapes.get(era.id) ?? [], new Set(), true);
    const plain = buildLoadEra(era, model.lists.get(era.id)!, model.drapes.get(era.id) ?? []);
    expect(held.payload.held).toBe(true);
    expect('held' in plain.payload).toBe(false);
    expect(checkMessage(held).ok).toBe(true);
    expect(checkMessage(plain).ok).toBe(true);
  });
});

describe('a fake Player on the real bridge', () => {
  function setup() {
    const host: { buriedBridge?: { onMessage(json: string): void } } = {};
    const sent: unknown[] = [];
    const bridge = createBridge({ host, log: () => {} });
    bridge.attach({ SendMessage: (_object, _method, value) => sent.push(JSON.parse(String(value))) });
    const reply = (message: unknown) => host.buriedBridge!.onMessage(JSON.stringify(message));
    return { bridge, sent, reply };
  }

  it('answers scene/setAnchors with scene/anchors, which the page reads into stage positions', () => {
    const { bridge, reply } = setup();
    const received: ReturnType<typeof readAnchors>[] = [];
    bridge.on('scene/anchors', (p) => received.push(readAnchors(p)));
    bridge.send(buildSetAnchors(['bld_a_0001', 'bld_a_0002', 'bld_a_0003']));
    reply({
      type: 'scene/anchors',
      payload: {
        width: 800,
        height: 500,
        anchors: [
          { feature_id: 'bld_a_0001', x: 400, y: 250, on_screen: true },
          { feature_id: 'bld_a_0002', x: 900, y: 250, on_screen: false },
          { feature_id: 'bld_a_0003', x: 0, y: 0, on_screen: false },
        ],
      },
    });
    expect(received).toHaveLength(1);
    const anchors = anchorsInStage(received[0]!, ['bld_a_0001', 'bld_a_0002', 'bld_a_0003', 'bld_a_9999'], { w: 1600, h: 1000 });
    expect(anchors.map((a) => a.onScreen)).toEqual([true, false, false, false]);
    // The Player's canvas guess (800 by 500) is mapped by share onto the canvas the page measures.
    expect(anchors[0]).toMatchObject({ x: 800, y: 500 });
  });

  it('drops a scene/raised that is malformed, and passes one that is not', () => {
    const { bridge, reply } = setup();
    const raised: string[] = [];
    bridge.on('scene/raised', (p) => raised.push(p.era_id));
    reply({ type: 'scene/raised', payload: {} });
    reply({ type: 'scene/raised', payload: { era_id: '1911' } });
    expect(raised).toEqual(['1911']);
  });

  it('sends one raise for a press before the Player is ready, and selects once it has settled', () => {
    const { bridge, sent, reply } = setup();
    const settled: string[] = [];
    bridge.on('scene/raised', (p) => settled.push(p.era_id));

    let state: RaiseState = initialRaiseState;
    const step = (event: RaiseEvent) => {
      const next = raiseReducer(state, event);
      if (sendsRaise(state, next)) bridge.send(buildRaise(RAISE_ERA_ID, 'bld_fip_v3_1911_229_0101', true));
      state = next;
    };
    step('press'); // before the Player is ready: nothing goes out
    expect(sent).toHaveLength(0);
    step('ready');
    expect(sent).toEqual([{ type: 'scene/raise', payload: { era_id: '1911', first_feature_id: 'bld_fip_v3_1911_229_0101', animate: true } }]);
    step('ready');
    step('press');
    expect(sent).toHaveLength(1);
    reply({ type: 'scene/raised', payload: { era_id: '1911' } });
    step('raised');
    expect(state.phase).toBe('raised');
    expect(settled).toEqual(['1911']);
    bridge.send(buildSelectFeature('bld_fip_v3_1911_229_0101'));
    expect(sent).toHaveLength(2);
  });

  it('property: however events arrive, scene/raise goes out at most once', () => {
    const events = fc.array(fc.constantFrom<RaiseEvent>('press', 'ready', 'raised', 'failed', 'timeout'), { maxLength: 30 });
    fc.assert(
      fc.property(events, (sequence) => {
        let state: RaiseState = initialRaiseState;
        let sends = 0;
        for (const event of sequence) {
          const next = raiseReducer(state, event);
          if (sendsRaise(state, next)) sends += 1;
          state = next;
        }
        expect(sends).toBeLessThanOrEqual(1);
      }),
    );
  });
});
