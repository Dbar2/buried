import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mark } from '../shell/Mark';
import * as copy from './copy';
import { buildDigTimeline, digPlays, holdTime, MAX_TOTAL_MS, skipTo, stateAt } from './digTimeline';
import type { DigState, DigTimeline } from './digTimeline';
import type { LotCheck } from './lotCheck';
import { imaginedLine, streetCaption, streetViewForSlip } from './photos';
import type { ImaginedView } from './photos';
import { loadImagined } from './usePictures';

/** The imagined thumbnail on a slip (requirement 12.3). */
const THUMB_WIDTH_PX = 96;

/** The art the dig draws (decoration only). */
export type DigArt = { lantern: string; strata: string; skyline: string };

export type DigOverlayProps = {
  /** Builds the lot check for the chosen lot. It is the same function the Result uses. Called once, after the first paint. */
  build: () => LotCheck | null;
  /** The dig is over, skipped or timed out: open the Result. */
  onFinish: () => void;
  art: DigArt;
};

/** Where the ground line sits in the strata art (a share of its height), and the ruler's top and bottom (shares of the window). */
const GROUND_SHARE = 0.123;
const RULER_TOP = 0.3;
const RULER_BOTTOM = 0.76;
const LANTERN_FLAME = 0.55;

/** A skip key counts only from a fresh press at least this long after the dig begins (the key that began it never skips it). */
export const SKIP_KEY_DELAY_MS = 600;

/** Whether this key press skips the dig. Pure, so it can be tested. */
export function skipKeyCounts(event: { key: string; repeat: boolean }, startedAt: number, now: number): boolean {
  if (event.key !== 'Escape' && event.key !== 'Enter') return false;
  if (event.repeat) return false;
  return now - startedAt >= SKIP_KEY_DELAY_MS;
}

/**
 * A test hook: `window.__buriedDigHold = <mark index>` freezes the clock inside that mark's pause, with its slip showing,
 * so a test can read the screen without a sleep. Unset, the dig runs as it does for a visitor.
 */
