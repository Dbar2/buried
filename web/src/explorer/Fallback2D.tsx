import { useEffect, useRef, useState } from 'react';
import { tileToCanvas, worldToCanvas } from '../report/cropPlan';
import type { Pt } from '../report/cropPlan';
import type { FallbackPlan } from './sceneFallback';

const token = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function trace(ctx: CanvasRenderingContext2D, rings: Pt[][], to: (p: Pt) => Pt, closed: boolean): void {
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach((p, i) => {
      const [x, y] = to(p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (closed) ctx.closePath();
  }
}

/** Dash patterns by confidence class: solid, dashed, dotted. A pattern as well as a label, never colour alone. */
export const DASHES: Readonly<Record<'documented' | 'estimated' | 'unknown', number[]>> = {
  documented: [],
  estimated: [10, 6],
  unknown: [2, 5],
};

/**
 * Draws a plan. The square window is fitted into the canvas (contain) and the rest of the canvas
 * shows the same ground, so the tile is never cut at the window's edge.
 */
export function drawPlan(ctx: CanvasRenderingContext2D, plan: FallbackPlan, images: ReadonlyMap<string, CanvasImageSource>, width: number, height: number, scale: number): void {
  const side = Math.min(width, height);
  const ox = (width - side) / 2;
  const oy = (height - side) / 2;
  const m = worldToCanvas(plan.window, side);
  const to = (p: Pt): Pt => [m[0] * p[0] + m[4] + ox, m[3] * p[1] + m[5] + oy];
  const px = Math.max(1, side / 640) * scale;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = token('--fog');
  ctx.fillRect(0, 0, width, height);

  for (const tile of plan.tiles) {
    const image = images.get(tile.sourceId);
    if (!image) continue;
    const [a, b, c, d, e, f] = tileToCanvas(tile, plan.window, side);
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(a, b, c, d, e + ox, f + oy);
    ctx.drawImage(image, 0, 0, tile.widthPx, tile.heightPx);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Today's outlines: cold, as in the scene.
  ctx.lineWidth = px;
  ctx.fillStyle = token('--present');
  ctx.strokeStyle = token('--muted');
  for (const rings of plan.present) {
    trace(ctx, rings, to, true);
    ctx.fill('evenodd');
    ctx.stroke();
  }

  for (const f of plan.footprints) {
    trace(ctx, f.rings, to, f.closed);
    if (f.closed && f.confidence !== 'unknown') {
      ctx.globalAlpha = f.confidence === 'documented' ? 0.28 : 0.12;
      ctx.fillStyle = token('--ink');
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
    }
    // A night casing under an ink line reads on a dark scan and on a pale one.
    ctx.setLineDash([]);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = token('--night');
    ctx.lineWidth = 4.5 * px;
    ctx.stroke();
    ctx.setLineDash(DASHES[f.confidence].map((n) => n * px));
    ctx.strokeStyle = token('--ink');
    ctx.lineWidth = 2 * px;
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (plan.lot) {
    trace(ctx, plan.lot, to, true);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = token('--night');
    ctx.lineWidth = 5 * px;
    ctx.stroke();
    ctx.strokeStyle = token('--lantern');
    ctx.lineWidth = 3 * px;
    ctx.stroke();
  }
}

export type Fallback2DProps = {
  plan: FallbackPlan;
  eraLabel: string;
};

/**
 * The 2D map shown in place of the Player when it cannot run (design.md "Accessibility"). It draws
 * the era's untouched tiles and every feature of the era list over them, patterned by confidence, and
 * the pinned lot in `lantern`. The list view is its text equivalent.
 */
export function Fallback2D({ plan, eraLabel }: Fallback2DProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<ReadonlyMap<string, CanvasImageSource>>(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [state, setState] = useState<'drawing' | 'done'>('drawing');

  useEffect(() => {
    let cancelled = false;
    const loaded = new Map<string, CanvasImageSource>();
    setImages(new Map());
    for (const tile of plan.tiles) {
      const image = new Image();
      image.onload = () => {
        if (cancelled) return;
        loaded.set(tile.sourceId, image);
        setImages(new Map(loaded));
      };
      image.src = `/data/tiles/${tile.image}`;
    }
    return () => {
      cancelled = true;
    };
  }, [plan.tiles]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || size.w === 0 || size.h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(size.w * dpr);
    el.height = Math.round(size.h * dpr);
    drawPlan(ctx, plan, images, el.width, el.height, dpr);
    setState('done');
  }, [plan, images, size]);

  return (
    <canvas
      ref={ref}
      className="fallback-2d"
      role="img"
      aria-label={`Map of ${eraLabel}: ${plan.footprints.length} ${plan.footprints.length === 1 ? 'feature' : 'features'} drawn. The list of features has the same records as text.`}
      data-testid="fallback-2d"
      data-era={plan.eraId}
      data-feature-count={plan.footprints.length}
      data-tiles-loaded={images.size}
      data-state={state}
    />
  );
}
