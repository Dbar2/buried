import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { CANVAS_CENTRE, LONG_PRESS_MS, LONG_PRESS_SLOP_PX, moveByKey, toScreenPoint } from './lantern';
import type { LensCommand, ScreenPoint } from './lantern';

const INTERACTIVE = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY']);

/**
 * The Lantern's input (spec 03 requirement 13): Space held while focus is in the Explorer region, a long press on
 * touch, or a toggle (the L key or `toggle()`) for people who cannot hold a key. The pointer moves the lens, the
 * arrow keys move it by 0.05 while it is on, and Escape turns it off. It works from Today only (`enabled`).
 * Returns the lens command to send, or null until the lens has been on once. The Player draws; this decides.
 */
export function useLantern(options: { viewRef: RefObject<HTMLElement | null>; enabled: boolean; eraId: string | null }) {
  const { viewRef, enabled, eraId } = options;
  const [held, setHeld] = useState(false);
  const [toggled, setToggled] = useState(false);
  const [centre, setCentre] = useState<ScreenPoint>(CANVAS_CENTRE);
  const [everOn, setEverOn] = useState(false);

  const on = enabled && eraId !== null && (held || toggled);
  const onRef = useRef(on);
  onRef.current = on;
  const centreRef = useRef<ScreenPoint>(CANVAS_CENTRE);
  const pointerInside = useRef(false);

  useEffect(() => {
    if (on) setEverOn(true);
  }, [on]);

  // Leaving Today (or the Player going away) turns the lens off for good: nothing is held over.
  useEffect(() => {
    if (!enabled) {
      setHeld(false);
      setToggled(false);
    }
  }, [enabled]);

  const canvasRect = useCallback(() => viewRef.current?.querySelector('canvas')?.getBoundingClientRect() ?? null, [viewRef]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    let frame = 0;
    const publish = () => {
      frame = 0;
      setCentre(centreRef.current);
    };
    const place = (clientX: number, clientY: number) => {
      const rect = canvasRect();
      if (!rect) return;
      centreRef.current = toScreenPoint(clientX, clientY, rect);
      if (onRef.current && frame === 0) frame = requestAnimationFrame(publish);
    };

    let touchTimer = 0;
    let touchStart: { x: number; y: number } | null = null;
    let touchOn = false;
    const endTouch = () => {
      clearTimeout(touchTimer);
      touchStart = null;
      if (touchOn) {
        touchOn = false;
        setHeld(false);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      pointerInside.current = true;
      if (touchStart && !touchOn) {
        if (Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y) > LONG_PRESS_SLOP_PX) {
          clearTimeout(touchTimer);
          touchStart = null;
        }
      }
      place(event.clientX, event.clientY);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch' || !(event.target instanceof HTMLCanvasElement)) return;
      touchStart = { x: event.clientX, y: event.clientY };
      touchTimer = window.setTimeout(() => {
        touchOn = true;
        place(touchStart?.x ?? 0, touchStart?.y ?? 0);
        setCentre(centreRef.current);
        setHeld(true);
      }, LONG_PRESS_MS);
    };
    const onPointerEnter = () => {
      pointerInside.current = true;
    };
    const onPointerLeave = () => {
      pointerInside.current = false;
    };

    // Space is the Explorer's when focus is inside it, or nowhere in particular and the pointer is over it.
    const inRegion = (event: KeyboardEvent): boolean => {
      const target = event.target instanceof Element ? event.target : null;
      if (target && INTERACTIVE.has(target.tagName)) return false;
      if (target instanceof HTMLElement && target.isContentEditable) return false;
      if (target && view.contains(target)) return true;
      return (target === null || target === document.body) && pointerInside.current;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Space') {
        if (!inRegion(event)) return;
        event.preventDefault(); // the page must not scroll while the lens is held
        if (!event.repeat) {
          setCentre(centreRef.current);
          setHeld(true);
        }
        return;
      }
      if (event.key === 'Escape') {
        setHeld(false);
        setToggled(false);
        return;
      }
      if (event.key === 'l' || event.key === 'L') {
        if (!inRegion(event)) return;
        setCentre(centreRef.current);
        setToggled((value) => !value);
        return;
      }
      if (onRef.current && event.key.startsWith('Arrow') && inRegion(event)) {
        event.preventDefault();
        centreRef.current = moveByKey(centreRef.current, event.key);
        setCentre(centreRef.current);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setHeld(false);
    };
    const onBlur = () => setHeld(false);

    view.addEventListener('pointermove', onPointerMove);
    view.addEventListener('pointerdown', onPointerDown);
    view.addEventListener('pointerup', endTouch);
    view.addEventListener('pointercancel', endTouch);
    view.addEventListener('pointerenter', onPointerEnter);
    view.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(touchTimer);
      view.removeEventListener('pointermove', onPointerMove);
      view.removeEventListener('pointerdown', onPointerDown);
      view.removeEventListener('pointerup', endTouch);
      view.removeEventListener('pointercancel', endTouch);
      view.removeEventListener('pointerenter', onPointerEnter);
      view.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [viewRef, canvasRect]);

  const command = useMemo<LensCommand | null>(
    () => (eraId === null || (!on && !everOn) ? null : { on, center: centre, eraId }),
    [on, everOn, centre, eraId],
  );
  const toggle = useCallback(() => setToggled((value) => !value), []);
  return { command, toggled, toggle };
}
