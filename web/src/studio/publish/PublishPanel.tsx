import { useEffect, useMemo, useRef, useState } from 'react';
import { intersectRects, rectToPolygon } from '../plate/plateView';
import type { Rect } from '../plate/plateView';
import { buildDecisionsV2, reviewCounts } from '../review/reviewModel';
import type { ProposalFeature, ReviewState } from '../review/reviewModel';
import { areaLabel, areaProblems, bannedWarning } from '../review/areaModel';
import type { AreaContext } from '../review/areaModel';
import { shortId, undecidedInside } from '../review/reviewText';
import { ServiceError, ServiceUnavailableError } from '../service/client';
import type { ServiceClient } from '../service/client';
import type { PublishError, PublishResponse } from '../service/types.generated';
import { WORKSPACE_PUBLISHED_STATEMENT, storePublished } from '../../workspace/publish';
import { buildExport, downloadBytes } from '../../workspace/exportBundle';
import type { WorkspaceDb } from '../../workspace/db';
import { NO_EXPLORER_ERA_MESSAGE } from '../../workspace/seen';

export type PublishPanelProps = {
  review: ReviewState;
  proposals: readonly ProposalFeature[];
  proposalFileText: string;
  sourceId: string;
  client: ServiceClient;
  db: WorkspaceDb | null;
  /** The Explorer era this source's years fit, or null. */
  eraId: string | null;
  yearsText: string;
  crop: Rect;
  extractionRegion: Rect;
  visibleArea: Rect;
  pixelSizeM: number;
  area: Rect | null;
  drawingArea: boolean;
  reviewer: string;
  /** What each traced area is checked against; null before an extraction exists. */
  areaContext: AreaContext | null;
  onReviewer: (name: string) => void;
  onArea: (area: Rect | null) => void;
  onDrawArea: (on: boolean) => void;
};

type Outcome =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done'; buildings: number; areas: number; kept: boolean; note: string }
  | { kind: 'failed'; message: string };

type DryRun =
  | { kind: 'none' }
  | { kind: 'checking' }
  | { kind: 'ok'; buildings: number; areas: number }
  | { kind: 'errors'; errors: PublishError[] }
  | { kind: 'down'; message: string };

const DRY_RUN_DELAY_MS = 400;

const isArea = (id: string): boolean => id.startsWith('use_');
const countsText = (buildings: number, areas: number): string =>
  [buildings > 0 || areas === 0 ? `${buildings} ${buildings === 1 ? 'building' : 'buildings'}` : null, areas > 0 ? `${areas} ${areas === 1 ? 'land-use area' : 'land-use areas'}` : null].filter(Boolean).join(' and ');

