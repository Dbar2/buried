import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ProposalFeature, ReviewState } from '../review/reviewModel';
import { bandOf } from '../review/reviewText';
import type { Band } from '../review/reviewText';
import { readTokens, withAlpha } from './colours';
import type { Tokens } from './colours';
import { fitView, panBy, pointInPolygon, polygonArea, rectFromDrag, toPlate, toScreen, visibleRect, zoomAt } from './plateView';
import type { Point, Rect, Size, View } from './plateView';

export type StageMode = 'view' | 'region' | 'area';

export type PlateStageProps = {
  imageUrl: string;
  /** The tile image's size in its own pixels. */
  tile: Size;
  /** The plate pixels the tile shows (the map area's bounding box). */
  crop: Rect;
  proposals: readonly ProposalFeature[];
  /** How many proposals, in file order, have been drawn on so far (the sequenced draw-on). */
  drawnCount: number;
  review: ReviewState | null;
  region: Rect | null;
  area: Rect | null;
  mode: StageMode;
  /** Changes when the view should refit to the whole map area. */
  fitSignal: number;
  /** Changes when the view should fit the current proposal. */
  focusSignal: number;
  onSelect: (id: string) => void;
  onRect: (rect: Rect) => void;
  onVisible: (rect: Rect) => void;
};

const CLICK_SLOP_PX = 4;
const ZOOM_STEP = 1.25;

function dashFor(band: Band): number[] {
  return band === 'high' ? [] : band === 'medium' ? [9, 5] : [2, 4];
}

type Drag =
  | { kind: 'pan'; startX: number; startY: number; lastX: number; lastY: number; moved: boolean }
  | { kind: 'rect'; from: Point; to: Point };

/**
 * The plate fills the main area: pan, zoom and fit, with the proposals outlined on it. Colours come
 * from the palette tokens. State is shown by line pattern as well as colour (design.md): an
 * undecided proposal's pattern gives its outline quality (solid, dashed, dotted), an accepted one is
 * a solid `ink` line with a faint fill, a rejected one recedes to a faint dashed line. The current
 * proposal has a thicker, full-strength `ink` outline with a dark halo and a text label beside it.
 */
