import { useEffect, useMemo, useState } from 'react';
import { browserFetchText, loadData } from '../data/loadData';
import type { LoadedData } from '../data/loadData';
import type { FeatureCollection } from '../evidence';
import { fetchDataVersion } from '../studio/service/client';
import { openWorkspace } from '../workspace/db';
import { loadWorkspaceEvidence } from '../workspace/load';
import { buildReport, PRESENT_SOURCES } from './buildReport';
import type { ReportModel } from './buildReport';
import { versionPrefix } from './links';

export type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: LoadedData; dataVersion: string; workspace: FeatureCollection[] };

/**
 * Loads the published records, the data version and the visitor's own workspace, once. Shared by the
 * landing search, the place page and the Report route. `withWorkspace` is false on the landing, which
 * has no use for it and must not open the visitor's browser store.
 */
export function useReportData(withWorkspace = true): Loaded {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadData(browserFetchText);
      const dataVersion = withWorkspace ? await fetchDataVersion().catch(() => '') : '';
      let workspace: FeatureCollection[] = [];
      if (withWorkspace) {
        try {
          workspace = (await loadWorkspaceEvidence(await openWorkspace(), data.evidence, data.sources)).collections;
        } catch {
          // No workspace in this browser: the Report is built from the published records alone.
        }
      }
      if (!cancelled) setLoaded({ status: 'ready', data, dataVersion, workspace });
    })().catch((error: unknown) => {
      if (!cancelled) setLoaded({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      cancelled = true;
    };
  }, [withWorkspace]);
  return loaded;
}

export function useReportModel(loaded: Loaded, lotId: string | null, eraId: string | null, linkVersion: string | null): ReportModel | null {
  return useMemo(() => {
    if (loaded.status !== 'ready' || lotId === null) return null;
    const { data } = loaded;
    return buildReport({
      lotId,
      eraId,
      canon: {
        collections: data.evidence,
        registry: data.registry,
        project: data.project,
        sidecars: data.tiles,
        lots: data.presentLayers.get(PRESENT_SOURCES.lots),
        addresses: data.presentLayers.get(PRESENT_SOURCES.addresses),
        buildings: data.presentLayers.get(PRESENT_SOURCES.buildings),
      },
      workspace: loaded.workspace.length > 0 ? { collections: loaded.workspace, sources: [] } : null,
      dataVersion: loaded.dataVersion,
      linkDataVersion: linkVersion !== null && linkVersion !== versionPrefix(loaded.dataVersion) ? linkVersion : null,
      siteOrigin: window.location.origin,
    });
  }, [loaded, lotId, eraId, linkVersion]);
}
