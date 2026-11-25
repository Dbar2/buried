import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { compareModel } from './compare';
import type { CompareTile, WorldPolygon } from './compare';
import { clampPercent, DIVIDER_START, dividerForKey, dividerForPointer, dividerLabel, planAnnouncement } from './divider';
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

/**
 * The compare view (spec 08 requirement 5): one frame, the selected plan's untouched tile left of the divider
 * and today's outlines right of it, both in one viewBox from `compareModel`. The divider position is state of
 * this component alone: it sets a clip on the today layer and nothing else, so the outline and the viewBox
 * cannot move with it.
 */
export function CompareView({ plans, lot, buildings, lots, loadPlan, aspect = 4 / 3, initialDivider = DIVIDER_START, initialPlan = 0 }: CompareViewProps) {
  const [planIndex, setPlanIndex] = useState(Math.min(Math.max(initialPlan, 0), Math.max(plans.length - 1, 0)));
  const [divider, setDivider] = useState(clampPercent(initialDivider));
  const [announcement, setAnnouncement] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const plan = plans[planIndex];
  const model = useMemo(
    () => (plan ? compareModel({ lot, tile: plan.tile, buildings, lots, aspect }) : null),
    [plan, lot, buildings, lots, aspect],
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
      >
        <svg className="lc-layer lc-layer-plan" viewBox={model.viewBoxText} role="img" aria-label={`${plan.label}, the untouched scan, with this lot outlined`} data-testid="lc-layer-plan">
          {ready ? <image href={plan.tile.src} width={plan.tile.widthPx} height={plan.tile.heightPx} /> : null}
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
          <path d={model.lotPath} className={OUTLINE_CASING} fillRule="evenodd" />
          <path d={model.lotPath} className={OUTLINE} fillRule="evenodd" data-testid="lc-outline-today" />
        </svg>
        <span className="lc-chip lc-chip-left">{plan.label}</span>
        <span className="lc-chip lc-chip-right">Today</span>
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
