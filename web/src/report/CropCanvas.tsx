import { useEffect, useRef, useState } from 'react';
import { tileToCanvas, worldToCanvas } from './cropPlan';
import type { Crop, Pt } from './cropPlan';

/**
 * One crop of the picture core sample, cut in the browser. A tile crop draws the era's untouched tile
 * (no tone curve, no sharpening) through the matrix `cropPlan` computes from the tile's sidecar; a
 * vector crop draws today's outlines. The lot is outlined in both. Colours are read from the
 * `--report-*` tokens, so there is no colour in this file.
 */
const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function path(ctx: CanvasRenderingContext2D, rings: Pt[][], to: (e: number, n: number) => Pt): void {
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach((p, i) => {
      const [x, y] = to(p[0], p[1]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}

function outlineLot(ctx: CanvasRenderingContext2D, lot: Pt[][], to: (e: number, n: number) => Pt, sizePx: number): void {
  const px = sizePx / 160;
  path(ctx, lot, to);
  ctx.lineJoin = 'round';
  // A paper halo under an ink line reads on a dark scan and on a pale one.
  ctx.setLineDash([]);
  ctx.strokeStyle = token('--report-paper');
  ctx.lineWidth = 4.5 * px;
  ctx.stroke();
  ctx.strokeStyle = token('--report-ink');
  ctx.lineWidth = 2 * px;
  ctx.stroke();
}

export function drawVector(ctx: CanvasRenderingContext2D, crop: Extract<Crop, { kind: 'vector' }>, sizePx: number): void {
  const m = worldToCanvas(crop.window, sizePx);
  const to = (e: number, n: number): Pt => [m[0] * e + m[4], m[3] * n + m[5]];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = token('--report-paper');
  ctx.fillRect(0, 0, sizePx, sizePx);
  ctx.strokeStyle = token('--report-rule');
  ctx.lineWidth = Math.max(1, sizePx / 320);
  for (const rings of crop.shapes.lots) {
    path(ctx, rings, to);
    ctx.stroke();
  }
  ctx.fillStyle = token('--report-ink-soft');
  ctx.globalAlpha = 0.55;
  for (const rings of crop.shapes.buildings) {
    path(ctx, rings, to);
    ctx.fill('evenodd');
  }
  ctx.globalAlpha = 1;
  outlineLot(ctx, crop.shapes.lot, to, sizePx);
}

/** Diagonal ink lines clipped to the rings: how a land-use area is drawn, so it is never read as a building. */
export function hatchRings(ctx: CanvasRenderingContext2D, rings: Pt[][], to: (e: number, n: number) => Pt, sizePx: number): void {
  ctx.save();
  path(ctx, rings, to);
  ctx.clip('evenodd');
  const step = Math.max(4, sizePx / 36);
  ctx.beginPath();
  for (let c = -sizePx; c <= 2 * sizePx; c += step) {
    ctx.moveTo(c, 0);
    ctx.lineTo(c - sizePx, sizePx);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = token('--report-ink');
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(1, sizePx / 320);
  ctx.stroke();
  ctx.restore();
}

export function drawTile(ctx: CanvasRenderingContext2D, crop: Extract<Crop, { kind: 'tile' }>, image: CanvasImageSource, sizePx: number): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = token('--report-paper');
  ctx.fillRect(0, 0, sizePx, sizePx);
  const [a, b, c, d, e, f] = tileToCanvas(crop.tile, crop.window, sizePx);
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(image, 0, 0, crop.tile.widthPx, crop.tile.heightPx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const m = worldToCanvas(crop.window, sizePx);
  const to = (E: number, N: number): Pt => [m[0] * E + m[4], m[3] * N + m[5]];
  for (const rings of crop.areas ?? []) hatchRings(ctx, rings, to, sizePx);
  if (crop.hatch) hatchRings(ctx, crop.lot, to, sizePx);
  outlineLot(ctx, crop.lot, to, sizePx);
}

export type CropCanvasProps = {
  crop: Extract<Crop, { kind: 'tile' | 'vector' }>;
  sizePx: number;
  label: string;
  testId?: string;
};

/** A canvas of `sizePx` square CSS pixels (drawn at twice that for sharpness). */
export function CropCanvas({ crop, sizePx, label, testId }: CropCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<'drawing' | 'done' | 'failed'>('drawing');
  const drawSize = sizePx * 2;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      setState('failed');
      return;
    }
    let cancelled = false;
    if (crop.kind === 'vector') {
      drawVector(ctx, crop, drawSize);
      setState('done');
      return;
    }
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      drawTile(ctx, crop, image, drawSize);
      setState('done');
    };
    image.onerror = () => {
      if (!cancelled) setState('failed');
    };
    image.src = `/data/tiles/${crop.tile.image}`;
    return () => {
      cancelled = true;
    };
  }, [crop, drawSize]);

  return (
    <canvas
      ref={ref}
      className="crop-canvas"
      width={drawSize}
      height={drawSize}
      style={{ height: sizePx, width: sizePx }}
      role="img"
      aria-label={state === 'failed' ? `${label} (the picture could not be loaded)` : label}
      data-state={state}
      data-testid={testId}
    />
  );
}
