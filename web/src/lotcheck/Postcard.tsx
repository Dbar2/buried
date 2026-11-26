import { useEffect, useRef, useState } from 'react';
import * as copy from './copy';
import { imaginedLine, streetCaption } from './photos';
import type { ImaginedView } from './photos';

/**
 * "As it may have looked" (spec 08 requirement 12.2, session 055): the street-level picture imagined from the plan for
 * a lettered use on the lot, on the record sheet under the compare view. It is never the default and never cropped.
 * Every time it is on screen its caption says "Imagined from the 1911 plan. Not a photograph." in addition to the
 * mark set into the picture. A click opens it larger in a dialog; Escape closes it and focus returns.
 */
function Caption({ view }: { view: ImaginedView }) {
  return (
    <>
      <span className="lc-postcard-name">{streetCaption(view)}</span> <span className="lc-imagined-line">{imaginedLine(view.planName).text}</span>
    </>
  );
}

function Larger({ view, onClose }: { view: ImaginedView; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const street = view.street;
  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);
  if (!street) return null;
  return (
    <dialog
      ref={dialog}
      className="lc-dialog"
      aria-label={`${streetCaption(view)} ${imaginedLine(view.planName).text}`}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop (the dialog element itself, outside its content) closes it.
        if (e.target === dialog.current) dialog.current?.close();
      }}
      data-testid="lc-dialog"
    >
      <img className="lc-dialog-image" src={street.src} width={street.widthPx} height={street.heightPx} alt={`${streetCaption(view)} ${imaginedLine(view.planName).text}`} data-testid="lc-dialog-image" />
      <p className="lc-dialog-caption" data-testid="lc-dialog-caption">
        <Caption view={view} />
      </p>
      <button type="button" className="lc-dialog-close" onClick={() => dialog.current?.close()} data-testid="lc-dialog-close">
        {copy.PICTURES.close}
      </button>
    </dialog>
  );
}

function Card({ view, load }: { view: ImaginedView; load: boolean }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const street = view.street;
  if (!street) return null;
  const alt = `${streetCaption(view)} ${imaginedLine(view.planName).text}`;
  return (
    <figure className="lc-postcard" data-testid="lc-postcard" data-slug={view.slug}>
      <button
        type="button"
        ref={opener}
        className="lc-postcard-open"
        aria-haspopup="dialog"
        aria-label={`${copy.PICTURES.open}: ${alt}`}
        onClick={() => setOpen(true)}
        style={{ aspectRatio: `${street.widthPx} / ${street.heightPx}` }}
        data-testid="lc-postcard-open"
      >
        {load ? <img src={street.src} width={street.widthPx} height={street.heightPx} alt={alt} loading="lazy" decoding="async" data-testid="lc-postcard-image" /> : null}
      </button>
      <figcaption data-testid="lc-postcard-caption">
        <Caption view={view} />
      </figcaption>
      {open ? (
        <Larger
          view={view}
          onClose={() => {
            setOpen(false);
            // The dialog hands focus back by itself in most browsers; this makes it certain.
            opener.current?.focus();
          }}
        />
      ) : null}
    </figure>
  );
}

/**
 * One card for each imagined view offered for this lot (`viewsOnLot`), the heading once. `load` is false until the plan
 * tile has loaded: the picture is not requested before then (requirement 11.4). A lot with no view shows nothing.
 */
export function Postcards({ views, load }: { views: readonly ImaginedView[]; load: boolean }) {
  const withStreet = views.filter((v) => v.street !== null);
  if (withStreet.length === 0) return null;
  return (
    <section className="lc-section lc-imagined" aria-labelledby="lc-imagined-heading" data-testid="lc-imagined">
      <h2 id="lc-imagined-heading" className="lc-section-heading">
        {copy.PICTURES.heading}
      </h2>
      {withStreet.map((v) => (
        <Card key={v.slug} view={v} load={load} />
      ))}
    </section>
  );
}
