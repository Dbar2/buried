import { useEffect, useRef, useState } from 'react';
import type { ReadCrop } from './placeCard';

const MAX_W = 280;
const MAX_H = 120;

/**
 * The lettering a use was read from, cut from the untouched tile and scaled up to be read. The
 * pixels are not smoothed or sharpened: the crop is the evidence for the words beside it.
 */
export function LetteringCrop({ reading, testId }: { reading: ReadCrop; testId?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'drawing' | 'done' | 'failed'>('drawing');

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      setState('failed');
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const scale = Math.min(MAX_W / reading.sw, MAX_H / reading.sh, 6);
      canvas.width = Math.max(1, Math.round(reading.sw * scale));
      canvas.height = Math.max(1, Math.round(reading.sh * scale));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, reading.sx, reading.sy, reading.sw, reading.sh, 0, 0, canvas.width, canvas.height);
      setState('done');
    };
    image.onerror = () => {
      if (!cancelled) setState('failed');
    };
    image.src = `/data/tiles/${reading.image}`;
    return () => {
      cancelled = true;
    };
  }, [reading]);

  return (
    <canvas
      ref={ref}
      className="lettering-crop"
      role="img"
      aria-label={state === 'failed' ? `${reading.label} (the picture could not be loaded)` : reading.label}
      data-state={state}
      data-testid={testId}
    />
  );
}
