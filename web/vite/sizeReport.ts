/**
 * A size report for the build folder: the largest files and the total. Printed at the end of
 * `npm run build` and by `npm run size [DIR]`. It reads the folder and writes nothing.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

export type FileSize = { path: string; bytes: number };

/** Every file below `dir`, with its size in bytes, as a path relative to `dir` (forward slashes). */
export function listFileSizes(dir: string): FileSize[] {
  const out: FileSize[] = [];
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const full = join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push({ path: relative(dir, full).split('\\').join('/'), bytes: statSync(full).size });
    }
  };
  walk(dir);
  return out;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${bytes} B`;
}

export type SizeReport = { total: number; count: number; largest: FileSize[] };

/** The `top` largest files (largest first, ties by path) and the total. */
export function summariseSizes(files: readonly FileSize[], top = 10): SizeReport {
  const sorted = [...files].sort((a, b) => b.bytes - a.bytes || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { total: files.reduce((sum, f) => sum + f.bytes, 0), count: files.length, largest: sorted.slice(0, top) };
}

export function formatSizeReport(dir: string, report: SizeReport): string {
  const width = Math.max(...report.largest.map((f) => formatBytes(f.bytes).length), 0);
  const lines = report.largest.map((f) => `  ${formatBytes(f.bytes).padStart(width)}  ${f.path}`);
  return [`Build folder ${dir}: ${report.count} files, ${formatBytes(report.total)} in total. Largest ${report.largest.length}:`, ...lines].join('\n');
}

/** Prints the report after the data plugin has copied `data/` into the build folder. */
export function sizeReportPlugin(top = 10): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'buried-size-report',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle: {
      sequential: true,
      order: 'post',
      handler() {
        if (config.command !== 'build') return;
        const dir = join(config.root, config.build.outDir);
        console.log(`\n${formatSizeReport(config.build.outDir, summariseSizes(listFileSizes(dir), top))}\n`);
      },
    },
  };
}
