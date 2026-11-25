import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { compareModel } from './compare';
import type { CompareTile, WorldPolygon } from './compare';
import { chipsFit, clampPercent, DIVIDER_START, dividerForKey, dividerForPointer, dividerLabel, planAnnouncement } from './divider';
import * as copy from './copy';

export type ComparePlan = {
  sourceId: string;
  /** "the 1911 plan", for the slider's name and the announcement. */
  planName: string;
  /** "1911 plan", for the switch and the corner chip. */
  label: string;
  tile: CompareTile & { src: string };
};

export type CompareViewProps = {
  plans: readonly ComparePlan[];
  lot: WorldPolygon;
  buildings: readonly WorldPolygon[];
  lots: readonly WorldPolygon[];
  /** The outlines of the lettered uses on the lot, drawn faint and dashed on today's side ("where it stood"). */
  stood?: readonly WorldPolygon[];
  /** Play the one sweep of the divider, from the right edge to the middle, once the plan is in (session 053). Never under reduced motion. */
  intro?: boolean;
  /** False until the page's text is on screen: the plan is requested only after that (requirement 1.4). */
  loadPlan: boolean;
  /** Frame width over height. Wide screens 4 to 3, phones 1 (design.md "Compare view"). */
  aspect?: number;
  /** For tests: where the divider starts. */
  initialDivider?: number;
  initialPlan?: number;
};

const OUTLINE_CASING = 'lc-outline-casing';
const OUTLINE = 'lc-outline';
/** A frame that is less than this share past the sheet's map area gets no "edge of sheet" note. */
const EDGE_NOTE_MIN_SHARE = 0.02;
const clampTo = (v: number, low: number, high: number): number => Math.min(high, Math.max(low, v));
const edgeNote = (sourceId: string): string => copy.edgeOfSheet(sourceId.split('_').pop() ?? '');

/**
 * The compare view (spec 08 requirement 5): one frame, the selected plan's untouched tile left of the divider
 * and today's outlines right of it, both in one viewBox from `compareModel`. The divider position is state of
 * this component alone: it sets a clip on the today layer and nothing else, so the outline and the viewBox
 * cannot move with it.
 */