export function PublishPanel(p: PublishPanelProps) {
  const [confirmed, setConfirmed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' });
  const [dryRun, setDryRun] = useState<DryRun>({ kind: 'none' });
  const counts = reviewCounts(p.review);
  const reviewerName = p.reviewer.trim();

  // The same checks the Service makes, so a refusal never arrives late.
  const areaChecks = useMemo(
    () => p.review.areas.map((a) => ({ area: a, problems: p.areaContext ? areaProblems(a, p.areaContext) : ['The plate has no map area to check against.'], warning: bannedWarning(a.use) })),
    [p.review.areas, p.areaContext],
  );
  const areaBlocked = areaChecks.some((c) => c.problems.length > 0);
  const nothingToPublish = counts.accepted + counts.rejected + p.review.areas.length === 0;

  const blockers = useMemo(() => (p.area ? undecidedInside(p.area, p.proposals, p.review.decisions) : []), [p.area, p.proposals, p.review.decisions]);

  const decisions = useMemo(
    () =>
      buildDecisionsV2(p.review, p.proposals, p.sourceId, reviewerName || 'Reviewer', p.area ? [{ pixel_polygon: rectToPolygon(p.area), at: new Date().toISOString() }] : []),
    // The area's time is set when the inputs change, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p.review.decisions, p.review.attributes, p.review.order, p.review.areas, p.proposals, p.sourceId, reviewerName, p.area],
  );

  // The dry run: the Service's own validation, on entry and after each change (requirement 13.1).
  const ready = reviewerName !== '' && p.area !== null && confirmed && !nothingToPublish && !areaBlocked;
  const runId = useRef(0);
  useEffect(() => {
    if (!ready || blockers.length > 0) {
      setDryRun({ kind: 'none' });
      return;
    }
    const mine = ++runId.current;
    setDryRun({ kind: 'checking' });
    const timer = setTimeout(() => {
      p.client
        .publish({ sourceId: p.sourceId, proposalFileText: p.proposalFileText, decisions, dryRun: true })
        .then((answer: PublishResponse) => {
          if (mine !== runId.current) return;
          setDryRun(
            answer.ok
              ? { kind: 'ok', buildings: answer.new_feature_ids.filter((id) => !isArea(id)).length, areas: answer.new_feature_ids.filter(isArea).length }
              : { kind: 'errors', errors: answer.errors },
          );
        })
        .catch((error: unknown) => {
          if (mine !== runId.current) return;
          setDryRun({ kind: 'down', message: error instanceof ServiceUnavailableError || error instanceof ServiceError ? error.message : String(error) });
        });
    }, DRY_RUN_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, blockers.length, decisions, p.sourceId, p.proposalFileText]);

  const canPublish = ready && blockers.length === 0 && (counts.accepted > 0 || p.review.areas.length > 0) && dryRun.kind === 'ok' && outcome.kind !== 'working';

  const publish = async () => {
    setOutcome({ kind: 'working' });
    try {
      const answer = await p.client.publish({ sourceId: p.sourceId, proposalFileText: p.proposalFileText, decisions, dryRun: false });
      if (!answer.ok) {
        setDryRun({ kind: 'errors', errors: answer.errors });
        setOutcome({ kind: 'failed', message: 'Nothing was published. The Service found problems; they are listed beside the items.' });
        return;
      }
      const stored = await storePublished(p.db, p.sourceId, answer, new Date().toISOString(), {
        proposalFileText: p.proposalFileText,
        decisionsText: `${JSON.stringify(decisions, null, 2)}\n`,
      });
      await p.db?.putSetting('reviewer', reviewerName).catch(() => {});
      if (stored.stored) {
        const areas = stored.featureIds.filter(isArea).length;
        setOutcome({ kind: 'done', buildings: stored.featureIds.length - areas, areas, kept: true, note: WORKSPACE_PUBLISHED_STATEMENT });
      } else setOutcome({ kind: 'failed', message: `Nothing was kept. ${stored.reason}` });
    } catch (error) {
      setOutcome({ kind: 'failed', message: error instanceof ServiceError || error instanceof ServiceUnavailableError ? error.message : String(error) });
    }
  };

  const [exportNote, setExportNote] = useState<string | null>(null);
  const exportNow = async () => {
    const result = await buildExport(p.db, p.sourceId, new Date().toISOString());
    if (!result.ok) {
      setExportNote(result.reason);
      return;
    }
    downloadBytes(result.fileName, result.bytes);
    setExportNote(`Saved ${result.fileName}. Give it to the maintainer to read; it is not part of Buried's record until they publish it.`);
  };

  const sizeM = (r: Rect) => `${Math.round(r.width * p.pixelSizeM)} × ${Math.round(r.height * p.pixelSizeM)} m`;
  const useVisible = () => p.onArea(intersectRects(p.visibleArea, p.crop));

  return (
    <div className="publish-panel" data-testid="publish-panel">
      <section aria-labelledby="reviewer-heading">
        <h3 id="reviewer-heading">Who is publishing</h3>
        <label>
          Reviewer name
          <input type="text" autoComplete="name" value={p.reviewer} onChange={(e) => p.onReviewer(e.target.value)} data-testid="reviewer" required />
        </label>
      </section>

      <section aria-labelledby="area-heading">
        <h3 id="area-heading">Reviewed area</h3>
        <p className="muted small">The area in which you have decided every building the plate draws. Only decided buildings are published.</p>
        <div className="actions">
          <button type="button" onClick={() => p.onArea(intersectRects(p.extractionRegion, p.crop))} data-testid="area-region">
            Use the extraction region
          </button>
          <button type="button" onClick={useVisible} data-testid="area-visible">
            Use the visible area
          </button>
          <button type="button" aria-pressed={p.drawingArea} onClick={() => p.onDrawArea(!p.drawingArea)} data-testid="area-draw">
            {p.drawingArea ? 'Stop drawing' : 'Draw an area'}
          </button>
          {p.area && (
            <button type="button" onClick={() => p.onArea(null)}>
              Clear
            </button>
          )}
        </div>
        <p className="mono" data-testid="area-readout">
          {p.area ? `Area ${p.area.x}, ${p.area.y} px, ${sizeM(p.area)}` : 'No area set'}
        </p>
        <label className="check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!p.area} data-testid="area-statement" />I have decided every building inside this area.
        </label>
      </section>

      {p.review.areas.length > 0 && (
        <section aria-labelledby="areas-publish-heading" data-testid="publish-areas">
          <h3 id="areas-publish-heading">Land-use areas</h3>
          <ul>
            {areaChecks.map(({ area, problems, warning }) => (
              <li key={area.id}>
                <span>{areaLabel(area)}</span>
                {problems.map((problem) => (
                  <span key={problem} role="alert" className="small">
                    {' '}
                    {problem}
                  </span>
                ))}
                {warning && (
                  <span className="muted small" data-testid="publish-banned-warning">
                    {' '}
                    {warning}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {blockers.length > 0 && (
        <section className="blockers" aria-label="Undecided proposals inside the area" data-testid="blockers">
          <p>
            <strong>{blockers.length} undecided</strong> inside the area. Accept or reject them, or make the area smaller.
          </p>
          <ul className="mono">
            {blockers.slice(0, 12).map((id) => (
              <li key={id}>{shortId(id)}</li>
            ))}
            {blockers.length > 12 && <li>and {blockers.length - 12} more</li>}
          </ul>
        </section>
      )}

      {dryRun.kind === 'errors' && (
        <section className="blockers" aria-label="Problems the Service found" data-testid="dry-run-errors">
          <ul>
            {dryRun.errors.map((e, i) => (
              <li key={i}>
                {e.review_item_id ? <span className="mono">{shortId(e.review_item_id)} </span> : null}
                {e.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
      {dryRun.kind === 'down' && <p role="status">{dryRun.message}</p>}
      {dryRun.kind === 'ok' && (
        <p className="muted" role="status" data-testid="dry-run-ok">
          Checked by the Service: {countsText(dryRun.buildings, dryRun.areas)} would be added.
        </p>
      )}

      <div className="actions">
        <button type="button" className="primary" disabled={!canPublish} onClick={publish} data-testid="publish">
          {outcome.kind === 'working' ? 'Publishing' : 'Publish to my workspace'}
        </button>
      </div>

      {outcome.kind === 'failed' && (
        <p role="alert" data-testid="publish-failed">
          {outcome.message}
        </p>
      )}
      {outcome.kind === 'done' && (
        <div role="status" className="published" data-testid="published">
          <p>{outcome.note}</p>
          <p className="mono">{countsText(outcome.buildings, outcome.areas)} stored.</p>
          <div className="actions">
            <button type="button" onClick={exportNow} data-testid="export-bundle">
              Export a bundle for review
            </button>
          </div>
          {exportNote && (
            <p role="status" data-testid="export-note">
              {exportNote}
            </p>
          )}
          {p.eraId ? (
            <a className="button primary" href={`/?era=${encodeURIComponent(p.eraId)}`} data-testid="open-explorer">
              Open in the Explorer
            </a>
          ) : (
            <p>{NO_EXPLORER_ERA_MESSAGE(p.yearsText)}</p>
          )}
        </div>
      )}
    </div>
  );
}
