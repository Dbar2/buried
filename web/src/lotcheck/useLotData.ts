import { useEffect, useState } from 'react';
import { browserFetchText, loadData } from '../data/loadData';
import type { LoadedData } from '../data/loadData';
import { parseContract } from '../evidence';
import type { PresentLayer } from '../evidence';
import { PRESENT_SOURCES } from '../report/buildReport';

export type LotData = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: LoadedData };

/**
 * What a page reads. The Landing needs the lots and the address points (and the evidence, which every page
 * reads); the Result also draws today's building outlines. The control point files are not read at all.
 */
export type Needs = 'landing' | 'result';

const PRESENT: Record<Needs, readonly string[]> = {
  landing: [`${PRESENT_SOURCES.lots}.geojson`, `${PRESENT_SOURCES.addresses}.geojson`],
  // The Result's text needs the lots and the addresses. Today's building outlines (the largest layer) are read
  // after the text is on screen, with `useBuildings`.
  result: [`${PRESENT_SOURCES.lots}.geojson`, `${PRESENT_SOURCES.addresses}.geojson`],
};

const shared = new Map<Needs, Promise<LoadedData>>();

let buildingsOnce: Promise<PresentLayer> | null = null;

/** Today's building outlines, read once `enabled` is true (after the text is on screen). Undefined until then. */
export function useBuildings(enabled: boolean): PresentLayer | undefined {
  const [layer, setLayer] = useState<PresentLayer | undefined>(undefined);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const path = `present/${PRESENT_SOURCES.buildings}.geojson`;
    buildingsOnce ??= browserFetchText(path).then((text) => parseContract('presentLayer', text, path));
    buildingsOnce
      .then((l) => {
        if (!cancelled) setLayer(l);
      })
      .catch(() => {
        buildingsOnce = null;
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return layer;
}

/**
 * Loads the published records once for a lot check page. It reads `data/` only: no workspace, no Studio
 * service, no Explorer. The text of a page is on screen before this resolves.
 */
export function useLotData(needs: Needs): LotData {
  const [state, setState] = useState<LotData>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    const promise = shared.get(needs) ?? loadData(browserFetchText, { present: PRESENT[needs], controls: false });
    shared.set(needs, promise);
    promise
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        shared.delete(needs);
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [needs]);
  return state;
}
