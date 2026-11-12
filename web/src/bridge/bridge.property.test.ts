/**
 * Property E1 (spec 03 design.md): every bridge message parses on the Shell side.
 * Gate subset: the nine messages of bridge version 0.1.0.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ALL_MESSAGE_TYPES, checkMessage, parseMessage, serialiseMessage } from './bridge';
import { anyMessage, messageArbitraries } from './testing/arbitraries';
import { fixtureFiles } from './testing/fixtureFiles';
import type { MessageType } from './bridge';

describe('E1: every generated message passes and survives a round trip', () => {
  for (const type of ALL_MESSAGE_TYPES) {
    it(type, () => {
      fc.assert(
        fc.property(messageArbitraries[type as MessageType], (message) => {
          const checked = checkMessage(message);
          expect(checked.ok, checked.ok ? '' : checked.reason).toBe(true);
          const parsed = parseMessage(serialiseMessage(message));
          expect(parsed.ok, parsed.ok ? '' : parsed.reason).toBe(true);
          if (parsed.ok) expect(parsed.message).toEqual(message);
        }),
        { numRuns: 200 },
      );
    });
  }

  it('any message', () => {
    fc.assert(
      fc.property(anyMessage, (message) => {
        expect(checkMessage(message).ok).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});

describe('E1: the fixtures', () => {
  it('every valid fixture passes', () => {
    const files = fixtureFiles('valid');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const result = parseMessage(file.text);
      expect(result.ok, `${file.path}: ${result.ok ? '' : result.reason}`).toBe(true);
    }
  });

  it('every generated fixture passes', () => {
    const files = fixtureFiles('generated');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const result = parseMessage(file.text);
      expect(result.ok, `${file.path}: ${result.ok ? '' : result.reason}`).toBe(true);
    }
  });

  it('every invalid fixture is refused', () => {
    const files = fixtureFiles('invalid');
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(parseMessage(file.text).ok, file.path).toBe(false);
    }
  });

  it('every message type has valid and generated fixtures, each filed under its own type', () => {
    for (const kind of ['valid', 'generated'] as const) {
      const files = fixtureFiles(kind);
      for (const type of ALL_MESSAGE_TYPES) {
        const directory = type.replace('/', '_');
        expect(files.filter((f) => f.directory === directory).length, `${kind} ${type}`).toBeGreaterThan(0);
      }
      for (const file of files) {
        const result = parseMessage(file.text);
        if (result.ok) expect(result.message.type.replace('/', '_'), file.path).toBe(file.directory);
      }
    }
  });

  it('every message type has at least one invalid fixture', () => {
    const files = fixtureFiles('invalid');
    for (const type of ALL_MESSAGE_TYPES) {
      const directory = type.replace('/', '_');
      expect(files.filter((f) => f.directory === directory).length, type).toBeGreaterThan(0);
    }
  });
});