export function holdFrom(value: unknown, webdriver: boolean): number | null {
  if (!webdriver) return null;
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** The hook is honoured only in an automated browser (`navigator.webdriver`); for a real visitor it does nothing. */
function heldMark(): number | null {
  const v = (window as unknown as { __buriedDigHold?: unknown }).__buriedDigHold;
  return holdFrom(v, navigator.webdriver === true);
}

/**
 * The dig (spec 08 requirement 9): a full-window overlay in which a lantern is lowered on a rope through the layers
 * of earth, pausing at a mark for each plan, with a paper slip beside it. It draws the state `stateAt` gives; every
 * word on a slip is a line of the lot check. It never runs longer than `MAX_TOTAL_MS`: a timer opens the Result then.
 */
export function DigOverlay({ build, onFinish, art }: DigOverlayProps) {
  const [timeline, setTimeline] = useState<DigTimeline | null>(null);
  const [views, setViews] = useState<readonly ImaginedView[]>([]);
  const [shown, setShown] = useState<number[]>([]);
  const [active, setActive] = useState<number | null>(null);
  const [announce, setAnnounce] = useState<string>(copy.DIG.announceStart);
  const finished = useRef(false);
  const buildRef = useRef(build);
  const finishRef = useRef(onFinish);
  buildRef.current = build;
  finishRef.current = onFinish;
  const root = useRef<HTMLDivElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const rope = useRef<HTMLDivElement>(null);
  const lantern = useRef<HTMLImageElement>(null);
  const dark = useRef<HTMLDivElement>(null);
  const glow = useRef<HTMLDivElement>(null);
  const curtain = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    finishRef.current();
  }, []);

  // The lamp is lit (the check is built) after the first paint. A lot the plans do not cover goes straight to its Result.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const check = buildRef.current();
      if (!check || check.kind !== 'check' || !digPlays(check, false)) {
        finish();
        return;
      }
      setTimeline(buildDigTimeline(check, false));
      // The small index of imagined views is read now that the visitor has chosen a lot, never on the Landing before that.
      void loadImagined().then((r) => setViews(r.views));
    }, 40);
    // Never longer than 7 s from the start, whatever happens (the test hook that holds the clock turns the cap off).
    const cap = window.setTimeout(() => {
      if (heldMark() === null) finish();
    }, MAX_TOTAL_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(cap);
    };
  }, [finish]);

  // Focus goes into the dialog, and Tab reaches "Skip".
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
  }, []);

  // Skip: the button, Escape and Enter. The Enter that chose the address is still travelling up to the window when this
  // listener is added, so a key counts only if it is a fresh press (not a repeat) at least SKIP_KEY_DELAY_MS after the start.
  useEffect(() => {
    const startedAt = performance.now();
    const onKey = (event: KeyboardEvent) => {
      if (skipKeyCounts(event, startedAt, performance.now())) {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finish]);

  const n = timeline ? Math.max(timeline.marks.length - 1, 1) : 1;

  const draw = useCallback(
    (st: DigState) => {
      const r = root.current;
      if (!r) return;
      const h = r.clientHeight;
      const top = RULER_TOP * h;
      const step = ((RULER_BOTTOM - RULER_TOP) * h) / n;
      const lanternH = lantern.current?.offsetHeight ?? 0;
      // The flame, not the lantern's top, sits on the mark, so the slip beside it is level with the light.
      // At the start it is held low enough that the whole lantern is on screen.
      const flameY = Math.max(top + step * st.depth, lanternH * LANTERN_FLAME + 12);
      const lanternY = flameY - lanternH * LANTERN_FLAME;
      if (lantern.current) lantern.current.style.transform = `translate(-50%, ${lanternY}px)`;
      if (rope.current) rope.current.style.transform = `translate(-50%, ${lanternY + 8 - h}px)`;
      const at = `translate(-50%, ${flameY}px) translate(0, -50%)`;
      if (dark.current) dark.current.style.transform = at;
      if (glow.current) glow.current.style.transform = at;
      // The world pans down with the lantern, a little behind it.
      const cH = world.current?.offsetHeight ?? 0;
      if (world.current && cH > 0) {
        const start = top - GROUND_SHARE * cH;
        const range = Math.max(0, start - (h - cH));
        const progress = Math.min(1, Math.max(0, st.depth / (n + 0.45)));
        world.current.style.transform = `translateY(${start - 0.7 * progress * range}px)`;
      }
      if (curtain.current) curtain.current.style.opacity = String(st.dark);
      if (stage.current) stage.current.style.transform = st.jolt > 0 ? `translateY(${st.jolt.toFixed(2)}px)` : '';
      r.dataset.phase = st.phase;
      r.dataset.activeMark = st.activeMark === null ? '' : String(st.activeMark);
      r.dataset.t = String(Math.round(st.t));
      setShown((old) => (old.join() === st.slipsShown.join() ? old : st.slipsShown));
      setActive((old) => (old === st.activeMark ? old : st.activeMark));
    },
    [n],
  );

  // Before the lamp is lit the lantern waits at the ground line.
  useEffect(() => {
    if (timeline) return;
    draw({ t: 0, done: false, phase: 'idle', depth: -0.5, slipsShown: [], activeMark: null, dark: 0, jolt: 0 });
  }, [timeline, draw]);

  // The clock.
  useEffect(() => {
    if (!timeline) return;
    setAnnounce(copy.DIG.announceStart);
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      let t = now - t0;
      const hold = heldMark();
      let held = false;
      if (hold !== null) {
        const limit = holdTime(timeline, hold);
        if (t >= limit) {
          t = limit;
          held = true;
        }
      }
      const st = stateAt(timeline, t);
      draw(st);
      if (root.current) root.current.dataset.held = String(held);
      if (st.done) {
        setAnnounce(timeline.verdict);
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [timeline, draw, finish]);

  const skip = () => {
    if (timeline) {
      draw(stateAt(timeline, skipTo(timeline, 0)));
      setAnnounce(timeline.verdict);
    }
    finish();
  };

  const marks = useMemo(() => timeline?.marks ?? [], [timeline]);
  const style = { ['--n' as string]: n } as React.CSSProperties;

  return (
    <div className="dg" ref={root} role="dialog" aria-modal="true" aria-label={copy.DIG.overlayLabel} tabIndex={-1} data-testid="dig" data-phase="idle" style={style}>
      <div className="dg-stage" ref={stage} aria-hidden="true">
        <div className="dg-world" ref={world}>
          <img className="dg-strata" src={art.strata} alt="" decoding="async" />
          <img className="dg-skyline" src={art.skyline} alt="" decoding="async" />
        </div>
        <div className="dg-col">
          <div className="dg-sway">
            <div className="dg-dark" ref={dark} />
            <div className="dg-glow" ref={glow} />
            <div className="dg-rope" ref={rope} />
            <img className="dg-lantern" ref={lantern} src={art.lantern} alt="" decoding="async" />
          </div>
        </div>
      </div>
      <p className="dg-brand" aria-hidden="true">
        <Mark size={24} />
        <span>Buried</span>
      </p>
      <ol className="dg-ruler" aria-label="Depth" data-testid="dig-ruler">
        {marks.map((m) => (
          <li key={m.index} className="dg-mark" style={{ ['--k' as string]: m.index } as React.CSSProperties} data-testid="dig-mark" data-active={active === m.index}>
            <span className="dg-tick" aria-hidden="true" />
            <span className="dg-mark-label">{m.label}</span>
          </li>
        ))}
      </ol>
      {timeline
        ? timeline.slips.map((s) => {
            // At the layer where the plan letters a use on the lot, the slip carries a small imagined picture (session 055).
            const view = streetViewForSlip(s, views);
            return (
              <p
                key={s.markIndex}
                className="dg-slip"
                style={{ ['--k' as string]: s.markIndex } as React.CSSProperties}
                data-testid="dig-slip"
                data-shown={shown.includes(s.markIndex)}
                data-active={active === s.markIndex}
                data-muted={s.muted}
                data-mark={s.markIndex}
                data-thumb={view !== null}
              >
                {view?.street ? (
                  <span className="dg-thumb" data-label={copy.PICTURES.imagined} data-testid="dig-thumb">
                    <img src={view.street.src} width={THUMB_WIDTH_PX} height={Math.round((THUMB_WIDTH_PX * view.street.heightPx) / view.street.widthPx)} alt={`${streetCaption(view)} ${imaginedLine(view.planName).text}`} decoding="async" />
                  </span>
                ) : null}
                <span className="dg-slip-text">
                  {s.prefix}
                  {s.text}
                </span>
              </p>
            );
          })
        : null}
      <div className="dg-caption">
        {timeline ? (
          <>
            <p className="dg-title" data-testid="dig-caption">
              {timeline.caption}
            </p>
            <p className="dg-address" data-testid="dig-address">
              {timeline.address}
            </p>
          </>
        ) : (
          <p className="dg-title" data-testid="dig-lighting">
            {copy.DIG.lighting}
          </p>
        )}
      </div>
      <button type="button" className="dg-skip" onClick={skip} data-testid="dig-skip">
        {copy.DIG.skip}
      </button>
      <div className="dg-curtain" ref={curtain} aria-hidden="true" />
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="dig-announce">
        {announce}
      </p>
    </div>
  );
}
