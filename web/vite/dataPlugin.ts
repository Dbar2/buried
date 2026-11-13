/**
 * Serves the repository's data/ folder at /data/ and copies it into dist/data/ at build.
 *
 * Only an allow-list of paths is ever served or copied (spec 03 design.md, "Files"):
 *   project.json, sources.json, and the files directly inside evidence/, present/, tiles/, control/.
 * Never raw/, work/, alignment/, schema/ or anything outside data/. /data/index.json is generated:
 * the names of the files in those four folders, so the shell can load them without a directory listing.
 */
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { VERSIONED_DIRECTORIES, VERSIONED_TOP_LEVEL, dataVersion } from '../src/workspace/dataVersion';
import type { Sha256Hex } from '../src/workspace/dataVersion';

export const ALLOWED_ROOT_FILES: readonly string[] = ['project.json', 'sources.json', 'finds.json'];
export const ALLOWED_DIRS = ['evidence', 'present', 'tiles', 'control'] as const;
export type AllowedDir = (typeof ALLOWED_DIRS)[number];

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

export type DataIndex = Record<AllowedDir, string[]>;

/**
 * Map a request path below /data/ to a file inside `dataDir`, or null when the path is not on the
 * allow-list. Pure: it does not touch the disk. Refuses `..`, encoded dots, backslashes, absolute
 * paths, nested folders, unlisted folders and unlisted extensions.
 */
export function resolveAllowedPath(dataDir: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded === '' || decoded.includes('\0') || decoded.includes('\\') || decoded.startsWith('/')) return null;

  const segments = decoded.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..' || !SAFE_NAME.test(s))) return null;

  const fileName = segments[segments.length - 1] as string;
  if (!(extname(fileName).toLowerCase() in CONTENT_TYPES)) return null;

  if (segments.length === 1) {
    if (!ALLOWED_ROOT_FILES.includes(fileName)) return null;
  } else if (segments.length === 2) {
    if (!(ALLOWED_DIRS as readonly string[]).includes(segments[0] as string)) return null;
  } else {
    return null;
  }

  const root = resolve(dataDir);
  const absolute = resolve(root, ...segments);
  return absolute.startsWith(root + sep) ? absolute : null;
}

function isListable(name: string): boolean {
  return SAFE_NAME.test(name) && extname(name).toLowerCase() in CONTENT_TYPES;
}

/** The file names in each allowed folder that the plugin would serve, sorted. Missing folders are empty. */
export function listDataIndex(dataDir: string): DataIndex {
  const index = { evidence: [], present: [], tiles: [], control: [] } as DataIndex;
  for (const dir of ALLOWED_DIRS) {
    const folder = join(dataDir, dir);
    if (!existsSync(folder)) continue;
    index[dir] = readdirSync(folder)
      .filter((name) => isListable(name) && statSync(join(folder, name)).isFile())
      .sort();
  }
  return index;
}

/** The versioned files of data/ (the rule in src/workspace/dataVersion.ts), read from disk. */
export function versionedFiles(dataDir: string): Array<[string, Uint8Array]> {
  const out: Array<[string, Uint8Array]> = [];
  for (const name of VERSIONED_TOP_LEVEL) {
    const p = join(dataDir, name);
    if (existsSync(p) && statSync(p).isFile()) out.push([name, readFileSync(p)]);
  }
  for (const [dir, suffix] of VERSIONED_DIRECTORIES) {
    const folder = join(dataDir, dir);
    if (!existsSync(folder)) continue;
    for (const name of readdirSync(folder).sort()) {
      const p = join(folder, name);
      if (name.endsWith(suffix) && statSync(p).isFile()) out.push([`${dir}/${name}`, readFileSync(p)]);
    }
  }
  return out;
}

export type DataIndexWithVersion = DataIndex & { data_version: string };

/** The index served as /data/index.json: the file lists plus the canon data version (spec 04 2.6). */
export function dataIndexWithVersion(dataDir: string): DataIndexWithVersion {
  const sha256: Sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
  return { ...listDataIndex(dataDir), data_version: dataVersion(versionedFiles(dataDir), sha256) };
}

/** Copy the allowed files and a generated index.json into `outDir`. Returns the paths copied. */
export function copyAllowedData(dataDir: string, outDir: string): string[] {
  const copied: string[] = [];
  mkdirSync(outDir, { recursive: true });

  for (const name of ALLOWED_ROOT_FILES) {
    const from = join(dataDir, name);
    if (!existsSync(from)) continue;
    copyFileSync(from, join(outDir, name));
    copied.push(name);
  }

  const index = listDataIndex(dataDir);
  for (const dir of ALLOWED_DIRS) {
    if (index[dir].length === 0) continue;
    mkdirSync(join(outDir, dir), { recursive: true });
    for (const name of index[dir]) {
      copyFileSync(join(dataDir, dir, name), join(outDir, dir, name));
      copied.push(`${dir}/${name}`);
    }
  }

  writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(dataIndexWithVersion(dataDir), null, 2)}\n`);
  copied.push('index.json');
  return copied;
}

function handle(dataDir: string, req: IncomingMessage, res: ServerResponse, next: () => void): void {
  const pathname = (req.url ?? '/').split('?')[0] ?? '/';
  const relative = pathname.replace(/^\/+/, '');

  if (relative === 'index.json') {
    res.setHeader('Content-Type', CONTENT_TYPES['.json'] as string);
    res.setHeader('Cache-Control', 'no-cache');
    res.end(JSON.stringify(dataIndexWithVersion(dataDir)));
    return;
  }

  const file = resolveAllowedPath(dataDir, relative);
  if (file === null || !existsSync(file) || !statSync(file).isFile()) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not found');
    return;
  }
  res.setHeader('Content-Type', CONTENT_TYPES[extname(file).toLowerCase()] as string);
  res.setHeader('Cache-Control', 'no-cache');
  createReadStream(file).on('error', () => next()).pipe(res);
}

export type DataPluginOptions = {
  /** The data folder. Default: ../data relative to the Vite root (web/). */
  dataDir?: string;
};

export function dataPlugin(options: DataPluginOptions = {}): Plugin {
  let config: ResolvedConfig;
  const dataDirFor = () => options.dataDir ?? resolve(config.root, '..', 'data');

  return {
    name: 'buried-data',
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => handle(dataDirFor(), req, res, next));
    },
    closeBundle() {
      if (config.command !== 'build') return;
      copyAllowedData(dataDirFor(), resolve(config.root, config.build.outDir, 'data'));
    },
  };
}
