/**
 * The bridge boundary (spec 03 requirements 4.3, 4.9, 3.3, 6.6 and design.md "Testing strategy").
 *
 *  - Only web/src/bridge/ and web/src/explorer/UnityView.tsx may name SendMessage, buriedBridge or
 *    createUnityInstance.
 *  - Only unity/Assets/Buried/Runtime/Bridge/ may import native code (DllImport).
 *  - No C# runtime file holds a number of 100000 or more, so no origin is hard-coded in the Player.
 *  - No C# runtime file reads under data/ by itself.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const RUNTIME = fileURLToPath(new URL('../../../unity/Assets/Buried/Runtime', import.meta.url));

function walk(folder: string, extensions: readonly string[], found: string[] = []): string[] {
  for (const name of readdirSync(folder)) {
    const full = join(folder, name);
    if (statSync(full).isDirectory()) walk(full, extensions, found);
    else if (extensions.some((e) => name.endsWith(e))) found.push(full);
  }
  return found;
}

const posix = (path: string) => path.split(sep).join('/');

describe('the Shell side of the bridge boundary', () => {
  const allowed = (file: string) => {
    const rel = posix(relative(SRC, file));
    return rel.startsWith('bridge/') || rel === 'explorer/UnityView.tsx';
  };

  it('names SendMessage, buriedBridge and createUnityInstance only inside the bridge module and UnityView', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC, ['.ts', '.tsx'])) {
      if (allowed(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const word of ['SendMessage', 'buriedBridge', 'createUnityInstance']) {
        if (text.includes(word)) offenders.push(`${posix(relative(SRC, file))} mentions ${word}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps hex colours in tokens.css only', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC, ['.ts', '.tsx', '.css'])) {
      const rel = posix(relative(SRC, file));
      if (rel === 'styles/tokens.css' || rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue;
      if (/#[0-9a-fA-F]{6}\b/.test(readFileSync(file, 'utf8'))) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});

describe('the Player side of the bridge boundary', () => {
  const csharp = () => walk(RUNTIME, ['.cs']);

  /** Source with comments and string literals removed, so words in them are not counted. */
  const code = (text: string) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/@"(?:[^"]|"")*"/g, '""')
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

  it('imports native code only inside Runtime/Bridge/', () => {
    const offenders = csharp()
      .filter((file) => !posix(relative(RUNTIME, file)).startsWith('Bridge/'))
      .filter((file) => readFileSync(file, 'utf8').includes('DllImport'))
      .map((file) => posix(relative(RUNTIME, file)));
    expect(offenders).toEqual([]);
  });

  it('holds no number of 100000 or more (no hard-coded origin)', () => {
    const offenders: string[] = [];
    for (const file of csharp()) {
      const stripped = code(readFileSync(file, 'utf8'));
      const matches = stripped.match(/\b\d{6,}(?:\.\d+)?[fFdDmM]?\b/g);
      if (matches) offenders.push(`${posix(relative(RUNTIME, file))}: ${matches.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('never reads a file under data/ by itself', () => {
    const offenders: string[] = [];
    for (const file of csharp()) {
      const noComments = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      if (/File\.(Read|Open|Exists)|StreamReader|"[^"]*\bdata\/(?!tiles)/.test(noComments)) {
        offenders.push(posix(relative(RUNTIME, file)));
      }
    }
    expect(offenders).toEqual([]);
  });
});