/** The sweep waits for the sheet to settle (rise 0.6 s, stamp at 1.0 s) and takes 1.1 s. Starts after the plan is in, or after 4 s whatever happens. */
const SWEEP_AT_MS = 1300;
const SWEEP_MS = 1100;
const SWEEP_GIVE_UP_MS = 4000;

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function CompareView({ plans, lot, buildings, lots, stood = [], intro = false, loadPlan, aspect = 4 / 3, initialDivider = DIVIDER_START, initialPlan = 0 }: CompareViewProps) {
  const [planIndex, setPlanIndex] = useState(Math.min(Math.max(initialPlan, 0), Math.max(plans.length - 1, 0)));
  // The sweep: the divider starts at the right edge and moves once to the middle. Reduced motion, or no `intro`, starts at the middle.
  const [sweep, setSweep] = useState<'pending' | 'running' | 'done'>(() => (intro && !prefersReducedMotion() ? 'pending' : 'done'));
  const [divider, setDivider] = useState(sweep === 'pending' ? 100 : clampPercent(initialDivider));
  const [announcement, setAnnouncement] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);
  const [fit, setFit] = useState({ left: true, right: true });
  const frame = useRef<HTMLDivElement>(null);
  const leftChip = useRef<HTMLSpanElement>(null);
  const rightChip = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);

  const plan = plans[planIndex];
  const model = useMemo(
    () => (plan ? compareModel({ lot, tile: plan.tile, buildings, lots, stood, aspect }) : null),
    [plan, lot, buildings, lots, stood, aspect],
  );

  // The plan is requested once the text is up. The browser keeps the tile, so the lettering crops share the request.
  useEffect(() => {
    if (!loadPlan || !plan) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setLoaded(plan.sourceId);
    };
    image.src = plan.tile.src;
    return () => {
      cancelled = true;
    };
  }, [loadPlan, plan]);

  // The one sweep, from the right edge to the middle. The visitor's own hand ends it at once.
  const mountedAt = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const swept = useRef(false);
  const started = useRef(false);
  const rafId = useRef(0);
  const ready0 = plan !== undefined && loaded === plan.sourceId;
  useEffect(() => {
    if (sweep !== 'pending' || started.current) return;
    const run = () => {
      if (swept.current || started.current) return;
      started.current = true;
      setSweep('running');
      const t0 = performance.now();
      const step = (now: number) => {
        if (swept.current) return;
        const p = Math.min(1, (now - t0) / SWEEP_MS);
        const eased = p * p * (3 - 2 * p);
        setDivider(100 + (DIVIDER_START - 100) * eased);
        if (p < 1) rafId.current = requestAnimationFrame(step);
        else setSweep('done');
      };
      rafId.current = requestAnimationFrame(step);
    };
    const waited = performance.now() - mountedAt.current;
    const wait = ready0 ? Math.max(0, SWEEP_AT_MS - waited) : Math.max(0, SWEEP_GIVE_UP_MS - waited);
    const timer = window.setTimeout(run, wait);
    return () => window.clearTimeout(timer);
  }, [sweep, ready0]);
  useEffect(() => () => cancelAnimationFrame(rafId.current), []);

  const stopSweep = () => {
    if (sweep === 'done') return;
    swept.current = true;
    setSweep('done');
  };

  // Each corner label stays on its side of the divider: it is hidden when the divider leaves it no room.
  useEffect(() => {
    const measure = () => {
      const next = chipsFit(frame.current?.clientWidth ?? 0, divider, leftChip.current?.offsetWidth ?? 0, rightChip.current?.offsetWidth ?? 0);
      setFit((old) => (old.left === next.left && old.right === next.right ? old : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined' || !frame.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [divider, planIndex]);

  if (!plan || !model) return <p className="lc-compare-note">No plan picture is loaded for this lot.</p>;

  const choose = (index: number) => {
    setPlanIndex(index);
    const next = plans[index];
    if (next) setAnnouncement(planAnnouncement(next.planName));
  };

  const onKey = (event: KeyboardEvent) => {
    const next = dividerForKey(event.key, divider);
    if (next === null) return;
    event.preventDefault();
    stopSweep();
    setDivider(next);
  };

  const move = (event: PointerEvent) => {
    const box = frame.current?.getBoundingClientRect();
    if (box) setDivider(dividerForPointer(event.clientX, box.left, box.width));
  };

  const ready = loaded === plan.sourceId;

  return (
    <div className="lc-compare" data-testid="lc-compare">
      {plans.length > 1 ? (
        <div className="lc-switch" role="group" aria-label="Plan">
          {plans.map((p, i) => (
            <button key={p.sourceId} type="button" aria-pressed={i === planIndex} onClick={() => choose(i)} data-testid={`lc-plan-${p.sourceId}`}>
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      <div
        ref={frame}
        className="lc-frame"
        style={{ '--divider': `${divider}%`, aspectRatio: String(aspect) } as CSSProperties}
        data-testid="lc-frame"
        data-plan={plan.sourceId}
        data-ready={ready}
        data-sweep={sweep}
      >
        <svg className="lc-layer lc-layer-plan" viewBox={model.viewBoxText} role="img" aria-label={`${plan.label}, the untouched scan, with this lot outlined`} data-testid="lc-layer-plan">
          {model.mapAreaPath ? (
            <defs>
              <clipPath id={`lc-sheet-${plan.sourceId}`}>
                <path d={model.mapAreaPath} fillRule="evenodd" />
              </clipPath>
            </defs>
          ) : null}
          {ready ? (
            <image
              href={plan.tile.src}
              width={plan.tile.widthPx}
              height={plan.tile.heightPx}
              clipPath={model.mapAreaPath ? `url(#lc-sheet-${plan.sourceId})` : undefined}
            />
          ) : null}
          <path d={model.lotPath} className={OUTLINE_CASING} fillRule="evenodd" />
          <path d={model.lotPath} className={OUTLINE} fillRule="evenodd" data-testid="lc-outline-plan" />
        </svg>
        <svg
          className="lc-layer lc-layer-today"
          viewBox={model.viewBoxText}
          style={{ clipPath: 'inset(0 0 0 var(--divider))' }}
          role="img"
          aria-label="Today, from the City of Toronto's building outlines and lot lines, with this lot outlined"
          data-testid="lc-layer-today"
        >
          {model.lotLinePaths.map((d, i) => (
            <path key={`l${i}`} d={d} className="lc-today-lot" fillRule="evenodd" />
          ))}
          {model.presentPaths.map((d, i) => (
            <path key={`b${i}`} d={d} className="lc-today-building" fillRule="evenodd" />
          ))}
          {model.stoodPaths.map((d, i) => (
            <path key={`s${i}`} d={d} className="lc-stood" fillRule="evenodd" data-testid="lc-stood" />
          ))}
          <path d={model.lotPath} className={OUTLINE_CASING} fillRule="evenodd" />
          <path d={model.lotPath} className={OUTLINE} fillRule="evenodd" data-testid="lc-outline-today" />
        </svg>
        {model.uncovered && model.uncovered.share > EDGE_NOTE_MIN_SHARE ? (
          <span
            className="lc-edge-note"
            style={{ left: `${clampTo(model.uncovered.atX, 14, 86)}%`, top: `${clampTo(model.uncovered.atY, 10, 90)}%`, visibility: clampTo(model.uncovered.atX, 14, 86) + 12 < divider ? 'visible' : 'hidden' }}
            data-testid="lc-edge-note"
          >
            {edgeNote(plan.sourceId)}
          </span>
        ) : null}
        <span ref={leftChip} className="lc-chip lc-chip-left" style={{ visibility: fit.left ? 'visible' : 'hidden' }} data-testid="lc-chip-left">
          {plan.label}
        </span>
        <span ref={rightChip} className="lc-chip lc-chip-right" style={{ visibility: fit.right ? 'visible' : 'hidden' }} data-testid="lc-chip-right">
          Today
        </span>
        <div
          className="lc-divider"
          style={{ left: 'var(--divider)' }}
          role="slider"
          tabIndex={0}
          aria-label={dividerLabel(plan.planName)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(divider)}
          aria-valuetext={`${Math.round(divider)} per cent plan, the rest today`}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            stopSweep();
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            move(e);
          }}
          onPointerMove={(e) => {
            if (dragging.current) move(e);
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          data-testid="lc-divider"
        >
          <span className="lc-grip" aria-hidden="true">
            ◂▸
          </span>
        </div>
        {!ready ? <span className="lc-loading">{copy.LOADING_PLAN}</span> : null}
      </div>
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="lc-announce">
        {announcement}
      </p>
    </div>
  );
}
