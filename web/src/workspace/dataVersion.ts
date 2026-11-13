/**
 * The data version rule (spec 04 design "Data version"), the TypeScript half of
 * pipeline/buried_pipeline/service/data_version.py. Pure over `(path, bytes)` pairs and a SHA-256
 * function, so the browser, the Vite plugin and the tests can each bring their own hash.
 *
 *   data_version = lowercase hex SHA-256 of the UTF-8 text made of one line per file:
 *     "<path relative to data/>\t<lowercase hex SHA-256 of the file's bytes>\n"
 *   for every file in project.json, sources.json, evidence/*.geojson, present/*.geojson,
 *   control/*.json, alignment/*.json, tiles/*.json, sorted by path (byte order).
 */

export type Sha256Hex = (bytes: Uint8Array) => string;

/** Directory (relative to data/) and the suffix of the files counted in it. */
export const VERSIONED_DIRECTORIES: ReadonlyArray<readonly [string, string]> = [
  ['evidence', '.geojson'],
  ['present', '.geojson'],
  ['control', '.json'],
  ['alignment', '.json'],
  ['tiles', '.json'],
];
export const VERSIONED_TOP_LEVEL: readonly string[] = ['project.json', 'sources.json'];

/** True when a path relative to data/ is one of the files the rule counts. */
export function isVersionedPath(path: string): boolean {
  if (VERSIONED_TOP_LEVEL.includes(path)) return true;
  const parts = path.split('/');
  if (parts.length !== 2) return false;
  return VERSIONED_DIRECTORIES.some(([dir, suffix]) => parts[0] === dir && (parts[1] as string).endsWith(suffix));
}

function compareBytes(a: string, b: string): number {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  const n = Math.min(ea.length, eb.length);
  for (let i = 0; i < n; i++) {
    const d = (ea[i] as number) - (eb[i] as number);
    if (d !== 0) return d;
  }
  return ea.length - eb.length;
}

export function dataVersion(files: Iterable<readonly [string, Uint8Array]>, sha256: Sha256Hex): string {
  const ordered = [...files].sort((a, b) => compareBytes(a[0], b[0]));
  const text = ordered.map(([path, bytes]) => `${path}\t${sha256(bytes)}\n`).join('');
  return sha256(new TextEncoder().encode(text));
}
