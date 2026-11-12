/** A FetchText over a data folder on disk, for tests: same allow-list and generated index as the dev server. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { listDataIndex, resolveAllowedPath } from '../../../vite/dataPlugin';
import type { FetchText } from '../../data/loadData';

/** The synthetic data tree under testing/fixtures/data. */
export const FIXTURE_DATA = fileURLToPath(new URL('./fixtures/data', import.meta.url));

/** The repository's data/ folder. */
export const REPOSITORY_DATA = fileURLToPath(new URL('../../../../data', import.meta.url));

export function diskFetch(root: string = FIXTURE_DATA, overrides: Record<string, string> = {}): FetchText {
  return async (path) => {
    if (path in overrides) return overrides[path] as string;
    if (path === 'index.json') return JSON.stringify(listDataIndex(root));
    const file = resolveAllowedPath(root, path);
    if (file === null) throw new Error(`${path} is not on the data allow-list`);
    return readFileSync(file, 'utf8');
  };
}
