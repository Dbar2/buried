import { useCallback, useEffect, useRef, useState } from 'react';
import { CANVAS_CENTRE, moveByKey } from '../explorer/lantern';
import type { ScreenPoint } from '../explorer/lantern';

/** Targets that keep the Space key for themselves: pressing Space on a focused button presses the button. */
const SPACE_OWNERS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY']);
const TEXT_FIELDS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * The Lantern's keys on the Block page (spec 06 requirement 6.2): Space held, `L` to toggle, the arrows to move the
 * lens while it is on, and Escape to turn it off. The pointer is not followed here: a drag that starts inside the lens
 * moves it (`LanternLens`, `lensDrag`), and one that starts outside is the camera's. `enabled` is false until the
 * scene can show a lens; the lens is then turned off at once.
 */
export function useBlockLens(enabled: boolean) {
  const [held, setHeld] = useState(false);
  const [toggled, setToggled] = useState(false);
  const [center, setCenterState] = useState<ScreenPoint>(CANVAS_CENTRE);
  const centerRef = useRef(center);
  const on = enabled && (held || toggled);
  const onRef = useRef(on);
  onRef.current = on;

  const setCenter = useCallback((next: ScreenPoint) => {
    centerRef.current = next;
    setCenterState(next);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setHeld(false);
      setToggled(false);
    }
  }, [enabled]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const inTextField = target !== null && (TEXT_FIELDS.has(target.tagName) || (target instanceof HTMLElement && target.isContentEditable));
      if (inTextField) return;
      if (event.code === 'Space') {
        if (target && SPACE_OWNERS.has(target.tagName)) return;
        event.preventDefault(); // the page must not scroll while the lens is held
        if (!event.repeat) setHeld(true);
        return;
      }
      if (event.key === 'Escape') {
        setHeld(false);
        setToggled(false);
        return;
      }
      if (event.key === 'l' || event.key === 'L') {
        setToggled((value) => !value);
        return;
      }
      if (onRef.current && event.key.startsWith('Arrow') && !target?.closest('[role="radiogroup"]')) {
        event.preventDefault();
        setCenter(moveByKey(centerRef.current, event.key));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setHeld(false);
    };
    const onBlur = () => setHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [setCenter]);

  const toggle = useCallback(() => setToggled((value) => !value), []);
  return { on, center, setCenter, toggle, toggled };
}
