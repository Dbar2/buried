/**
 * Write deterministic random bridge messages to data/schema/bridge_fixtures/generated/<message dir>/<nn>.json.
 *
 * Run from web/:  npm run gen:bridge-samples
 * 50 messages per type from the fast-check generators in src/bridge/testing/arbitraries.ts with a
 * fixed seed. src/bridge/samples.test.ts regenerates in memory and fails if the committed files
 * differ. The Unity EditMode tests read the same files, so both sides parse the same messages.
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { messageArbitraries } from '../src/bridge/testing/arbitraries';

export const GENERATED_ROOT = fileURLToPath(
  new URL('../../data/schema/bridge_fixtures/generated', import.meta.url),
);
export const SAMPLE_SEED = 20261114;
export const SAMPLES_PER_TYPE = 50;

/** The directory name for a message type: the type with "/" replaced by "_". */
export const directoryFor = (type: string): string => type.replace('/', '_');

/** Relative path (using "/") to file text, for every generated sample. */
export function generateSamples(): Map<string, string> {
  const samples = new Map<string, string>();
  for (const [type, arbitrary] of Object.entries(messageArbitraries)) {
    const values = fc.sample(arbitrary, { seed: SAMPLE_SEED, numRuns: SAMPLES_PER_TYPE });
    values.forEach((value, i) => {
      const name = `${String(i + 1).padStart(2, '0')}.json`;
      samples.set(`${directoryFor(type)}/${name}`, `${JSON.stringify(value, null, 2)}\n`);
    });
  }
  return samples;
}

/** Every file under the generated folder, as relative paths with "/". Empty when the folder is missing. */
export async function listGenerated(): Promise<string[]> {
  const found: string[] = [];
  async function walk(folder: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else found.push(relative(GENERATED_ROOT, full).split('\\').join('/'));
    }
  }
  await walk(GENERATED_ROOT);
  return found.sort();
}

export async function readGenerated(path: string): Promise<string> {
  return readFile(join(GENERATED_ROOT, path), 'utf8');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await rm(GENERATED_ROOT, { recursive: true, force: true });
  const samples = generateSamples();
  for (const [path, text] of samples) {
    const full = join(GENERATED_ROOT, path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, text, 'utf8');
  }
  console.log(`wrote ${samples.size} files under ${GENERATED_ROOT}`);
}
