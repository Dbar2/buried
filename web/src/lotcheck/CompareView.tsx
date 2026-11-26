import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react';
import { makeSheetTransform } from '../block/sheetTransform';
import { compareModel } from './compare';
import type { CompareTile, WorldPolygon } from './compare';
import { chipsFit, clampPercent, DIVIDER_START, dividerForKey, dividerForPointer, dividerLabel } from './divider';
import * as copy from './copy';
import { APPROXIMATE_NOTE, layerCaption, layerChoices, NOW_OUTLINES_LABEL, NOW_PHOTO_LABEL, photoPlacement, placementText } from './photos';
import type { ImaginedView, NowShown, Photo, ThenShown } from './photos';
import type { Pictures } from './usePictures';

export type ComparePlan = {
  sourceId: string;
  /** "the 1911 plan", for the slider's name and the announcement. */
  planName: string;
  /** "1911 plan", for the switch and the corner chip. */
  label: string;
  /** "1911", "1931-35": for the caption under the view. Taken from `label` when not given. */
  years?: string;
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
  /** The aerial photographs (session 055). Without them there is only the plan against today's outlines. */
  pictures?: Pictures;
  /** The imagined views about a lettered use ON this lot, from `viewsOnLot`. Never a view for a lot that is only next to a recorded site. */
  imagined?: readonly ImaginedView[];
  /** Called once when the plan tile has loaded (or failed): the pictures after it may be requested. */
  onPlanReady?: () => void;
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
 * The compare view (spec 08 requirement 5, 11): one frame, the chosen Then layer left of the divider (a plan's
 * untouched tile by default, or the 1939 photograph, or an imagined view) and the chosen Now layer right of it (today's
 * photograph by default, or today's outlines), all in one viewBox from `compareModel`. The divider position is state
 * of this component alone: it sets a clip on the today layer and nothing else, so the outline and the viewBox
 * cannot move with it. The lot outline and "where it stood" are drawn last in each layer, so they sit on top of every
 * picture. A picture is requested only after the plan tile has loaded.
 */
/** The sweep waits for the sheet to settle (rise 0.6 s, stamp at 1.0 s) and takes 1.1 s. Starts after the plan is in, or after 4 s whatever happens. */
const SWEEP_AT_MS = 1300;
const SWEEP_MS = 1100;
const SWEEP_GIVE_UP_MS = 4000;

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const NO_VIEWS: readonly ImaginedView[] = [];

export function CompareView({
  plans,
  lot,
  buildings,
  lots,
  stood = [],
  intro = false,
  loadPlan,
  aspect = 4 / 3,
  pictures,
  imagined = NO_VIEWS,
  onPlanReady,
  initialDivider = DIVIDER_START,
  initialPlan = 0,
}: CompareViewProps) {
  const groupId = useId();
  const [planIndex, setPlanIndex] = useState(Math.min(Math.max(initialPlan, 0), Math.max(plans.length - 1, 0)));
  const [thenKey, setThenKey] = useState<string>(plans[Math.min(Math.max(initialPlan, 0), Math.max(plans.length - 1, 0))]?.sourceId ?? '');
  const [nowKey, setNowKey] = useState<'photo' | 'outlines'>('photo');
  // The sweep: the divider starts at the right edge and moves once to the middle. Reduced motion, or no `intro`, starts at the middle.
  const [sweep, setSweep] = useState<'pending' | 'running' | 'done'>(() => (intro && !prefersReducedMotion() ? 'pending' : 'done'));
  const [divider, setDivider] = useState(sweep === 'pending' ? 100 : clampPercent(initialDivider));
  const [announcement, setAnnouncement] = useState('');
  const [loaded, setLoaded] = useState<string | null>(null);
  const [pictureLoaded, setPictureLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const [photoOn, setPhotoOn] = useState(false);
  const [fit, setFit] = useState({ left: true, right: true });
  const frame = useRef<HTMLDivElement>(null);
  const leftChip = useRef<HTMLSpanElement>(null);
  const rightChip = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const requested = useRef(new Set<string>());
  const readyTold = useRef(false);

  const plan = plans[planIndex];
  const choices = useMemo(
    () => layerChoices({ plans, lot, photos: pictures?.photos ?? [], onLotViews: imagined }),
    [plans, lot, pictures?.photos, imagined],
  );
  const thenChoice = choices.then.find((c) => c.key === thenKey) ?? choices.then[0];
  const thenLayer = thenChoice?.layer;
  const thenPhoto: Photo | null = thenLayer?.kind === 'photo' ? (choices.thenPhotos.find((p) => p.id === thenLayer.photoId) ?? null) : null;
  const thenView: ImaginedView | null = thenLayer?.kind === 'imagined' ? (choices.views.find((v) => v.slug === thenLayer.slug) ?? null) : null;
  const thenTopdown = thenView?.topdown ?? null;
  const todayPhoto = nowKey === 'photo' ? choices.todayPhoto : null;
  const photosPending = pictures !== undefined && pictures.status === 'pending';

  const model = useMemo(
    () => (plan ? compareModel({ lot, tile: plan.tile, buildings, lots, stood, aspect, include: thenTopdown?.bounds }) : null),
    [plan, lot, buildings, lots, stood, aspect, thenTopdown],
  );

  const transform = useMemo(() => (plan ? makeSheetTransform(plan.tile.corners, plan.tile.widthPx, plan.tile.heightPx) : null), [plan]);
  const placeOf = (p: { bounds: readonly [number, number, number, number]; widthPx: number; heightPx: number }) => (transform ? placementText(photoPlacement(p.bounds, p.widthPx, p.heightPx, transform)) : undefined);

  // The plan is requested once the text is up. The browser keeps the tile, so the lettering crops share the request.
  useEffect(() => {
    if (!loadPlan || !plan) return;
    let cancelled = false;
    const image = new Image();
    const done = () => {
      if (!cancelled) setLoaded(plan.sourceId);
    };
    image.onload = done;
    image.src = plan.tile.src;
    return () => {
      cancelled = true;
    };
  }, [loadPlan, plan]);

  const ready = plan !== undefined && loaded === plan.sourceId;

  // Tell the page once that the plan is in, so the pictures that follow it may be requested.
  useEffect(() => {
    if (ready && !readyTold.current) {
      readyTold.current = true;
      onPlanReady?.();
    }
  }, [ready, onPlanReady]);

  // The pictures on screen are requested after the plan tile, and only the ones the chosen layers need.
  const wanted = [todayPhoto?.src, thenPhoto?.src, thenTopdown?.src];
  useEffect(() => {
    if (!ready) return;
    for (const src of [todayPhoto?.src, thenPhoto?.src, thenTopdown?.src]) {
      if (!src || requested.current.has(src)) continue;
      requested.current.add(src);
      const image = new Image();
      image.onload = () => setPictureLoaded((old) => new Set(old).add(src));
      image.src = src;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ...wanted]);

  const thenSrc = thenPhoto?.src ?? thenTopdown?.src ?? null;
  const thenReady = thenLayer?.kind === 'plan' ? ready : thenSrc !== null && pictureLoaded.has(thenSrc);
  const nowPhotoLoaded = todayPhoto !== null && pictureLoaded.has(todayPhoto.src);

  // The Now side fades from outlines to the photograph once the sweep is over (about 0.6 s, a CSS transition on opacity).
  const wantPhoto = nowPhotoLoaded && sweep === 'done';
  useEffect(() => {
    if (!wantPhoto) {
      setPhotoOn(false);
      return;
    }
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPhotoOn(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [wantPhoto]);

  // The one sweep, from the right edge to the middle. The visitor's own hand ends it at once.
  const mountedAt = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const swept = useRef(false);
  const started = useRef(false);
  const rafId = useRef(0);
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
    const wait = ready ? Math.max(0, SWEEP_AT_MS - waited) : Math.max(0, SWEEP_GIVE_UP_MS - waited);
    const timer = window.setTimeout(run, wait);
    return () => window.clearTimeout(timer);
  }, [sweep, ready]);
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
  }, [divider, thenKey, nowKey]);

  if (!plan || !model || !thenChoice) return <p className="lc-compare-note">No plan picture is loaded for this lot.</p>;

  const chooseThen = (key: string) => {
    const choice = choices.then.find((c) => c.key === key);
    if (!choice) return;
    setThenKey(key);
    if (choice.layer.kind === 'plan') {
      const sourceId = choice.layer.sourceId;
      setPlanIndex(Math.max(0, plans.findIndex((p) => p.sourceId === sourceId)));
    }
    setAnnouncement(choice.announce);
  };
  const chooseNow = (key: 'photo' | 'outlines') => {
    setNowKey(key);
    setAnnouncement(choices.now.find((c) => c.key === key)?.announce ?? '');
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

  const isPlan = thenLayer?.kind === 'plan';
  // What is on screen on each side. The Now side shows the outlines until its photograph has loaded.
  const nowShown: NowShown = nowPhotoLoaded && todayPhoto ? { kind: 'photo', year: todayPhoto.year } : { kind: 'outlines' };
  const thenShown: ThenShown =
    thenLayer?.kind === 'photo' && thenPhoto
      ? { kind: 'photo', year: thenPhoto.year, approximate: thenPhoto.approximate }
      : thenLayer?.kind === 'imagined' && thenView
        ? { kind: 'imagined', planName: thenView.planName }
        : { kind: 'plan', years: plan.years ?? plan.label.replace(/ plan$/, '') };
  const caption = layerCaption(thenShown, nowShown).text;
  const photoShown = photoOn && nowPhotoLoaded;
  const rightChipText = choices.todayPhoto ? (nowShown.kind === 'photo' ? NOW_PHOTO_LABEL : NOW_OUTLINES_LABEL) : 'Today';
  const showControls = choices.then.length > 1 || choices.now.length > 1 || photosPending;
  // While the photograph index is still on its way, the Now group is held in place so the page does not jump.
  const nowChoices = photosPending && choices.now.length === 1 ? [{ key: 'photo' as const, label: NOW_PHOTO_LABEL, announce: '' }, ...choices.now] : choices.now;
  const nowSel: 'photo' | 'outlines' = nowKey === 'photo' && choices.todayPhoto === null && !photosPending ? 'outlines' : nowKey;
  const thenAria =
    thenLayer?.kind === 'photo' && thenPhoto
      ? `${thenPhoto.year} aerial photograph, City of Toronto, placed approximately, with this lot outlined`
      : thenLayer?.kind === 'imagined' && thenView
        ? `Imagined view, ${thenView.about}. Not a photograph. With this lot outlined`
        : `${plan.label}, the untouched scan, with this lot outlined`;

  return (
    <div className="lc-compare" data-testid="lc-compare">
      {showControls ? (
        <div className="lc-switch lc-layers" data-testid="lc-layers">
          <div className="lc-layer-group" role="radiogroup" aria-label="Then" data-testid="lc-then-group">
            <span className="lc-layer-legend" aria-hidden="true">
              Then
            </span>
            {choices.then.map((c) => (
              <label key={c.key} className="lc-radio">
                <input
                  type="radio"
                  name={`${groupId}-then`}
                  checked={c.key === thenChoice.key}
                  onChange={() => chooseThen(c.key)}
                  data-testid={c.layer.kind === 'plan' ? `lc-plan-${c.key}` : `lc-then-${c.key.replace(':', '-')}`}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
          <div className="lc-layer-group" role="radiogroup" aria-label="Now" data-testid="lc-now-group">
            <span className="lc-layer-legend" aria-hidden="true">
              Now
            </span>
            {nowChoices.map((c) => (
              <label key={c.key} className="lc-radio">
                <input
                  type="radio"
                  name={`${groupId}-now`}
                  checked={c.key === nowSel}
                  disabled={photosPending && c.key === 'photo' && choices.todayPhoto === null}
                  onChange={() => chooseNow(c.key)}
                  data-testid={`lc-now-${c.key}`}
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      <div
        ref={frame}
        className="lc-frame"
        style={{ '--divider': `${divider}%`, aspectRatio: String(aspect) } as CSSProperties}
        data-testid="lc-frame"
        data-plan={plan.sourceId}
        data-ready={ready}
        data-then={thenChoice.key}
        data-then-ready={thenReady}
        data-now={photoShown ? 'photo' : 'outlines'}
        data-sweep={sweep}
      >
        <svg className="lc-layer lc-layer-plan" viewBox={model.viewBoxText} role="img" aria-label={thenAria} data-testid="lc-layer-plan">
          {model.mapAreaPath ? (
            <defs>
              <clipPath id={`lc-sheet-${plan.sourceId}`}>
                <path d={model.mapAreaPath} fillRule="evenodd" />
              </clipPath>
            </defs>
          ) : null}
          {isPlan && ready ? (
            <image
              className="lc-scan"
              href={plan.tile.src}
              width={plan.tile.widthPx}
              height={plan.tile.heightPx}
              clipPath={model.mapAreaPath ? `url(#lc-sheet-${plan.sourceId})` : undefined}
            />
          ) : null}
          {thenPhoto && thenReady ? (
            <image className="lc-photo" href={thenPhoto.src} width={thenPhoto.widthPx} height={thenPhoto.heightPx} transform={placeOf(thenPhoto)} preserveAspectRatio="none" data-testid="lc-then-image" />
          ) : null}
          {thenTopdown && thenReady ? (
            <image className="lc-photo lc-imagined-image" href={thenTopdown.src} width={thenTopdown.widthPx} height={thenTopdown.heightPx} transform={placeOf(thenTopdown)} preserveAspectRatio="none" data-testid="lc-then-image" />
          ) : null}
          <path d={model.lotPath} className={OUTLINE_CASING} fillRule="evenodd" />
          <path d={model.lotPath} className={OUTLINE} fillRule="evenodd" data-testid="lc-outline-plan" />
        </svg>
        <svg
          className="lc-layer lc-layer-today"
          viewBox={model.viewBoxText}
          style={{ clipPath: 'inset(0 0 0 var(--divider))' }}
          role="img"
          aria-label={photoShown ? "Today, from the City of Toronto's aerial photograph, with this lot outlined" : "Today, from the City of Toronto's building outlines and lot lines, with this lot outlined"}
          data-testid="lc-layer-today"
        >
          {nowPhotoLoaded && todayPhoto ? (
            <image
              className="lc-now-photo"
              href={todayPhoto.src}
              width={todayPhoto.widthPx}
              height={todayPhoto.heightPx}
              transform={placeOf(todayPhoto)}
              preserveAspectRatio="none"
              data-on={photoOn}
              data-testid="lc-now-image"
            />
          ) : null}
          <g className="lc-now-outlines" data-off={photoOn}>
            {model.lotLinePaths.map((d, i) => (
              <path key={`l${i}`} d={d} className="lc-today-lot" fillRule="evenodd" />
            ))}
            {model.presentPaths.map((d, i) => (
              <path key={`b${i}`} d={d} className="lc-today-building" fillRule="evenodd" />
            ))}
          </g>
          {model.stoodPaths.map((d, i) => (
            <path key={`c${i}`} d={d} className="lc-stood-casing" fillRule="evenodd" />
          ))}
          {model.stoodPaths.map((d, i) => (
            <path key={`s${i}`} d={d} className="lc-stood" fillRule="evenodd" data-testid="lc-stood" />
          ))}
          <path d={model.lotPath} className={OUTLINE_CASING} fillRule="evenodd" />
          <path d={model.lotPath} className={OUTLINE} fillRule="evenodd" data-testid="lc-outline-today" />
        </svg>
        {isPlan && model.uncovered && model.uncovered.share > EDGE_NOTE_MIN_SHARE ? (
          <span
            className="lc-edge-note"
            style={{ left: `${clampTo(model.uncovered.atX, 14, 86)}%`, top: `${clampTo(model.uncovered.atY, 10, 90)}%`, visibility: clampTo(model.uncovered.atX, 14, 86) + 12 < divider ? 'visible' : 'hidden' }}
            data-testid="lc-edge-note"
          >
            {edgeNote(plan.sourceId)}
          </span>
        ) : null}
        {thenPhoto?.approximate && thenReady ? (
          <div className="lc-left-clip">
            <span className="lc-photo-note" data-testid="lc-approximate">
              {APPROXIMATE_NOTE}
            </span>
          </div>
        ) : null}
        <span ref={leftChip} className="lc-chip lc-chip-left" style={{ visibility: fit.left ? 'visible' : 'hidden' }} data-testid="lc-chip-left">
          {thenChoice.label}
        </span>
        <span ref={rightChip} className="lc-chip lc-chip-right" style={{ visibility: fit.right ? 'visible' : 'hidden' }} data-testid="lc-chip-right">
          {rightChipText}
        </span>
        <div
          className="lc-divider"
          style={{ left: 'var(--divider)' }}
          role="slider"
          tabIndex={0}
          aria-label={dividerLabel(thenChoice.name)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(divider)}
          aria-valuetext={`${Math.round(divider)} per cent on the left, the rest today`}
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
        {!thenReady ? <span className="lc-loading">{isPlan ? copy.LOADING_PLAN : copy.LOADING_PICTURE}</span> : null}
      </div>
      <p className="lc-compare-note" data-testid="lc-caption">
        {caption}
      </p>
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="lc-announce">
        {announcement}
      </p>
    </div>
  );
}
