/**
 * The static-host files (session 027): `public/_headers` and `public/_redirects` for Cloudflare
 * Pages, and the size report. The Unity build is gitignored, so the checks against its file names
 * run only when `public/unity/build.json` exists.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatBytes, formatSizeReport, listFileSizes, summariseSizes } from './sizeReport';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

type Rule = { pattern: string; headers: Map<string, string> };

/** The Pages `_headers` format: an unindented path line, then indented `Name: value` lines. */
export function parseHeaders(text: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of text.split('\n')) {
    if (raw.trim() === '' || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      rules.push({ pattern: raw.trim(), headers: new Map() });
      continue;
    }
    const rule = rules[rules.length - 1];
    const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(raw);
    if (!rule || !m) throw new Error(`cannot read this _headers line: ${raw}`);
    rule.headers.set((m[1] as string).toLowerCase(), (m[2] as string).trim());
  }
  return rules;
}

const matches = (pattern: string, path: string): boolean =>
  new RegExp(`^${pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(path);

/** Every header Pages would send for `path`; the values of overlapping rules are joined with ", ". */
function headersFor(rules: Rule[], path: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const rule of rules.filter((r) => matches(r.pattern, path))) {
    for (const [name, value] of rule.headers) out.set(name, out.has(name) ? `${out.get(name)}, ${value}` : value);
  }
  return out;
}

const rules = parseHeaders(readFileSync(join(PUBLIC, '_headers'), 'utf8'));

describe('public/_headers', () => {
  it('gives hashed assets a year of caching and the data index none', () => {
    expect(headersFor(rules, '/assets/index-Dc3f9a1b.js').get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(headersFor(rules, '/assets/Fraunces-latin-600-normal-abc123.woff2').get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(headersFor(rules, '/data/index.json').get('cache-control')).toBe('no-cache');
  });

  it('leaves everything else on the host default (revalidate), so no path gets two Cache-Control values', () => {
    for (const path of ['/', '/index.html', '/data/project.json', '/data/tiles/fip_v3_1911_229.jpg', '/unity/build.json', '/unity/Build/unity.loader.js', '/favicon.svg']) {
      expect(headersFor(rules, path).has('cache-control'), path).toBe(false);
    }
    // Pages joins the values of overlapping rules; none of these paths is matched by two Cache-Control rules.
    for (const path of ['/assets/a.js', '/assets/b/c.woff2', '/data/index.json']) {
      expect(rules.filter((r) => r.headers.has('cache-control') && matches(r.pattern, path)), path).toHaveLength(1);
    }
  });

  it('serves the Brotli Unity files with their own type and Content-Encoding: br', () => {
    const types: Record<string, string> = {
      '/unity/Build/unity.data.unityweb': 'application/octet-stream',
      '/unity/Build/unity.framework.js.unityweb': 'application/javascript',
      '/unity/Build/unity.wasm.unityweb': 'application/wasm',
    };
    for (const [path, type] of Object.entries(types)) {
      const h = headersFor(rules, path);
      expect(h.get('content-type'), path).toBe(type);
      expect(h.get('content-encoding'), path).toBe('br');
    }
    // The loader script is plain JavaScript and gets no encoding header.
    expect(headersFor(rules, '/unity/Build/unity.loader.js').has('content-encoding')).toBe(false);
  });

  it.runIf(existsSync(join(PUBLIC, 'unity', 'build.json')))('covers every compressed file the Unity build names', () => {
    const build = JSON.parse(readFileSync(join(PUBLIC, 'unity', 'build.json'), 'utf8')) as Record<string, string>;
    for (const key of ['data', 'framework', 'wasm']) {
      const path = `/unity/${build[key]}`;
      expect(path.endsWith('.unityweb'), `${path} is Brotli`).toBe(true);
      expect(headersFor(rules, path).get('content-encoding'), path).toBe('br');
    }
  });
});

describe('public/_redirects', () => {
  const lines = readFileSync(join(PUBLIC, '_redirects'), 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.trim().startsWith('#'))
    .map((l) => l.trim().split(/\s+/));

  it('rewrites each page route to index.html with status 200', () => {
    for (const route of ['/place', '/report', '/studio', '/sources']) {
      expect(lines, route).toContainEqual([route, '/index.html', '200']);
    }
  });

  it('only rewrites; it never redirects a route away', () => {
    for (const [, target, status] of lines) {
      expect(target).toBe('/index.html');
      expect(status).toBe('200');
    }
  });
});

describe('the size report', () => {
  it('lists the largest files and the total', () => {
    const dir = mkdtempSync(join(tmpdir(), 'buried-size-'));
    mkdirSync(join(dir, 'unity', 'Build'), { recursive: true });
    writeFileSync(join(dir, 'index.html'), 'x'.repeat(100));
    writeFileSync(join(dir, 'unity', 'Build', 'big.wasm'), Buffer.alloc(3 * 1024 * 1024));
    writeFileSync(join(dir, 'unity', 'small.json'), 'x'.repeat(2048));
    const files = listFileSizes(dir);
    expect(files.map((f) => f.path).sort()).toEqual(['index.html', 'unity/Build/big.wasm', 'unity/small.json']);
    const report = summariseSizes(files, 2);
    expect(report.count).toBe(3);
    expect(report.total).toBe(100 + 3 * 1024 * 1024 + 2048);
    expect(report.largest.map((f) => f.path)).toEqual(['unity/Build/big.wasm', 'unity/small.json']);
    const text = formatSizeReport('dist', report);
    expect(text).toContain('3 files, 3.00 MiB in total');
    expect(text.split('\n')[1]).toContain('3.00 MiB  unity/Build/big.wasm');
  });

  it('writes sizes in plain units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KiB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MiB');
  });
});
