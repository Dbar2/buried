import { useEffect, useState } from 'react';
import type { Dispatch, KeyboardEvent } from 'react';
import type { Rect, Size } from '../plate/plateView';
import { ProposalCrop } from './ProposalCrop';
import type { ProposalFeature, ReviewAction, ReviewState } from './reviewModel';
import { reviewCounts } from './reviewModel';
import { BAND_LABEL, KEY_LEGEND, bandOf, shortId, toneText, weaknessText } from './reviewText';

export type ReviewPanelProps = {
  proposals: readonly ProposalFeature[];
  review: ReviewState;
  dispatch: Dispatch<ReviewAction>;
  imageUrl: string;
  tile: Size;
  crop: Rect;
  /** Metres per plate pixel, to say a proposal's size. */
  pixelSizeM: number;
  onFit: () => void;
};

const stateText = (decision: 'accept' | 'reject' | undefined) =>
  decision === 'accept' ? 'Accepted' : decision === 'reject' ? 'Rejected' : 'Undecided';

/** Commit a text or number field on Enter or when it loses focus, then give the keys back to the review. */
function useDraft(value: string, commit: (draft: string) => void, key: string) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value, key]);
  return {
    value: draft,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    onBlur: () => {
      if (draft !== value) commit(draft);
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') {
        setDraft(value);
        event.currentTarget.blur();
      }
    },
  };
}

export function ReviewPanel({ proposals, review, dispatch, imageUrl, tile, crop, pixelSizeM, onFit }: ReviewPanelProps) {
  const counts = reviewCounts(review);
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const current = review.current ? byId.get(review.current) : undefined;
  const attributes = (review.current && review.attributes[review.current]) || {};

  const storeys = useDraft(attributes.storeys === undefined ? '' : String(attributes.storeys), (text) => {
    const n = text.trim() === '' ? undefined : Number(text);
    dispatch({ type: 'setStoreys', value: n !== undefined && Number.isInteger(n) ? n : undefined });
  }, review.current ?? '');
  const use = useDraft(attributes.use ?? '', (text) => dispatch({ type: 'setUse', value: text }), review.current ?? '');

  const decision = current ? review.decisions[current.id] : undefined;
  const now = () => new Date().toISOString();

  return (
    <div className="review-panel" data-testid="review-panel">
      <p className="counts mono" aria-live="polite" data-testid="review-counts">
        <span>Accepted {counts.accepted}</span>
        <span>Rejected {counts.rejected}</span>
        <span>Undecided {counts.undecided}</span>
      </p>

      {current ? (
        <section className="current" aria-label="Current proposal" data-testid="current-proposal" data-proposal-id={current.id}>
          <h3>
            Proposal <span className="mono" data-testid="current-id">{shortId(current.id)}</span>
            <span className="state mono" data-testid="current-state">
              {stateText(decision)}
            </span>
          </h3>
          <ProposalCrop proposal={current} imageUrl={imageUrl} tile={tile} crop={crop} />
          <dl className="facts">
            <dt>Outline</dt>
            <dd>
              {BAND_LABEL[bandOf(current.properties.quality.score)]}, score <span className="mono">{current.properties.quality.score.toFixed(2)}</span>
            </dd>
            <dt>Size</dt>
            <dd className="mono">
              about {current.properties.area_m2.toFixed(0)} m², {(current.properties.crop_px.width * pixelSizeM).toFixed(0)} × {(current.properties.crop_px.height * pixelSizeM).toFixed(0)} m
            </dd>
            <dt>Position</dt>
            <dd className="mono" data-testid="current-crop">
              {current.properties.crop_px.x}, {current.properties.crop_px.y} px
            </dd>
            <dt>Tone</dt>
            <dd data-testid="current-tone">{toneText(current.properties.tone_class)}</dd>
          </dl>
          {current.properties.weaknesses.length > 0 && (
            <ul className="weaknesses" aria-label="What to check">
              {current.properties.weaknesses.map((w) => (
                <li key={w}>{weaknessText(w)}</li>
              ))}
            </ul>
          )}

          <div className="fields">
            <label>
              Storeys, as lettered
              <input type="number" min={1} step={1} inputMode="numeric" data-testid="field-storeys" {...storeys} />
            </label>
            <label>
              Use, as lettered
              <input type="text" autoComplete="off" data-testid="field-use" {...use} />
            </label>
            <p className="muted small">Fill these only from what is printed on the plate. Leave them empty if it says nothing.</p>
          </div>

          <div className="actions" role="group" aria-label="Decide this proposal">
            <button type="button" onClick={() => dispatch({ type: 'accept', at: now() })} data-testid="accept">
              Accept <kbd>A</kbd>
            </button>
            <button type="button" onClick={() => dispatch({ type: 'reject', at: now() })} data-testid="reject">
              Reject <kbd>R</kbd>
            </button>
            <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={review.past.length === 0} data-testid="undo">
              Undo <kbd>U</kbd>
            </button>
          </div>
          <div className="actions" role="group" aria-label="Move between proposals">
            <button type="button" onClick={() => dispatch({ type: 'previous' })}>
              Previous <kbd>K</kbd>
            </button>
            <button type="button" onClick={() => dispatch({ type: 'next' })}>
              Next <kbd>J</kbd>
            </button>
            <button type="button" onClick={onFit}>
              Fit <kbd>F</kbd>
            </button>
          </div>
        </section>
      ) : (
        <p className="muted">There are no proposals to review.</p>
      )}

      <details className="proposal-list" data-testid="proposal-list">
        <summary>All proposals ({review.order.length})</summary>
        <ul>
          {review.order.map((id) => {
            const p = byId.get(id) as ProposalFeature;
            const c = p.properties.crop_px;
            return (
              <li key={id}>
                <button
                  type="button"
                  className="mono"
                  aria-current={id === review.current ? 'true' : undefined}
                  data-proposal-id={id}
                  data-crop={`${c.x},${c.y},${c.width},${c.height}`}
                  data-state={review.decisions[id] ?? 'undecided'}
                  onClick={() => dispatch({ type: 'select', id })}
                >
                  {shortId(id)} {stateText(review.decisions[id])} · {BAND_LABEL[bandOf(p.properties.quality.score)]}
                </button>
              </li>
            );
          })}
        </ul>
      </details>

      <dl className="key-legend" aria-label="Keys">
        {KEY_LEGEND.map(([key, what]) => (
          <div key={key}>
            <dt className="mono">{key}</dt>
            <dd>{what}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
