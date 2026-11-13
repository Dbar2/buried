import { useRef } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import { beginLensDrag, moveLensDrag } from './lensDrag';
import type { LensGrab, LensPoint } from './lensDrag';

export type LanternLensProps = {
  on: boolean;
  /** 0 to 1 across the scene area from the left and from the top. */
  center: LensPoint;
  /** A share of the scene area's height. */
  radius: number;
  /** The scene area's size in CSS px, so the ring can be sized. */
  area: { width: number; height: number };
  /** Where the scene area's top left sits on the stage, in CSS px (default 0, 0): the ring is placed within the area. */
  origin?: { x: number; y: number };
  /** "Lantern", or "Lantern: 1931-35 plan" (made elsewhere). */
  label: string;
  /** The control's full name when `label` is shortened for a phone. */
  accessibleName?: string;
  onToggle: () => void;
  onMove: (center: LensPoint) => void;
  /** Where the control sits, when the page places it (position, left and top in px). */
  controlStyle?: CSSProperties;
};

/**
 * The Lantern: a visible control that toggles the lens (requirement 6.2) and the lens's ring. The ring sits over the
 * scene and takes pointer events only inside the circle, so a drag that starts inside it moves the lens and one that
 * starts outside reaches the camera (requirement 6.1). The other layer shown inside the ring is the Player's (or the
 * Flat sheet's) to draw; this component draws only the ring.
 */
export function LanternLens({ on, center, radius, area, origin, label, accessibleName, onToggle, onMove, controlStyle }: LanternLensProps) {
  const grab = useRef<LensGrab | null>(null);
  const ring = useRef<HTMLDivElement>(null);

  const rectOf = () => {
    const parent = ring.current?.parentElement?.getBoundingClientRect();
    return parent ? { left: parent.left, top: parent.top, width: parent.width, height: parent.height } : null;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const rect = rectOf();
    if (!rect) return;
    const started = beginLensDrag({ x: event.clientX, y: event.clientY }, rect, { center, radius });
    if (!started) return;
    grab.current = started;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = rectOf();
    if (!grab.current || !rect) return;
    onMove(moveLensDrag(grab.current, { x: event.clientX, y: event.clientY }, rect, center));
  };
  const end = () => {
    grab.current = null;
  };

  const diameter = Math.round(radius * area.height * 2);
  return (
    <>
      {on ? (
        <div className="lens-area" style={{ left: origin?.x ?? 0, top: origin?.y ?? 0, width: area.width, height: area.height }}>
          <div
            ref={ring}
            className="lens-ring"
            data-testid="lens-ring"
            style={{ left: `${center.x * 100}%`, top: `${center.y * 100}%`, width: diameter, height: diameter }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={end}
            onPointerCancel={end}
          />
        </div>
      ) : null}
      <button type="button" className="lens-control" style={controlStyle} aria-pressed={on} aria-label={accessibleName} onClick={onToggle} data-testid="lens-control">
        {label}
      </button>
    </>
  );
}
