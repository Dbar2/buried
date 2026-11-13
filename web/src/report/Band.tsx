import { useEffect, useRef, useState } from 'react';
import type { SourceEntry } from './buildReport';
import { CropCanvas } from './CropCanvas';
import type { Band as BandModel } from './coreSample';
import { RichText } from './richText';

export type BandProps = {
  band: BandModel;
  /** The report's sources, for the attribution lines shown with an enlarged picture. */
  sources?: readonly SourceEntry[];
  /** On the Report route a band links to the live view at its era and lot. */
  href?: string;
  /** In a panel beside the Explorer a band moves the Explorer to its era. */
  onSelect?: (eraId: string) => void;
};

const CROP_PX = 112;
const LARGE_PX = 560;

/**
 * One band of the core sample: a picture of the lot as that era's source shows it, the era's label,
 * and the plain sentences beside it. The picture opens larger on click or Enter, with its
 * attribution. Source ids sit in `title` text and in the enlarged view, never in the sentences.
 */
export function Band({ band, sources = [], href, onSelect }: BandProps) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const label = /^\d{4}/.test(band.label) ? <span className="band-label mono">{band.label}</span> : <span className="band-label">{band.label}</span>;
  const idsText = band.sourceIds.length > 0 ? `Sources: ${band.sourceIds.join(', ')}` : undefined;
  const picture = band.crop.kind === 'none' ? null : band.crop;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open && typeof el.showModal === 'function') el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const attributions = band.sourceIds.flatMap((id) => {
    const s = sources.find((x) => x.id === id);
    return s ? [s] : [];
  });

  return (
    <li className="band" data-era={band.eraId} data-testid={`band-${band.eraId}`}>
      <div className="band-head">
        <h3>
          {onSelect ? (
            <button type="button" onClick={() => onSelect(band.eraId)} data-testid={`band-select-${band.eraId}`}>
              {label}
            </button>
          ) : href ? (
            <a href={href} data-testid={`band-link-${band.eraId}`}>
              {label}
            </a>
          ) : (
            label
          )}
        </h3>
      </div>
      <div className="band-picture">
        {picture ? (
          <button
            type="button"
            ref={opener}
            className="band-crop"
            onClick={() => setOpen(true)}
            title={[band.cropLabel, idsText].filter(Boolean).join('. ')}
            aria-label={`${band.cropLabel}. Open larger.`}
            data-testid={`crop-${band.eraId}`}
          >
            <CropCanvas crop={picture} sizePx={CROP_PX} label={band.cropLabel} testId={`crop-canvas-${band.eraId}`} />
          </button>
        ) : (
          <p className="band-none small" data-testid={`crop-none-${band.eraId}`}>
            {band.crop.kind === 'none' ? band.crop.text : ''}
          </p>
        )}
        {band.unreviewed && picture && (
          <p className="band-flag small" data-testid={`crop-flag-${band.eraId}`}>
            {band.unreviewed}
          </p>
        )}
      </div>
      <div className="band-text" title={idsText}>
        {band.sentences.map((s, i) => (
          // The recorded uses and the checked line are printed in the findings (with the status badge
          // and its reason); the band's copy is for the screen.
          <p key={i} className={/^Uses recorded|^Confirmed by/i.test(s.text) ? 'print-extra' : undefined}>
            <RichText text={s.text} />
          </p>
        ))}
      </div>
      {picture && (
        <dialog
          ref={dialog}
          className="band-dialog"
          aria-label={`${band.label}: ${band.cropLabel}`}
          onClose={() => {
            setOpen(false);
            opener.current?.focus();
          }}
          onClick={(e) => {
            if (e.target === dialog.current) setOpen(false);
          }}
          data-testid={`crop-dialog-${band.eraId}`}
        >
          {open && (
            <div className="band-dialog-body">
              <h3>
                {band.label}: {band.cropLabel}
              </h3>
              <CropCanvas crop={picture} sizePx={LARGE_PX} label={band.cropLabel} testId={`crop-large-${band.eraId}`} />
              {band.unreviewed && <p>{band.unreviewed}.</p>}
              <ul className="band-attribution small">
                {attributions.map((s) => (
                  <li key={s.id}>
                    <span className="mono">{s.id}</span>. {s.attributionLine}
                  </li>
                ))}
              </ul>
              <button type="button" className="primary" onClick={() => setOpen(false)} data-testid={`crop-close-${band.eraId}`}>
                Close
              </button>
            </div>
          )}
        </dialog>
      )}
    </li>
  );
}
