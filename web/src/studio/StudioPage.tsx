import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { loadData, browserFetchText } from '../data/loadData';
import type { Era } from '../evidence';
import { openWorkspace } from '../workspace/db';
import type { WorkspaceDb } from '../workspace/db';
import { eraForYears } from '../workspace/seen';
import { MAX_REGION_SIDE_M, defaultRegion, drawStep, regionProblem, regionSizeM } from './extract/region';
import { PlateStage } from './plate/PlateStage';
import { plateTitle } from './plate/plateTitle';
import type { StageMode } from './plate/PlateStage';
import { intersectRects } from './plate/plateView';
import type { Rect, Size } from './plate/plateView';
import { PublishPanel } from './publish/PublishPanel';
import { reviewCommand } from './review/keymap';
import { ReviewPanel } from './review/ReviewPanel';
import { initialReview, reviewReducer } from './review/reviewModel';
import type { ProposalFeature } from './review/reviewModel';
import { ServiceError, ServiceUnavailableError, UNAVAILABLE_MESSAGE, createServiceClient, fetchDataVersion } from './service/client';
import type { ServiceClient } from './service/client';
import { studioServiceBase } from './service/serviceUrl';
import type { ExtractResponse, ProposalFile, RegisteredPlate } from './service/types.generated';
import './studio.css';

type Step = 'extract' | 'review' | 'publish';
type Health = { kind: 'checking' } | { kind: 'down' } | { kind: 'up'; plates: RegisteredPlate[] };

/** Why a registered plate cannot be worked on here, or null when it can. */
export function plateProblem(plate: RegisteredPlate): string | null {
  if (!plate.raster_available || plate.plate_ref === null) return "The Studio service does not hold this plate's image.";
  if (!plate.has_alignment_record) return 'This plate has no measured alignment yet.';
  if (!plate.has_map_area) return "This plate's map area has not been set.";
  if (plate.tile_sidecar === null) return 'This plate has no published image tile.';
  return null;
}

type Extraction = {
  proposalText: string;
  proposals: ProposalFile;
  dropped: ExtractResponse['dropped'];
};

const emptyReview = initialReview([]);

