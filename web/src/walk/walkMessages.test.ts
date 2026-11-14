import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ALL_MESSAGE_TYPES, SHELL_TO_PLAYER, checkMessage, parseMessage, serialiseMessage } from '../bridge/bridge';
import { buildWalkEnter, buildWalkExit, buildWalkResume, buildWalkTeleport } from './walkMessages';

describe('the walk messages the Shell sends', () => {
  it('builds walk/enter, walk/resume and walk/exit that the bridge accepts', () => {
    for (const message of [buildWalkEnter(false), buildWalkEnter(true), buildWalkResume(), buildWalkExit()]) {
      expect(checkMessage(message).ok).toBe(true);
      expect(SHELL_TO_PLAYER as readonly string[]).toContain(message.type);
    }
    expect(buildWalkEnter(true).payload).toEqual({ reduced_motion: true });
  });

  it('builds walk/teleport and wraps the heading into [0, 360)', () => {
    expect(buildWalkTeleport(-7.5, 112, 17.5).payload).toEqual({ east: -7.5, north: 112, yaw_deg: 17.5 });
    expect(buildWalkTeleport(0, 0, 360).payload.yaw_deg).toBe(0);
    expect(buildWalkTeleport(0, 0, -90).payload.yaw_deg).toBe(270);
    fc.assert(
      fc.property(fc.double({ min: -5000, max: 5000, noNaN: true }), (yaw) => {
        const out = buildWalkTeleport(1, 2, yaw).payload.yaw_deg;
        return out >= 0 && out < 360 && checkMessage(buildWalkTeleport(1, 2, yaw)).ok;
      }),
    );
  });

  it('serialises to JSON the Player parses back to the same message', () => {
    const message = buildWalkTeleport(-7.562, 112, 17.5);
    const parsed = parseMessage(serialiseMessage(message));
    expect(parsed.ok && parsed.message).toEqual(message);
  });
});

describe('the walk messages the Player sends', () => {
  const ok = (value: unknown) => checkMessage(value).ok;

  it('accepts each of the five', () => {
    expect(ok({ type: 'walk/ready', payload: {} })).toBe(true);
    expect(ok({ type: 'walk/state', payload: { east: -18.75, north: 120, yaw_deg: 88.5 } })).toBe(true);
    expect(ok({ type: 'walk/nearPlaque', payload: { slug: 'overall-factory' } })).toBe(true);
    expect(ok({ type: 'walk/nearPlaque', payload: { slug: null } })).toBe(true);
    expect(ok({ type: 'walk/exhibit', payload: { slug: 'machine-shop' } })).toBe(true);
    expect(ok({ type: 'walk/pointerLock', payload: { locked: false } })).toBe(true);
  });

  it('refuses a malformed one', () => {
    expect(ok({ type: 'walk/state', payload: { east: 0, north: 0, yaw_deg: 360 } })).toBe(false);
    expect(ok({ type: 'walk/state', payload: { east: 0, north: 0 } })).toBe(false);
    expect(ok({ type: 'walk/nearPlaque', payload: {} })).toBe(false);
    expect(ok({ type: 'walk/nearPlaque', payload: { slug: 'Overall Factory' } })).toBe(false);
    expect(ok({ type: 'walk/exhibit', payload: { slug: null } })).toBe(false);
    expect(ok({ type: 'walk/pointerLock', payload: { locked: 'yes' } })).toBe(false);
    expect(ok({ type: 'walk/ready', payload: { extra: true } })).toBe(false);
  });

  it('knows all nine walk types and gives each a direction', () => {
    const walk = ALL_MESSAGE_TYPES.filter((t) => t.startsWith('walk/'));
    expect(walk).toHaveLength(9);
    expect(SHELL_TO_PLAYER.filter((t) => t.startsWith('walk/'))).toHaveLength(4);
  });
});
