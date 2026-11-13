import { useRef } from 'react';
import type { PointerEvent, ReactNode } from 'react';

/** A drag this far (px) up opens the sheet, and this far down closes it. */
export const SHEET_DRAG_THRESHOLD = 48;

/** Where a drag of `dy` px (negative is up) leaves the sheet. A short drag leaves it as it was. Pure. */
export function settleSheet(expanded: boolean, dy: number, threshold: number = SHEET_DRAG_THRESHOLD): boolean {
  if (dy <= -threshold) return true;
  if (dy >= threshold) return false;
  return expanded;
}

export type BottomSheetProps = {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** What the sheet shows while it only peeks. The finished card carries the same words once it is open. */
  peek: { kicker: string; title: string; status: string };
  /** The whole card, shown when the sheet is open. */
  children: ReactNode;
};

/**
 * The phone's bottom sheet (under 720 px wide, spec 06 requirement 11.1). It peeks at the kicker, the name and the
 * status, and drags open (or opens on a tap or Enter) to the whole card. The handle is a 44 px button; no leader line
 * runs to it. The Block page decides when to use it; this component does not read the viewport.
 */
export function BottomSheet({ expanded, onExpandedChange, peek, children }: BottomSheetProps) {
  const start = useRef<number | null>(null);
  const dragged = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    start.current = event.clientY;
    dragged.current = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (start.current === null) return;
    const dy = event.clientY - start.current;
    start.current = null;
    if (Math.abs(dy) >= SHEET_DRAG_THRESHOLD) {
      dragged.current = true;
      onExpandedChange(settleSheet(expanded, dy));
    }
  };
  const onClick = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onExpandedChange(!expanded);
  };

  return (
    <section className={`bottom-sheet${expanded ? ' is-expanded' : ''}`} aria-label="The find's card" data-testid="bottom-sheet" data-expanded={expanded}>
      <button
        type="button"
        className="sheet-handle"
        aria-expanded={expanded}
        aria-controls="bottom-sheet-body"
        aria-label={expanded ? 'Close the card' : 'Open the card'}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          start.current = null;
        }}
        onClick={onClick}
        data-testid="sheet-handle"
      >
        <span className="sheet-grip" aria-hidden="true" />
      </button>
      {expanded ? null : (
        <div className="sheet-peek" data-testid="sheet-peek">
          <p className="card-kicker">{peek.kicker}</p>
          <p className="sheet-peek-title">{peek.title}</p>
          <p className="sheet-peek-status">{peek.status}</p>
        </div>
      )}
      <div className="sheet-body" id="bottom-sheet-body" hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}