export function PlateStage(props: PlateStageProps) {
  const { imageUrl, tile, crop, proposals, drawnCount, review, region, area, mode, fitSignal, focusSignal } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<Size>({ width: 800, height: 600 });
  const [view, setView] = useState<View>({ k: 0.1, tx: 0, ty: 0 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [tokens, setTokens] = useState<Tokens | null>(null);
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => setTokens(readTokens()), []);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImage(img);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const [measured, setMeasured] = useState(false);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      setSize({ width: Math.max(1, wrap.clientWidth), height: Math.max(1, wrap.clientHeight) });
      setMeasured(true);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  // Fit to the whole map area when asked, and once when the size is first known.
  useEffect(() => {
    if (measured) setView(fitView(size, crop));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitSignal, crop, measured]);

  // Fit the current proposal when asked.
  const byId = useMemo(() => new Map(proposals.map((p) => [p.id, p])), [proposals]);
  useEffect(() => {
    if (focusSignal === 0) return;
    const id = latest.current.review?.current;
    const p = id ? byId.get(id) : undefined;
    if (!p) return;
    const c = p.properties.crop_px;
    const grow = Math.max(c.width, c.height) * 1.5 + 40;
    setView(fitView(size, { x: c.x - grow / 2 + c.width / 2, y: c.y - grow / 2 + c.height / 2, width: grow, height: grow }, 8));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);

  useEffect(() => props.onVisible(visibleRect(view, size)), [view, size]); // eslint-disable-line react-hooks/exhaustive-deps

  // The wheel zooms the plate. It is listened for natively so the page does not scroll with it.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const at = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setView((v) => zoomAt(v, at, Math.exp(-event.deltaY * 0.0015)));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // ---- drawing ----

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tokens) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = tokens.night;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.tx, dpr * view.ty);

    if (image) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height);
    }
    const px = (n: number) => n / view.k; // a line width in screen pixels, in plate pixels

    const trace = (p: ProposalFeature) => {
      const poly = p.properties.pixel_polygon;
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.closePath();
    };

    const current = review?.current ?? null;
    const drawn = proposals.slice(0, drawnCount);
    // A dark underlay first, so a light outline reads on the white paper of a plate and a dark one on
    // its shaded parts. The plate itself is never tinted.
    const halo = (width: number, alpha: number) => {
      ctx.setLineDash([]);
      ctx.strokeStyle = withAlpha(tokens.night, alpha);
      ctx.lineWidth = px(width);
      ctx.stroke();
    };
    for (const p of drawn) {
      if (p.id === current) continue;
      const decision = review?.decisions[p.id];
      trace(p);
      if (decision === 'accept') {
        ctx.fillStyle = withAlpha(tokens.ink, 0.28);
        ctx.fill();
        halo(4, 0.85);
        ctx.setLineDash([]);
        ctx.strokeStyle = tokens.ink;
        ctx.lineWidth = px(2);
      } else if (decision === 'reject') {
        halo(2.5, 0.3);
        ctx.setLineDash([px(3), px(5)]);
        ctx.strokeStyle = withAlpha(tokens.muted, 0.7);
        ctx.lineWidth = px(1);
      } else {
        const band = bandOf(p.properties.quality.score);
        halo(3.5, 0.8);
        ctx.setLineDash(dashFor(band).map(px));
        ctx.strokeStyle = band === 'high' ? withAlpha(tokens.text, 0.95) : withAlpha(tokens.muted, 1);
        ctx.lineWidth = px(1.5);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const cur = current ? byId.get(current) : undefined;
    if (cur && drawn.includes(cur)) {
      trace(cur);
      ctx.strokeStyle = tokens.night;
      ctx.lineWidth = px(7);
      ctx.stroke();
      if (review?.decisions[cur.id] === 'accept') {
        ctx.fillStyle = withAlpha(tokens.ink, 0.2);
        ctx.fill();
      }
      ctx.strokeStyle = tokens.ink;
      ctx.lineWidth = px(4);
      ctx.stroke();
    }

    const frame = (r: Rect, dash: number[], colour: string, width: number, fill?: string) => {
      ctx.beginPath();
      ctx.rect(r.x, r.y, r.width, r.height);
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.setLineDash(dash.map(px));
      ctx.strokeStyle = colour;
      ctx.lineWidth = px(width);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (region) frame(region, [10, 6], withAlpha(tokens.text, 0.8), 1.5);
    if (area) frame(area, [4, 4], tokens.ink, 2, withAlpha(tokens.ink, 0.07));
    if (drag?.kind === 'rect') {
      const live = rectFromDrag(drag.from, drag.to, crop);
      if (live) frame(live, [6, 4], tokens.text, 1.5, withAlpha(tokens.text, 0.06));
    }
  }, [view, size, image, tokens, proposals, drawnCount, review, region, area, drag, crop, byId]);

  // ---- pointer ----

  const localPoint = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = localPoint(event);
    if (mode === 'view') {
      setDrag({ kind: 'pan', startX: at.x, startY: at.y, lastX: at.x, lastY: at.y, moved: false });
    } else {
      const plate = toPlate(view, at);
      setDrag({ kind: 'rect', from: plate, to: plate });
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const at = localPoint(event);
    if (drag.kind === 'pan') {
      const moved = drag.moved || Math.hypot(at.x - drag.startX, at.y - drag.startY) > CLICK_SLOP_PX;
      if (moved) setView((v) => panBy(v, at.x - drag.lastX, at.y - drag.lastY));
      setDrag({ ...drag, lastX: at.x, lastY: at.y, moved });
    } else {
      setDrag({ ...drag, to: toPlate(view, at) });
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drag) return;
    const at = localPoint(event);
    if (drag.kind === 'pan' && !drag.moved) {
      const hit = hitTest(toPlate(view, at), proposals.slice(0, drawnCount));
      if (hit) props.onSelect(hit);
    } else if (drag.kind === 'rect') {
      const rect = rectFromDrag(drag.from, toPlate(view, at), crop);
      if (rect) props.onRect(rect);
    }
    setDrag(null);
  };

  const zoomBy = (factor: number) => setView((v) => zoomAt(v, { x: size.width / 2, y: size.height / 2 }, factor));

  // The current proposal's label sits beside it in the DOM.
  const currentProposal = review?.current ? byId.get(review.current) : undefined;
  const label =
    currentProposal && proposals.indexOf(currentProposal) < drawnCount
      ? toScreen(view, { x: currentProposal.properties.crop_px.x, y: currentProposal.properties.crop_px.y })
      : null;

  return (
    <div className="plate-stage" ref={wrapRef} data-mode={mode}>
      <canvas
        ref={canvasRef}
        className="plate-canvas"
        data-testid="plate-canvas"
        data-view={JSON.stringify({ k: view.k, tx: view.tx, ty: view.ty })}
        data-drawn={drawnCount}
        role="img"
        aria-label="The plate with the proposed building outlines drawn on it. Use the review list or the keys to move between proposals."
        style={{ width: size.width, height: size.height, cursor: mode === 'view' ? (drag?.kind === 'pan' && drag.moved ? 'grabbing' : 'grab') : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
      />
      {label && currentProposal && (
        <span className="plate-label mono" style={{ left: label.x, top: Math.max(0, label.y - 24) }} data-testid="plate-label">
          Current {currentProposal.id.slice(-6)}
        </span>
      )}
      <div className="plate-tools" role="group" aria-label="Plate view">
        <button type="button" onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in">
          +
        </button>
        <button type="button" onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={() => setView(fitView(size, crop))}>
          Fit plate
        </button>
      </div>
      {mode !== 'view' && (
        <p className="plate-hint" role="status">
          {mode === 'region' ? 'Drag on the plate to choose the extraction region.' : 'Drag on the plate to draw the reviewed area.'}
        </p>
      )}
    </div>
  );
}

/** The smallest proposal whose outline contains the point, or null. */
export function hitTest(point: Point, proposals: readonly ProposalFeature[]): string | null {
  let best: { id: string; area: number } | null = null;
  for (const p of proposals) {
    const poly = p.properties.pixel_polygon;
    const c = p.properties.crop_px;
    if (point.x < c.x || point.x > c.x + c.width || point.y < c.y || point.y > c.y + c.height) continue;
    if (!pointInPolygon(point, poly)) continue;
    const area = polygonArea(poly);
    if (best === null || area < best.area) best = { id: p.id, area };
  }
  return best?.id ?? null;
}
