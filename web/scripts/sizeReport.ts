/**
 * Prints the size report for a build folder: `npm run size` (default `dist`) or `npm run size -- DIR`.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { formatSizeReport, listFileSizes, summariseSizes } from '../vite/sizeReport';

const arg = process.argv[2] ?? 'dist';
const dir = resolve(arg);
if (!existsSync(dir)) {
  console.error(`No folder at ${dir}. Run npm run build first.`);
  process.exit(1);
}
console.log(formatSizeReport(arg, summariseSizes(listFileSizes(dir))));
