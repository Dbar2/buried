import { useMemo, useState } from 'react';
import { PRESENT_SOURCES } from './buildReport';
import { parseReportLink } from './links';
import { ReportView } from './ReportView';
import { lotForPoint, searchAddresses } from './search';
import { useReportData, useReportModel } from './useReportData';
import { Loading } from '../shell/Mark';

/**
 * /report: pick a lot by address (from the clipped City address points) or arrive with `?lot=` from
 * a link, and read its Report. Everything is computed here in the browser from the published data and,
 * separately, the visitor's own workspace. There is no server and no Unity. This is the print and
 * share target; the place page (/place) uses the same ReportView beside the 3D scene.
 */
export function ReportRoute() {
  const initial = useMemo(() => parseReportLink(window.location.search), []);
  const loaded = useReportData();
  const [lotId, setLotId] = useState<string | null>(initial.lotId);
  const [eraId, setEraId] = useState<string | null>(initial.eraId);
  const [query, setQuery] = useState('');
  const [noLot, setNoLot] = useState(false);

  const model = useReportModel(loaded, lotId, eraId, initial.version);

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

      {loaded.status === 'loading' && <Loading text="Loading the records." />}
      {loaded.status === 'error' && <p role="alert">The records could not be loaded. {loaded.message}</p>}
      {loaded.status === 'ready' && loaded.data.presentLayers.get(PRESENT_SOURCES.lots) === undefined && <p role="alert">Lots are not available right now.</p>}
      {loaded.status === 'ready' && loaded.data.problems.length > 0 && <p role="status">Some records could not be read.</p>}
      {loaded.status === 'ready' && lotId === null && !noLot && <p>Search for an address to read the documented history of its lot.</p>}
      {loaded.status === 'ready' && noLot && <ReportView model={{ kind: 'not_reconstructed', text: 'Not reconstructed yet.' }} />}
      {model && <ReportView model={model} />}
    </main>
  );
}
