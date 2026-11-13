import type { CSSProperties } from 'react';
import { LINK_COPIED } from './share';
import type { ShareOutcome } from './share';

/** The lettering crop: a rectangle of the untouched tile, in tile pixels (requirement 4.2). */
export type CardCrop = {
  /** The tile image, for example `/data/tiles/fip_v3_1911_229.jpg`. */
  src: string;
  tileWidth: number;
  tileHeight: number;
  rect: { x: number; y: number; width: number; height: number };
  alt: string;
};

/**
 * What the card shows. Every sentence is made elsewhere (the Evidence Library's `findText`, spec 06 W4); the card
 * only lays them out, so it builds none.
 */
export type CardViewModel = {
  /** "LETTERED ON THE 1911 PLAN". */
  kicker: string;
  /** The lettered lines, quoted as lettered. The first is the title; the others are set in italic. */
  lines: readonly string[];
  /** The untouched lettering crop, or null when the source has no tile loaded (the card then shows no picture). */
  crop: CardCrop | null;
  /** "Seen on: 1911 plan, sheet 229". */
  seenOn: string;
  /** "Positioned within about 4.5 m". */
  position: string;
  /** "Status: draft, not yet reviewed". */
  status: string;
  /** The extra line when the era ruler moves (requirement 5.3), or null. */
  rulerLine: string | null;
  actions: {
    showOriginalSheet: boolean;
    share: boolean;
    fullRecord: boolean;
    /** Offered when the find's anchor is off screen (requirement 5.4). */
    showOnMap: boolean;
  };
  /** The Report for the feature's lot, when "Full record" is offered. */
  fullRecordHref: string | null;
  /** The link shown selected in a field when the clipboard is refused. */
  shareLink: string | null;
};

export type FindCardProps = {
  view: CardViewModel;
  shareOutcome: ShareOutcome | null;
  onShowOriginalSheet: () => void;
  onShare: () => void;
  onShowOnMap: () => void;
  /** A close control is drawn when this is given (the sheet on a phone closes with its handle as well). */
  onClose?: () => void;
  /** "Show the original sheet" is on: the button is `aria-pressed`. */
  originalShown?: boolean;
};

/** Absolute placement of the whole tile inside a frame that shows only `rect` of it. Pure; percentages only. */
export function cropStyles(crop: CardCrop): { frame: CSSProperties; image: CSSProperties } {
  const { rect, tileWidth, tileHeight } = crop;
  return {
    frame: { aspectRatio: `${rect.width} / ${rect.height}` },
    image: {
      width: `${(tileWidth / rect.width) * 100}%`,
      left: `${(-rect.x / rect.width) * 100}%`,
      // `top` percentages refer to the frame's height, so the offset is scaled by the frame's own aspect.
      top: `${(-rect.y / rect.height) * 100}%`,
      aspectRatio: `${tileWidth} / ${tileHeight}`,
    },
  };
}

/** "Seen on: ..." splits at its first colon so the label can be set apart; text without one stays whole. */
function splitLabel(text: string): { label: string | null; value: string } {
  const at = text.indexOf(': ');
  return at > 0 && at < 16 ? { label: text.slice(0, at + 1), value: text.slice(at + 2) } : { label: null, value: text };
}

function Row({ text, testId }: { text: string; testId: string }) {
  const { label, value } = splitLabel(text);
  return (
    <p className="card-row" data-testid={testId}>
      {label ? <span className="card-row-label">{label} </span> : null}
      {value}
    </p>
  );
}

function RegistrationCross({ corner }: { corner: 'tl' | 'tr' | 'bl' | 'br' }) {
  return (
    <svg className={`reg-cross reg-cross-${corner}`} viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M6 0V12M0 6H12" />
    </svg>
  );
}

/**
 * The catalogue card (spec 06 requirement 4.2, design.md "The catalogue card"): kicker, the lettered lines, the
 * untouched crop in a hairline frame, "Seen on", the position line, the status line, then the actions. Parchment,
 * ink text, hairline rules, a registration cross in each corner, no shadow.
 */
export function FindCard({ view, shareOutcome, onShowOriginalSheet, onShare, onShowOnMap, onClose, originalShown }: FindCardProps) {
  const [title, ...rest] = view.lines;
  const crop = view.crop ? cropStyles(view.crop) : null;
  return (
    <article className="find-card" aria-labelledby="find-card-title" data-testid="find-card">
      <RegistrationCross corner="tl" />
      <RegistrationCross corner="tr" />
      <RegistrationCross corner="bl" />
      <RegistrationCross corner="br" />
      {onClose ? (
        <button type="button" className="card-close" onClick={onClose} data-testid="card-close">
          Close
        </button>
      ) : null}
      <p className="card-kicker" data-testid="card-kicker">
        {view.kicker}
      </p>
      <h2 className="card-title" id="find-card-title" data-testid="card-title">
        {title}
      </h2>
      {rest.map((line, i) => (
        <p className="card-subtitle" key={i}>
          {line}
        </p>
      ))}
      {view.crop && crop ? (
        <div className="card-crop" style={crop.frame} data-testid="card-crop">
          <img src={view.crop.src} alt={view.crop.alt} style={crop.image} loading="eager" decoding="async" />
        </div>
      ) : null}
      <Row text={view.seenOn} testId="card-seen-on" />
      <Row text={view.position} testId="card-position" />
      <Row text={view.status} testId="card-status" />
      {view.rulerLine ? (
        <p className="card-row card-ruler-line" data-testid="card-ruler-line">
          {view.rulerLine}
        </p>
      ) : null}
      <div className="card-actions">
        {view.actions.showOnMap ? (
          <button type="button" className="card-action" onClick={onShowOnMap} data-testid="card-show-on-map">
            Show on the map
          </button>
        ) : null}
        {view.actions.showOriginalSheet ? (
          <button
            type="button"
            className="card-action"
            onClick={onShowOriginalSheet}
            aria-pressed={originalShown === undefined ? undefined : originalShown}
            data-testid="card-show-original"
          >
            Show the original sheet
          </button>
        ) : null}
        {view.actions.share ? (
          <button type="button" className="card-action" onClick={onShare} data-testid="card-share">
            Share this find
          </button>
        ) : null}
        {view.actions.fullRecord && view.fullRecordHref ? (
          <a className="card-action" href={view.fullRecordHref} data-testid="card-full-record">
            Full record
          </a>
        ) : null}
      </div>
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="card-share-status">
        {shareOutcome === 'copied' ? LINK_COPIED : ''}
      </p>
      {shareOutcome === 'copied' ? (
        <p className="card-share-note" data-testid="card-share-copied" aria-hidden="true">
          {LINK_COPIED}
        </p>
      ) : null}
      {shareOutcome === 'refused' && view.shareLink ? (
        <label className="card-share-field">
          <span className="card-row-label">Copy this link:</span>
          <input
            type="text"
            readOnly
            value={view.shareLink}
            data-testid="card-share-link"
            onFocus={(event) => event.currentTarget.select()}
            autoFocus
          />
        </label>
      ) : null}
    </article>
  );
}
