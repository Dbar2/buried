import { useEffect, useRef } from 'react';
import { CropCanvas } from '../report/CropCanvas';
import { LetteringCrop } from './LetteringCrop';
import type { PlaceCard as PlaceCardModel } from './placeCard';

export type PlaceCardProps = {
  card: PlaceCardModel;
  /** The confidence class, for the outline pattern of the row (never colour alone). */
  confidence: 'documented' | 'estimated' | 'unknown';
  onClose: () => void;
  /** Whether the scene has a drape to switch, so "View original scan" does something. */
  canViewOriginal: boolean;
  original: boolean;
  onToggleOriginal: () => void;
};

const CROP_PX = 280;

/**
 * The evidence card as a part of the report column (session 029): paper theme, the crop of the
 * untouched scan with the building outlined, then the record's own words. Closing it returns to the
 * report. The heading takes focus when the card opens and the opener gets it back on close. Escape
 * closes.
 */
export function PlaceCard({ card, confidence, onClose, canViewOriginal, original, onToggleOriginal }: PlaceCardProps) {
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    // The card opens at its top; the report's scroll position comes back when it closes.
    const column = heading.current?.closest<HTMLElement>('.report-scroll') ?? null;
    const was = column?.scrollTop ?? 0;
    if (column) column.scrollTop = 0;
    heading.current?.focus({ preventScroll: true });
    return () => {
      if (column) column.scrollTop = was;
      const el = opener.current;
      if (el instanceof HTMLElement && el.isConnected) el.focus({ preventScroll: true });
    };
  }, [card.featureId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section className="place-card" aria-labelledby="place-card-heading" data-testid="evidence-card">
      <div className="place-card-bar">
        <button type="button" onClick={onClose} data-testid="card-close">
          Close
        </button>
      </div>
      <h2 id="place-card-heading" ref={heading} tabIndex={-1} data-testid="card-heading">
        {card.heading}
      </h2>
      {card.crop ? (
        <figure className="place-card-crop">
          <CropCanvas crop={card.crop} sizePx={CROP_PX} label={card.cropLabel} testId="card-crop" />
          <figcaption className="small">{card.cropLabel}. The scan is shown as it is, with the outline drawn on it.</figcaption>
        </figure>
      ) : (
        <p className="small" data-testid="card-no-crop">
          {card.cropLabel}.
        </p>
      )}
      {card.reading && (
        <figure className="place-card-reading">
          <LetteringCrop reading={card.reading} testId="card-reading-crop" />
          <figcaption className="small" data-testid="card-reading-caption">
            {card.reading.label}. The scan is shown as it is.
          </figcaption>
        </figure>
      )}
      <dl className="place-card-rows">
        {card.rows.map((row) => (
          <div key={row.key} className={`place-card-row place-card-row--${row.key}${row.key === 'confidence' ? ` conf--${confidence}` : ''}`}>
            <dt>{row.label}</dt>
            <dd className={row.mono ? 'mono' : undefined} data-testid={`card-${row.key}`}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="place-card-source small" data-testid="card-source">
        From {card.source.name}. <span className="mono">{card.source.id}</span>. {card.source.attributionLine}
      </p>
      {canViewOriginal && (
        <p>
          <button type="button" className="primary" aria-pressed={original} onClick={onToggleOriginal} data-testid="view-original">
            {original ? 'Back to the lit map' : 'View original scan'}
          </button>
        </p>
      )}
    </section>
  );
}
