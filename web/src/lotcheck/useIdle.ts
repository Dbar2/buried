import { useEffect, useState } from 'react';

/**
 * True once the page has loaded and gone quiet: `delayMs` after the load event, and when the browser is idle.
 * The night art that is not needed for first paint (the skyline, the spade, the earth cross-section of the dig)
 * is requested then, so it is not counted in what the page transfers before the visitor acts (spec 08 1.4).
 */
export function useIdle(delayMs = 1500): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let timer = 0;
    let idleHandle = 0;
    const idleApi = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number; cancelIdleCallback?: (h: number) => void });
    const start = () => {
      timer = window.setTimeout(() => {
        if (idleApi.requestIdleCallback) idleHandle = idleApi.requestIdleCallback(() => setIdle(true), { timeout: 2000 });
        else setIdle(true);
      }, delayMs);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      window.removeEventListener('load', start);
      window.clearTimeout(timer);
      if (idleHandle && idleApi.cancelIdleCallback) idleApi.cancelIdleCallback(idleHandle);
    };
  }, [delayMs]);
  return idle;
}

/** Asks the browser to fetch an image now, so a later use finds it in the cache. */
export function preloadImage(src: string): void {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
}
