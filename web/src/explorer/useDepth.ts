import { useCallback, useEffect, useRef, useState } from 'react';
import { advance, dragTo, goToEra, initialDepthState, releaseDrag, stepEra } from './depth';
import type { DepthState } from './depth';

/**
 * The Shell's depth (requirement 10.1): a DepthState driven by one animation-frame loop that runs
 * only while a transition is under way. The pure rules are in depth.ts; this is the clock around
 * them. `performance.now()` and the animation-frame timestamp share a time base.
 */
export function useDepth(count: number) {
  const [state, setState] = useState<DepthState>(() => initialDepthState(0));
  const ref = useRef(state);
  const frame = useRef<number | null>(null);
  const eras = useRef(count);
  eras.current = count;

  const loop = useCallback((now: number) => {
    frame.current = null;
    const next = advance(ref.current, now);
    if (next !== ref.current) {
      ref.current = next;
      setState(next);
    }
    if (ref.current.tween !== null) frame.current = requestAnimationFrame(loop);
  }, []);

  const commit = useCallback(
    (next: DepthState) => {
      if (next === ref.current) return;
      ref.current = next;
      setState(next);
      if (next.tween !== null && frame.current === null) frame.current = requestAnimationFrame(loop);
    },
    [loop],
  );

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    [],
  );

  const goTo = useCallback((index: number) => commit(goToEra(ref.current, index, performance.now(), eras.current)), [commit]);
  const step = useCallback((delta: number) => commit(stepEra(ref.current, delta, performance.now(), eras.current)), [commit]);
  const drag = useCallback((depth: number) => commit(dragTo(ref.current, depth, eras.current)), [commit]);
  const release = useCallback(() => commit(releaseDrag(ref.current, performance.now(), eras.current)), [commit]);

  return { state, goTo, step, drag, release };
}