export function StudioPage() {
  const reducedMotion = useMemo(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const client: ServiceClient = useMemo(() => {
    let version: Promise<string> | null = null;
    return createServiceClient({
      baseUrl: studioServiceBase(),
      dataVersion: () => (version ??= fetchDataVersion().catch((e) => ((version = null), Promise.reject(e)))),
    });
  }, []);

  const [health, setHealth] = useState<Health>({ kind: 'checking' });
  const [eras, setEras] = useState<Era[]>([]);
  const [db, setDb] = useState<WorkspaceDb | null>(null);
  const [reviewer, setReviewer] = useState('');

  const [plate, setPlate] = useState<RegisteredPlate | null>(null);
  const [step, setStep] = useState<Step>('extract');
  const [region, setRegion] = useState<Rect | null>(null);
  const [mode, setMode] = useState<StageMode>('view');
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [drawn, setDrawn] = useState(0);
  const [review, dispatch] = useReducer(reviewReducer, emptyReview);
  const [area, setArea] = useState<Rect | null>(null);
  const [visible, setVisible] = useState<Rect>({ x: 0, y: 0, width: 1, height: 1 });
  const [fitSignal, setFitSignal] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);
  const [armed, setArmed] = useState(false);

  // Start: the Service's health and registered plates, the era list, and the visitor's workspace.
  useEffect(() => {
    let cancelled = false;
    client
      .health()
      .then(() => client.registeredPlates())
      .then((answer) => {
        if (!cancelled) setHealth({ kind: 'up', plates: answer.plates });
      })
      .catch(() => {
        if (!cancelled) setHealth({ kind: 'down' });
      });
    loadData(browserFetchText)
      .then((data) => !cancelled && setEras(data.project.eras))
      .catch(() => {});
    openWorkspace()
      .then(async (opened) => {
        if (cancelled) return;
        setDb(opened);
        const name = await opened?.getSetting<string>('reviewer');
        if (!cancelled && typeof name === 'string') setReviewer(name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  const sidecar = plate?.tile_sidecar ?? null;
  const crop: Rect | null = sidecar ? (sidecar.crop_px as Rect) : null;
  const tile: Size | null = sidecar ? { width: sidecar.width_px, height: sidecar.height_px } : null;
  const pixelSizeM = sidecar?.source_pixel_size_m ?? 0.06;
  const imageUrl = sidecar ? `/data/tiles/${sidecar.image}` : '';

  const choosePlate = (chosen: RegisteredPlate) => {
    const s = chosen.tile_sidecar;
    if (!s) return;
    setPlate(chosen);
    setStep('extract');
    setExtraction(null);
    setExtractError(null);
    setArea(null);
    setMode('view');
    setDrawn(0);
    setRegion(defaultRegion(s.crop_px as Rect, s.source_pixel_size_m));
    dispatch({ type: 'load', proposals: [] });
    setFitSignal((n) => n + 1);
  };

  const proposals: readonly ProposalFeature[] = extraction?.proposals.features ?? [];

  const extract = async () => {
    if (!plate || !plate.plate_ref || !region) return;
    setExtracting(true);
    setExtractError(null);
    setArmed(false);
    try {
      const { response, proposals: file } = await client.extract({ plateRef: plate.plate_ref, source: plate.source, region });
      setExtraction({ proposalText: response.proposal_file_text, proposals: file, dropped: response.dropped });
      dispatch({ type: 'load', proposals: file.features });
      setArea(null);
      setMode('view');
      setStep('review');
      setFitSignal((n) => n + 1); // the view stays fitted until the reviewer moves it
    } catch (error) {
      if (error instanceof ServiceUnavailableError) setHealth({ kind: 'down' });
      else setExtractError(error instanceof ServiceError ? error.message : String(error));
    } finally {
      setExtracting(false);
    }
  };

  // The sequenced draw-on: 40 ms apart, at most 2 s in all; at once under reduced motion.
  useEffect(() => {
    const n = proposals.length;
    if (n === 0) {
      setDrawn(0);
      return;
    }
    if (reducedMotion) {
      setDrawn(n);
      return;
    }
    setDrawn(0);
    const step = drawStep(n);
    const timer = setInterval(() => {
      setDrawn((d) => {
        const next = Math.min(n, d + step);
        if (next >= n) clearInterval(timer);
        return next;
      });
    }, 40);
    return () => clearInterval(timer);
  }, [extraction, reducedMotion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Review keys.
  useEffect(() => {
    if (step === 'extract' || !extraction) return;
    const onKey = (event: KeyboardEvent) => {
      const command = reviewCommand(event);
      if (!command) return;
      event.preventDefault();
      if (command === 'accept') dispatch({ type: 'accept', at: new Date().toISOString() });
      else if (command === 'reject') dispatch({ type: 'reject', at: new Date().toISOString() });
      else if (command === 'next') dispatch({ type: 'next' });
      else if (command === 'previous') dispatch({ type: 'previous' });
      else if (command === 'undo') dispatch({ type: 'undo' });
      else if (command === 'redo') dispatch({ type: 'redo' });
      else if (command === 'fit') setFocusSignal((n) => n + 1);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [step, extraction]);

  // Moving to another proposal brings it into view when it is outside the visible part of the plate.
  useEffect(() => {
    const id = review.current;
    const p = id ? proposals.find((x) => x.id === id) : undefined;
    if (!p || !extraction) return;
    const c = p.properties.crop_px;
    const inside = intersectRects(visible, c);
    if (!inside || inside.width < c.width || inside.height < c.height) setFocusSignal((n) => n + 1);
  }, [review.current]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRect = useCallback(
    (rect: Rect) => {
      if (mode === 'region') setRegion(rect);
      else if (mode === 'area') setArea(rect);
      setMode('view');
    },
    [mode],
  );

  if (health.kind === 'checking') return <main className="studio studio-message"><p>Checking the Studio service.</p></main>;
  if (health.kind === 'down') {
    return (
      <main className="studio studio-message">
        <h1>Studio</h1>
        <p data-testid="service-unavailable">{UNAVAILABLE_MESSAGE}</p>
      </main>
    );
  }

  const counts = { decided: Object.keys(review.decisions).length };
  const era = sidecar ? eraForYears(eras, yearsOf(plate as RegisteredPlate).from, yearsOf(plate as RegisteredPlate).to) : null;
  const regionNote = region ? regionProblem(region, pixelSizeM) : null;
  const regionSize = region ? regionSizeM(region, pixelSizeM) : null;

  return (
    <main className="studio" data-testid="studio" data-step={step}>
      <div className="studio-main">
        {plate && crop && tile ? (
          <PlateStage
            imageUrl={imageUrl}
            tile={tile}
            crop={crop}
            proposals={proposals}
            drawnCount={drawn}
            review={extraction ? review : null}
            region={step === 'extract' ? region : null}
            area={area}
            mode={mode}
            fitSignal={fitSignal}
            focusSignal={focusSignal}
            onSelect={(id) => dispatch({ type: 'select', id })}
            onRect={onRect}
            onVisible={setVisible}
          />
        ) : (
          <div className="studio-empty">
            <p className="muted">Choose a plate to begin.</p>
          </div>
        )}
      </div>

      <aside className="studio-side" aria-label="Studio">
        <h1>Studio</h1>

        <section aria-labelledby="plate-heading" className="plate-picker">
          <h2 id="plate-heading">Plate</h2>
          <ul>
            {health.plates.map((entry) => {
              const problem = plateProblem(entry);
              const chosen = plate?.source.id === entry.source.id;
              return (
                <li key={entry.source.id}>
                  <button type="button" disabled={problem !== null} aria-pressed={chosen} onClick={() => choosePlate(entry)} data-testid={`plate-${entry.source.id}`}>
                    <span>{plateTitle(entry.source)}</span>
                    <span className="mono small">{entry.source.id}</span>
                    {problem && <span className="muted small">{problem}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {plate && (
          <nav aria-label="Steps" className="steps">
            <ol>
              {(['extract', 'review', 'publish'] as const).map((name, i) => {
                const enabled = name === 'extract' || extraction !== null;
                return (
                  <li key={name}>
                    <button
                      type="button"
                      disabled={!enabled}
                      aria-current={step === name ? 'step' : undefined}
                      onClick={() => {
                        setStep(name);
                        setMode('view');
                      }}
                      data-testid={`step-${name}`}
                    >
                      <span className="mono">{i + 1}</span> {name === 'extract' ? 'Extract' : name === 'review' ? 'Review' : 'Publish'}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        )}

        {plate && step === 'extract' && (
          <section aria-labelledby="extract-heading" className="step-body">
            <h2 id="extract-heading">Extract</h2>
            <p className="muted small">Buried outlines the buildings it can see in a region of the plate. These are proposals; you decide which are real.</p>
            <p className="mono" data-testid="region-readout">
              {region && regionSize ? `Region ${Math.round(regionSize.width)} × ${Math.round(regionSize.height)} m (limit ${MAX_REGION_SIDE_M} m)` : 'No region'}
            </p>
            {regionNote && <p role="alert">{regionNote}</p>}
            <div className="actions">
              <button type="button" aria-pressed={mode === 'region'} onClick={() => setMode(mode === 'region' ? 'view' : 'region')} data-testid="choose-region">
                {mode === 'region' ? 'Stop choosing' : 'Choose another region'}
              </button>
              {extraction && counts.decided > 0 && !armed ? (
                <button type="button" onClick={() => setArmed(true)}>
                  Extract again
                </button>
              ) : (
                <button type="button" className="primary" onClick={extract} disabled={extracting || regionNote !== null || !region} data-testid="extract">
                  {extracting ? 'Extracting' : armed ? 'Clear my decisions and extract again' : extraction ? 'Extract again' : 'Extract'}
                </button>
              )}
            </div>
            {extractError && <p role="alert" data-testid="extract-error">{extractError}</p>}
            {extraction && (
              <p className="muted small" data-testid="extract-summary">
                {extraction.proposals.features.length} proposals.
                {extraction.dropped.touching_region_border > 0 && ` ${extraction.dropped.touching_region_border} touching the region edge were left out.`}
                {extraction.dropped.outside_project_bounds > 0 && ` ${extraction.dropped.outside_project_bounds} outside the project area were left out.`}
              </p>
            )}
          </section>
        )}

        {plate && step === 'review' && extraction && tile && crop && (
          <section aria-labelledby="review-heading" className="step-body">
            <h2 id="review-heading">Review</h2>
            <ReviewPanel
              proposals={proposals}
              review={review}
              dispatch={dispatch}
              imageUrl={imageUrl}
              tile={tile}
              crop={crop}
              pixelSizeM={pixelSizeM}
              onFit={() => setFocusSignal((n) => n + 1)}
            />
          </section>
        )}

        {plate && step === 'publish' && extraction && crop && region && (
          <section aria-labelledby="publish-heading" className="step-body">
            <h2 id="publish-heading">Publish</h2>
            <PublishPanel
              review={review}
              proposals={proposals}
              proposalFileText={extraction.proposalText}
              sourceId={plate.source.id}
              client={client}
              db={db}
              eraId={era?.id ?? null}
              yearsText={`${plate.source.year_from}${plate.source.year_to === plate.source.year_from ? '' : ` to ${plate.source.year_to}`}`}
              crop={crop}
              extractionRegion={region}
              visibleArea={visible}
              pixelSizeM={pixelSizeM}
              area={area}
              drawingArea={mode === 'area'}
              reviewer={reviewer}
              onReviewer={setReviewer}
              onArea={setArea}
              onDrawArea={(on) => setMode(on ? 'area' : 'view')}
            />
          </section>
        )}
      </aside>
    </main>
  );
}

function yearsOf(plate: RegisteredPlate): { from: number; to: number } {
  return { from: plate.source.year_from ?? 0, to: plate.source.year_to ?? 0 };
}
