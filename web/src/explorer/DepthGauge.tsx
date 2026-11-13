import { useEffect, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { depthFromPointerY } from './depth';
import type { EraInfo } from './eraOrder';

/**
 * The depth gauge (design.md "Layout", requirements 10.2, 17.1 and 17.2): a DOM slider on the right
 * edge with one stop per project era, Today at the top. Up goes to the shallower era, Down to the
 * deeper one, Home to Today and End to the earliest era; each asks for a transition. Dragging the
 * gauge makes the depth follow the pointer, and releasing it settles on the nearest era. A marker
 * follows the depth continuously. Colour is never the only mark: the current stop has a filled bar and
 * a heavier label.
 */

/** The era index a key moves to, or null when the key is not a gauge key or nothing changes. */
export function nextIndexForKey(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  let target: number;
  switch (key) {
    case 'ArrowUp':
      target = index - 1;
      break;
    case 'ArrowDown':
      target = index + 1;
      break;
    case 'Home':
      target = 0;
      break;
    case 'End':
      target = count - 1;
      break;
    default:
      return null;
  }
  target = Math.min(Math.max(target, 0), count - 1);
  return target === index ? null : target;
}

/** What a screen reader hears when the gauge reaches an era (requirement 10.7). */
export function announcementFor(era: Pick<EraInfo, 'label'> | undefined): string {
  return era ? `Now showing ${era.label}` : '';
}

/** The short text for a stop: the year, in the mono face, for a dated era; the label for Today. */
export function stopText(era: Pick<EraInfo, 'id' | 'label'>): { text: string; mono: boolean } {
  return /^\d{4}$/.test(era.id) ? { text: era.id, mono: true } : { text: era.label, mono: false };
}

// The marker is placed before paint in the browser; in a server render (the markup tests) there is
// nothing to place, so the plain effect keeps React quiet.
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** A pointer must move this far (CSS px) before a press on the gauge counts as a drag and not a click. */
export const DRAG_SLOP_PX = 4;

export type DepthGaugeProps = {
  /** Every era, Today first. */
  eras: readonly EraInfo[];
  /** The era the depth is at or heading for. It is what screen readers are told. */
  index: number;
  /** The depth now, a fraction while a transition runs. The marker follows it. Defaults to `index`. */
  depth?: number;
  onChange: (index: number) => void;
  /** The gauge is dragged: the depth the pointer means. */
  onDrag?: (depth: number) => void;
  /** The drag ended. */
  onRelease?: () => void;
};

export function DepthGauge({ eras, index, depth, onChange, onDrag, onRelease }: DepthGaugeProps) {
  const current = eras.find((era) => era.index === index);
  const root = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const press = useRef<{ y: number; dragging: boolean } | null>(null);
  const justDragged = useRef(false);
  const shown = depth ?? index;

  // The marker follows the depth continuously. It is placed from the stops' own positions, so it
  // stays on its era's mark whatever the font size.
  useBeforePaint(() => {
    const el = thumb.current;
    const stops = root.current?.querySelectorAll<HTMLElement>('.depth-stop');
    if (!el || !stops || stops.length === 0) return;
    const first = stops[0] as HTMLElement;
    const last = stops[stops.length - 1] as HTMLElement;
    const firstCentre = first.offsetTop + first.offsetHeight / 2;
    const lastCentre = last.offsetTop + last.offsetHeight / 2;
    const fraction = eras.length > 1 ? Math.min(Math.max(shown, 0), eras.length - 1) / (eras.length - 1) : 0;
    const centre = firstCentre + (lastCentre - firstCentre) * fraction;
    el.style.transform = `translateY(${centre - el.offsetHeight / 2}px)`;
  }, [shown, eras.length]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = nextIndexForKey(event.key, index, eras.length);
    if (target === null) return;
    event.preventDefault();
    onChange(target);
  };

  const depthAt = (clientY: number): number => {
    const stops = root.current?.querySelectorAll<HTMLElement>('.depth-stop');
    if (!stops || stops.length === 0) return 0;
    const a = (stops[0] as HTMLElement).getBoundingClientRect();
    const b = (stops[stops.length - 1] as HTMLElement).getBoundingClientRect();
    return depthFromPointerY(clientY, a.top + a.height / 2, b.top + b.height / 2, eras.length);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    press.current = { y: event.clientY, dragging: false };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || !onDrag) return;
    if (!p.dragging) {
      if (Math.abs(event.clientY - p.y) < DRAG_SLOP_PX) return;
      p.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    onDrag(depthAt(event.clientY));
  };

  const endPress = (event: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    if (!p?.dragging) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 0);
    onRelease?.();
  };

  return (
    <div
      ref={root}
      className="depth-gauge"
      role="slider"
      tabIndex={0}
      aria-label="Depth"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.max(eras.length - 1, 0)}
      aria-valuenow={index}
      aria-valuetext={current?.label ?? ''}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPress}
      onPointerCancel={endPress}
      data-testid="depth-gauge"
    >
      <span ref={thumb} className="depth-thumb" aria-hidden="true" data-testid="depth-thumb" />
      {eras.map((era) => {
        const { text, mono } = stopText(era);
        return (
          <button
            key={era.id}
            type="button"
            tabIndex={-1}
            className="depth-stop"
            aria-current={era.index === index ? 'true' : undefined}
            title={era.label}
            data-testid={`era-${era.id}`}
            onClick={() => {
              if (justDragged.current) return;
              onChange(era.index);
            }}
          >
            <span className="depth-mark" aria-hidden="true" />
            <span className={mono ? 'depth-year' : 'depth-label'}>{text}</span>
          </button>
        );
      })}
    </div>
  );
}
