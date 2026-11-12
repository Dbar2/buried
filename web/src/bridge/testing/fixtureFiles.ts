/** Reads data/schema/bridge_fixtures/ for the tests (Node only). */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURES_ROOT = fileURLToPath(new URL('../../../../data/schema/bridge_fixtures', import.meta.url));

export type FixtureKind = 'valid' | 'invalid' | 'generated';

export type FixtureFile = {
  /** Path relative to the kind folder, with "/": "scene_init/gate.json". */
  path: string;
  /** The folder name: the message type with "/" replaced by "_" (or "envelope" for envelope faults). */
  directory: string;
  text: string;
};

function walk(folder: string, found: string[] = []): string[] {
  for (const name of readdirSync(folder)) {
    const full = join(folder, name);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (name.endsWith('.json')) found.push(full);
  }
  return found;
}

export function fixtureFiles(kind: FixtureKind): FixtureFile[] {
  const folder = join(FIXTURES_ROOT, kind);
  let files: string[];
  try {
    files = walk(folder);
  } catch {
    throw new Error(
      `No ${kind} bridge fixtures at ${folder}` +
        (kind === 'generated' ? ' (run `npm --prefix web run gen:bridge-samples`)' : ''),
    );
  }
  return files.sort().map((full) => {
    const path = relative(folder, full).split('\\').join('/');
    return { path, directory: path.split('/')[0] as string, text: readFileSync(full, 'utf8') };
  });
}
