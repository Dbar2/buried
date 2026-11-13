import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import type { Size } from './tagLayout';

/** The size of an element in CSS pixels, kept current while it is on screen. Before it is measured: the window. */
export function useStageSize(ref: RefObject<HTMLElement | null>, initial: Size = { w: 1280, h: 744 }): Size {
  const [size, setSize] = useState<Size>(() =>
    typeof window === 'undefined' ? initial : { w: window.innerWidth, h: Math.max(0, window.innerHeight - 56) },
  );
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize((previous) => (previous.w === el.clientWidth && previous.h === el.clientHeight ? previous : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
