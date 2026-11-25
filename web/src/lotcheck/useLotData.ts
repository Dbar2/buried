import { useEffect, useState } from 'react';
import { browserFetchText, loadData } from '../data/loadData';
import type { LoadedData } from '../data/loadData';

export type LotData = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: LoadedData };

let shared: Promise<LoadedData> | null = null;

/**
 * Loads the published records once for the lot check pages. It reads `data/` only: no workspace, no Studio
 * service, no Explorer. The text of a page is on screen before this resolves.
 */
export function useLotData(): LotData {
  const [state, setState] = useState<LotData>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    shared ??= loadData(browserFetchText);
    shared
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        shared = null;
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
