/**
 * Requirement 1.3 (spec 08): the Landing, the Result and the How page load no Explorer, bridge or walk
 * module. The test follows every relative import from each page, static and dynamic, and lists the
 * modules it reaches. `explorer/eraOrder` is the one Explorer file allowed: a pure sort of the eras.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('..', import.meta.url));
const PAGES = ['lotcheck/LandingPage.tsx', 'lotcheck/LotPage.tsx', 'lotcheck/HowPage.tsx'];
const ALLOWED = new Set(['explorer/eraOrder.ts']);
const FORBIDDEN = /^(explorer|bridge|walk|unity)\//;

const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]+)['"]/g;

function resolveModule(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && /\.(ts|tsx)$/.test(candidate)) return candidate;
  }
  return null; // a stylesheet, an image or JSON: not code
}

function reach(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [resolve(SRC, entry)];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(IMPORT)) {
      const next = resolveModule(file, m[1] as string);
      if (next !== null) queue.push(next);
    }
  }
  return new Set([...seen].map((f) => relative(SRC, f)));
}

describe('the lot check pages', () => {
  for (const page of PAGES) {
    it(`${page} reaches no explorer, bridge, walk or unity module`, () => {
      const reached = reach(page);
      const bad = [...reached].filter((f) => FORBIDDEN.test(f) && !ALLOWED.has(f));
      expect(bad).toEqual([]);
      expect(reached.has(page)).toBe(true);
    });
  }

  it('the Explorer, the bridge and the walk are reached from App.tsx only through lazy imports', () => {
    const app = readFileSync(resolve(SRC, 'App.tsx'), 'utf8');
    expect(app).not.toMatch(/^import .* from '\.\/(explorer|bridge|walk)\//m);
    expect(app).not.toContain('/walk/');
  });
});
