import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { makeSheetTransform, ringsToPath, worldToPixel } from '../block/sheetTransform';
import type { TileCorners } from '../block/sheetTransform';
import { plainYears, sheetNumber } from '../evidence';
import { lotLink } from '../place/placeLink';
import { PRESENT_SOURCES } from '../report/buildReport';
import { ringsOf } from '../report/cropPlan';
import { listOf } from '../report/sentence';
import { lotForPoint } from '../report/search';
import { AddressCombobox } from './AddressCombobox';
import { computeLotCheck } from './computeLotCheck';
import * as copy from './copy';
import { DigOverlay } from './DigOverlay';
import { industrialLots, landingFact, recordedCaption } from './landing';
import { ART, Fog } from './night';
import { addressBook, defaultSuggestions, randomRecorded } from './suggest';
import type { Suggestion } from './suggest';
import { preloadImage, useIdle } from './useIdle';
import { useLotData } from './useLotData';
import '../styles/lotcheck.css';
import '../styles/night.css';

type PlanPicture = { source: string; image: string; width_px: number; height_px: number; corners: TileCorners };

type PlanLot = { lotId: string; address: string; d: string; cx: number; cy: number; label: string };

function usePlanPicture(): PlanPicture | null {
  const [plan, setPlan] = useState<PlanPicture | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/lotcheck/landing-plan.json')
      .then((r) => (r.ok ? (r.json() as Promise<PlanPicture>) : null))
      .then((p) => {
        if (!cancelled && p) setPlan(p);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return plan;
}

/** The Landing (spec 08 requirement 2): the question, the address field, the computed fact and the lit plan. */
export function LandingPage() {
  const loaded = useLotData('landing');
  const picture = usePlanPicture();
  const idle = useIdle();
  const [message, setMessage] = useState<string | null>(null);
  const [dig, setDig] = useState<string | null>(null);
  const [hover, setHover] = useState<{ lotId: string; x: number; y: number } | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const pool = useRef<HTMLDivElement>(null);

  const data = loaded.status === 'ready' ? loaded.data : null;
  const addresses = data?.presentLayers.get(PRESENT_SOURCES.addresses);
  const lots = data?.presentLayers.get(PRESENT_SOURCES.lots);

  const fact = useMemo(() => (data ? landingFact(data.evidence, addresses, data.registry) : null), [data, addresses]);
  const recordedLots = useMemo(() => (data ? industrialLots(data.evidence, lots, addresses, data.registry) : []), [data, lots, addresses]);
  const book = useMemo(() => (data ? addressBook(addresses, recordedLots) : null), [data, addresses, recordedLots]);

  // The earth cross-section of the dig is fetched once the page is quiet, so it is not in the first load.
  useEffect(() => {
    if (idle) preloadImage(ART.strata);
  }, [idle]);

  // "Dig another address" lands here with #dig: the field has focus.
  useEffect(() => {
    if (window.location.hash === '#dig') field.current?.focus();
  }, []);

  const open = (choice: Suggestion) => {
    const id = choice.lotId ?? lotForPoint(lots, choice.point);
    if (id === null) {
      setMessage(copy.NOT_RECONSTRUCTED);
      return;
    }
    // Under reduced motion there is no dig: the Result opens at once.
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) window.location.assign(lotLink(id));
    else setDig(id);
  };

  // The dig is built from the same function the Result uses, with the records the Landing already holds.
  const buildDig = useCallback(() => (data && dig ? computeLotCheck(data, dig, undefined, window.location.origin) : null), [data, dig]);
  const finishDig = useCallback(() => {
    if (dig) window.location.assign(lotLink(dig));
  }, [dig]);

  // Back from the Result by the browser's button: the page comes back from the cache with no dig playing.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent) => {
      if (event.persisted) setDig(null);
    };
    window.addEventListener('pageshow', onShow);
    return () => window.removeEventListener('pageshow', onShow);
  }, []);

  const random = () => {
    const pick = book ? randomRecorded(book, Math.random) : null;
    if (pick) open(pick);
  };

  const transform = useMemo(() => (picture ? makeSheetTransform(picture.corners, picture.width_px, picture.height_px) : null), [picture]);

  // The outline of the counted yard, from the evidence, through the picture's own transform.
  const outline = useMemo(() => {
    if (!picture || !transform || !fact) return null;
    const areas = fact.areas.filter((a) => a.sourceId === picture.source);
    if (areas.length === 0) return null;
    return { d: ringsToPath(transform, areas.flatMap((a) => ringsOf(a.geometry))), label: areas[0]?.head ?? '' };
  }, [picture, transform, fact]);

  // The lots with something recorded that fall on the picture, left to right, each with the lettering of its lead use.
  const planLots: PlanLot[] = useMemo(() => {
    if (!picture || !transform || !lots || !book || !data) return [];
    const geometry = new Map(lots.features.map((f) => [f.id, f.geometry]));
    const first = new Map(defaultSuggestions(book, Number.MAX_SAFE_INTEGER).map((s) => [s.lotId, s.text]));
    const out: PlanLot[] = [];
    for (const t of recordedLots) {
      const g = geometry.get(t.lotId);
      const address = first.get(t.lotId);
      if (!g || !address || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) continue;
      const rings = ringsOf(g);
      const pts = rings.flat().map((p) => worldToPixel(transform, p));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      if (x1 < 0 || y1 < 0 || x0 > picture.width_px || y0 > picture.height_px) continue;
      const years = [...new Set(t.sourceIds.flatMap((id) => (data.sources.get(id) ? [plainYears(data.sources.get(id)!)] : [])))];
      out.push({ lotId: t.lotId, address, d: ringsToPath(transform, rings), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, label: `${t.head}${years.length > 0 ? `, ${listOf(years.map((y) => ({ text: y }))).text}` : ''}` });
    }
    return out.sort((a, b) => a.cx - b.cx || a.cy - b.cy || (a.lotId < b.lotId ? -1 : 1));
  }, [picture, transform, lots, book, data, recordedLots]);

  const caption = planLots.length > 0 ? recordedCaption(recordedLots.length, planLots.length).text : null;

  const show = (lot: PlanLot) => {
    const m = svg.current?.getScreenCTM();
    const b = box.current?.getBoundingClientRect();
    if (!m || !b) return;
    const p = new DOMPoint(lot.cx, lot.cy).matrixTransform(m);
    setHover({ lotId: lot.lotId, x: p.x - b.left, y: p.y - b.top });
  };

  // A soft pool of lantern light follows the pointer over the map. Transform only.
  const frame = useRef(0);
  const follow = (event: PointerEvent) => {
    const b = box.current?.getBoundingClientRect();
    const el = pool.current;
    if (!b || !el) return;
    const [x, y] = [event.clientX - b.left, event.clientY - b.top];
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      el.style.opacity = '1';
    });
  };

  const shownLot = hover ? planLots.find((l) => l.lotId === hover.lotId) : undefined;
  const sheetOf = picture ? sheetNumber(picture.source) : '';

  return (
    <>
    <main className="lc-landing" data-testid="lc-landing" aria-hidden={dig !== null ? true : undefined} {...(dig !== null ? ({ inert: '' } as object) : {})}>
      {idle ? <img className="lc-skyline" src={ART.skyline} alt="" width={1800} height={600} decoding="async" /> : null}
      <Fog />
      <div className="lc-landing-text">
        <p className="lc-kicker">{copy.LANDING.kicker}</p>
        <h1 className="lc-headline">{copy.LANDING.headline}</h1>
        <p className="lc-lede">{copy.LANDING.line}</p>
        <AddressCombobox ref={field} book={book} onChoose={open} message={message} onEdit={() => setMessage(null)} />
        <button type="button" className="lc-linkbutton lc-random" onClick={random} data-testid="lc-random" hidden={!book || defaultSuggestions(book, 1).length === 0}>
          {copy.LANDING.random}
        </button>
        {fact ? (
          <p className="lc-fact" data-testid="lc-fact">
            {fact.sentence.text}
          </p>
        ) : null}
      </div>
      <figure className="lc-map" data-testid="lc-plan">
        <div className="lc-paper">
          <div className="lc-plan-box" ref={box} onPointerMove={follow} onPointerLeave={() => pool.current && (pool.current.style.opacity = '0')}>
            {picture ? (
              <svg
                ref={svg}
                className="lc-plan-svg"
                viewBox={`0 0 ${picture.width_px} ${picture.height_px}`}
                role="group"
                aria-label={`The ${data?.sources.get(picture.source) ? plainYears(data.sources.get(picture.source)!) : ''} plan, sheet ${sheetOf}. ${caption ?? ''}`}
              >
                <image href={`/lotcheck/${picture.image}`} width={picture.width_px} height={picture.height_px} />
                {outline ? (
                  <>
                    <path d={outline.d} className="lc-outline-casing" fillRule="evenodd" />
                    <path d={outline.d} className="lc-outline" fillRule="evenodd" data-testid="lc-yard" />
                  </>
                ) : null}
                {planLots.map((lot, i) => (
                  <g key={lot.lotId} className="lc-lot-in" style={{ ['--i' as string]: i }}>
                    <a
                      href={lotLink(lot.lotId)}
                      className="lc-lot"
                      aria-label={`${lot.address}: ${lot.label}. Dig here.`}
                      data-testid="lc-lot"
                      data-lot={lot.lotId}
                      data-active={hover?.lotId === lot.lotId}
                      onClick={(e) => {
                        e.preventDefault();
                        open({ id: lot.lotId, text: lot.address, point: [0, 0], recorded: true, lotId: lot.lotId });
                      }}
                      onPointerEnter={() => show(lot)}
                      onFocus={() => show(lot)}
                      onPointerLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                    >
                      <path d={lot.d} className="lc-lot-fill" fillRule="evenodd" />
                      <path d={lot.d} className="lc-lot-casing" fillRule="evenodd" />
                      <path d={lot.d} className="lc-lot-line" fillRule="evenodd" />
                    </a>
                  </g>
                ))}
              </svg>
            ) : (
              <div className="lc-plan-empty" aria-hidden="true" />
            )}
            <div className="lc-plan-night" aria-hidden="true" />
            <div className="lc-plan-dim" aria-hidden="true" />
            <div className="lc-light" aria-hidden="true" />
            <div className="lc-pool" ref={pool} aria-hidden="true" />
            {hover && shownLot ? (
              <p className="lc-lot-tag" style={{ left: hover.x, top: hover.y }} data-testid="lc-lot-tag" role="presentation">
                {shownLot.label}
              </p>
            ) : null}
            {picture ? <p className="lc-sheet-no mono">Sheet {sheetOf}</p> : null}
          </div>
        </div>
        <div className="lc-lantern-pool" aria-hidden="true" />
        <img className="lc-lantern lc-lantern-landing" src={ART.lantern} alt="" width={311} height={640} decoding="async" />
        <figcaption className="lc-map-caption" data-testid="lc-caption">
          {caption}
        </figcaption>
      </figure>
      {idle ? <img className="lc-spade" src={ART.spade} alt="" width={400} height={800} decoding="async" /> : null}
      <p className="lc-coverage" data-testid="lc-coverage">
        {data ? copy.coverageText(data.registry) : ''}
      </p>
    </main>
      {dig !== null && data ? <DigOverlay build={buildDig} onFinish={finishDig} art={ART} /> : null}
    </>
  );
}
