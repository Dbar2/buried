import { useEffect, useRef, useState } from 'react';
import type { ReadCrop } from './lettering';

const MAX_W = 320;
const MAX_H = 120;

/**
 * The lettering a use was read from, cut from the untouched tile and scaled up to be read. The pixels are
 * not smoothed, toned or sharpened: the crop is the evidence for the words beside it.
 */
export function LetteringCrop({ crop, testId }: { crop: ReadCrop; testId?: string }) {
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
      const scale = Math.min(MAX_W / crop.sw, MAX_H / crop.sh, 6);
      canvas.width = Math.max(1, Math.round(crop.sw * scale));
      canvas.height = Math.max(1, Math.round(crop.sh * scale));
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
      setState('done');
    };
    image.onerror = () => {
      if (!cancelled) setState('failed');
    };
    image.src = `/data/tiles/${crop.image}`;
    return () => {
      cancelled = true;
    };
  }, [crop]);

  return (
    <canvas
      ref={ref}
      className="lc-crop"
      role="img"
      aria-label={state === 'failed' ? `${crop.label} (the picture could not be loaded)` : crop.label}
      data-state={state}
      data-testid={testId}
    />
  );
}
