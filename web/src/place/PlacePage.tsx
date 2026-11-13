import { useCallback, useMemo, useState } from 'react';
import { Explorer } from '../explorer/Explorer';
import { parseReportLink } from '../report/links';
import { ReportView } from '../report/ReportView';
import { useReportData, useReportModel } from '../report/useReportData';
import { Header } from '../shell/Header';
import { Loading } from '../shell/Mark';
import { placeLink } from './placeLink';
import './place.css';

/**
 * The place page (`/place?lot=<id>`): one screen per lot. Left about 58 per cent, the dig (the
 * Explorer's scene with the depth gauge on its left edge); right about 42 per cent, the report on
 * the paper theme. On a narrow screen the report sits below the scene. `/report?lot=` stays as the
 * print and share target and renders the same ReportView.
 *
 * Choosing an era's label in the core sample moves the scene to that era. Pinning the lot in the
 * scene and flying the camera to it need a bridge message that does not exist yet.
 */
export function PlacePage() {
  const initial = useMemo(() => parseReportLink(window.location.search), []);
  const loaded = useReportData();
  const [era, setEra] = useState<string | null>(initial.eraId);
  const model = useReportModel(loaded, initial.lotId, initial.eraId, initial.version);

  const address = model?.kind === 'report' ? (model.place.addresses[0] ?? null) : null;

  const selectEra = useCallback(
    (eraId: string) => {
      setEra(eraId);
      if (initial.lotId !== null) window.history.replaceState(null, '', placeLink(initial.lotId, eraId));
    },
    [initial.lotId],
  );

  return (
    <div className="page">
      <Header current="place" address={address} />
      <div className="place" data-testid="place">
        <section className="place-scene" aria-label="The dig">
          <Explorer variant="place" era={era} />
        </section>
        <aside className="place-report report-scroll" aria-label="The report">
          {loaded.status === 'loading' && <Loading text="Loading the records." />}
          {loaded.status === 'error' && <p role="alert">The records could not be loaded. {loaded.message}</p>}
          {loaded.status === 'ready' && initial.lotId === null && <p>Choose an address on the first page to read the documented history of its lot.</p>}
          {model && <ReportView model={model} onBandSelect={selectEra} />}
        </aside>
      </div>
    </div>
  );
}
