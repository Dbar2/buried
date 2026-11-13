import { useEffect, useMemo, useState } from 'react';
import { browserFetchText, loadData } from '../data/loadData';
import type { LoadedData } from '../data/loadData';
import type { FeatureCollection } from '../evidence';
import { fetchDataVersion } from '../studio/service/client';
import { openWorkspace } from '../workspace/db';
import { loadWorkspaceEvidence } from '../workspace/load';
import { buildReport, PRESENT_SOURCES } from './buildReport';
import { parseReportLink, versionPrefix } from './links';
import { ReportView } from './ReportView';
import { lotForPoint, searchAddresses } from './search';

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: LoadedData; dataVersion: string; workspace: FeatureCollection[] };

/**
 * /report: pick a lot by address (from the clipped City address points) or arrive with `?lot=` from
 * a link, and read its Report. Everything is computed here in the browser from the published data and,
 * separately, the visitor's own workspace. There is no server and no Unity.
 */
export function ReportRoute() {
  const initial = useMemo(() => parseReportLink(window.location.search), []);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [lotId, setLotId] = useState<string | null>(initial.lotId);
  const [eraId, setEraId] = useState<string | null>(initial.eraId);
  const [query, setQuery] = useState('');
  const [noLot, setNoLot] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadData(browserFetchText);
      const dataVersion = await fetchDataVersion().catch(() => '');
      let workspace: FeatureCollection[] = [];
      try {
        workspace = (await loadWorkspaceEvidence(await openWorkspace(), data.evidence, data.sources)).collections;
      } catch {
        // No workspace in this browser: the Report is built from the published records alone.
      }
      if (!cancelled) setLoaded({ status: 'ready', data, dataVersion, workspace });
    })().catch((error: unknown) => {
      if (!cancelled) setLoaded({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const model = useMemo(() => {
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
      linkDataVersion: initial.version !== null && initial.version !== versionPrefix(loaded.dataVersion) ? initial.version : null,
      siteOrigin: window.location.origin,
    });
  }, [loaded, lotId, eraId, initial.version]);

  const hits = useMemo(() => (loaded.status === 'ready' ? searchAddresses(loaded.data.presentLayers.get(PRESENT_SOURCES.addresses), query) : []), [loaded, query]);

  const choose = (point: [number, number]) => {
    if (loaded.status !== 'ready') return;
    const id = lotForPoint(loaded.data.presentLayers.get(PRESENT_SOURCES.lots), point);
    setNoLot(id === null);
    setLotId(id);
    setEraId(null);
    setQuery('');
    if (id !== null) window.history.pushState(null, '', `/report?lot=${encodeURIComponent(id)}`);
  };

  return (
    <main className="report-route">
      <form className="report-search" role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="report-address">Find a lot by address</label>
        <input
          id="report-address"
          type="search"
          autoComplete="off"
          placeholder="For example 1 Eastern Avenue"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loaded.status !== 'ready'}
          data-testid="report-address"
        />
        {hits.length > 0 && (
          <ul aria-label="Matching addresses" data-testid="address-hits">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" onClick={() => choose(h.point)}>
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        )}
        {query.trim().length >= 2 && loaded.status === 'ready' && hits.length === 0 && <p role="status">No address in the area Buried covers matches that.</p>}
      </form>

      {loaded.status === 'loading' && <p role="status">Loading the records.</p>}
      {loaded.status === 'error' && <p role="alert">The records could not be loaded. {loaded.message}</p>}
      {loaded.status === 'ready' && loaded.data.presentLayers.get(PRESENT_SOURCES.lots) === undefined && <p role="alert">Lots are not available right now.</p>}
      {loaded.status === 'ready' && loaded.data.problems.length > 0 && <p role="status">Some records could not be read.</p>}
      {loaded.status === 'ready' && lotId === null && !noLot && <p>Search for an address to read the documented history of its lot.</p>}
      {loaded.status === 'ready' && noLot && <ReportView model={{ kind: 'not_reconstructed', text: 'Not reconstructed yet.' }} />}
      {model && <ReportView model={model} />}
    </main>
  );
}
