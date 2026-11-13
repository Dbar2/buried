import { useCallback, useMemo, useRef, useState } from 'react';
import { Explorer } from '../explorer/Explorer';
import type { PlaceBinding, Selection, StageKind } from '../explorer/Explorer';
import type { GateModel } from '../explorer/gateModel';
import { evidenceCommand } from '../explorer/showEvidence';
import { parseReportLink } from '../report/links';
import { ReportView } from '../report/ReportView';
import { useReportData, useReportModel } from '../report/useReportData';
import { Header } from '../shell/Header';
import { Loading } from '../shell/Mark';
import { SetPageTitle } from '../shell/SetPageTitle';
import { buildPlaceCard } from './placeCard';
import { PlaceCard } from './PlaceCardPanel';
import { placeLink } from './placeLink';
import './place.css';

/**
 * The place page (`/place?lot=<id>`): one screen per lot. Left about 58 per cent, the dig (the
 * Explorer's scene with the depth gauge on its left edge); right about 42 per cent, the report on
 * the paper theme. On a narrow screen the report sits below the scene. `/report?lot=` stays as the
 * print and share target and renders the same ReportView.
 *
 * The two halves follow each other (session 029). Choosing an era's label in the core sample moves
 * the scene to that era; moving the depth gauge or digging with the wheel marks the matching band
 * and brings it into view, and the header names the era. A ghost opens its evidence card in the
 * report column, in place of the report until it is closed. "View original scan" switches the
 * scene's drapes to the untouched rasters while a card is open.
 */
export function PlacePage() {
  const initial = useMemo(() => parseReportLink(window.location.search), []);
  const loaded = useReportData();
  const [request, setRequest] = useState<{ id: string; n: number } | null>(initial.eraId === null ? null : { id: initial.eraId, n: 0 });
  const [shown, setShown] = useState<{ id: string; label: string } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [original, setOriginal] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [model, setModel] = useState<GateModel | null>(null);
  const [stage, setStage] = useState<StageKind>('pending');
  const reportModel = useReportModel(loaded, initial.lotId, initial.eraId, initial.version);

  const address = reportModel?.kind === 'report' ? (reportModel.place.addresses[0] ?? null) : null;

  const writeUrl = useCallback(
    (eraId: string) => {
      if (initial.lotId !== null) window.history.replaceState(null, '', placeLink(initial.lotId, eraId));
    },
    [initial.lotId],
  );

  const selectEra = useCallback(
    (eraId: string) => {
      setRequest((previous) => ({ id: eraId, n: (previous?.n ?? 0) + 1 }));
      writeUrl(eraId);
    },
    [writeUrl],
  );

  // The first era the scene reports is where it starts; later ones are the visitor's moves.
  const reported = useRef(false);
  const onEraShown = useCallback(
    (eraId: string, label: string) => {
      setShown((previous) => (previous?.id === eraId && previous.label === label ? previous : { id: eraId, label }));
      if (reported.current) writeUrl(eraId);
      reported.current = true;
    },
    [writeUrl],
  );

  // Both card toggles end when the card closes (or another building is chosen).
  const onSelect = useCallback((next: Selection | null) => {
    setSelection(next);
    setOriginal(false);
    setShowEvidence(false);
  }, []);
  const closeCard = useCallback(() => onSelect(null), [onSelect]);

  const entry = model && selection ? model.lists.get(selection.eraId)?.features.find((f) => f.id === selection.featureId) : undefined;
  const feature = model && selection ? model.features.get(selection.featureId) : undefined;
  const card = useMemo(() => {
    if (!model || !selection || !entry || !feature) return null;
    try {
      return buildPlaceCard(entry, feature, model.sources, model.tiles, model.workspaceFeatureIds.has(selection.featureId) ? 'workspace' : 'canon');
    } catch (error) {
      console.warn(`[place] no card for ${selection.featureId}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }, [model, selection, entry, feature]);
  const canViewOriginal = card !== null && stage === 'player' && model !== null && selection !== null && (model.drapes.get(selection.eraId)?.length ?? 0) > 0;
  // Show Evidence needs the building's era on screen (a selection ends when the era changes) and a scan of its source.
  const canShowEvidence =
    card !== null &&
    stage === 'player' &&
    model !== null &&
    selection !== null &&
    evidenceCommand(model, selection.featureId, model.order.find((e) => e.id === selection.eraId)?.index ?? null) !== null;

  const binding: PlaceBinding = useMemo(
    () => ({ selection, onSelect, onModel: setModel, onEraShown, onStage: setStage, drapeMode: original ? 'original' : 'lit', showEvidence, eraRequest: request }),
    [selection, onSelect, onEraShown, original, showEvidence, request],
  );

  return (
    <div className="page">
      <SetPageTitle page="place" address={address} />
      <Header current="place" address={address} era={shown?.label ?? null} />
      <div className="place" data-testid="place">
        <section className="place-scene" aria-label="The dig">
          <Explorer variant="place" place={binding} />
        </section>
        <aside className="place-report report-scroll" aria-label="The report">
          {card && entry && (
            <PlaceCard
              card={card}
              confidence={entry.confidence}
              onClose={closeCard}
              canViewOriginal={canViewOriginal}
              original={original}
              onToggleOriginal={() => setOriginal((value) => !value)}
              canShowEvidence={canShowEvidence}
              evidenceShown={showEvidence && canShowEvidence}
              onToggleEvidence={() => setShowEvidence((value) => !value)}
            />
          )}
          <div className="place-report-body" hidden={card !== null} data-testid="place-report-body">
            {loaded.status === 'loading' && <Loading text="Loading the records." />}
            {loaded.status === 'error' && <p role="alert">The records could not be loaded. {loaded.message}</p>}
            {loaded.status === 'ready' && initial.lotId === null && <p>Choose an address on the first page to read the documented history of its lot.</p>}
            {reportModel && <ReportView model={reportModel} onBandSelect={selectEra} activeEraId={shown?.id ?? null} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
