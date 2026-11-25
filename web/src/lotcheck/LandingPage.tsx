import { useEffect, useMemo, useRef, useState } from 'react';
import { makeSheetTransform, ringsToPath, worldToPixel } from '../block/sheetTransform';
import type { TileCorners } from '../block/sheetTransform';
import { plainYears, sheetNumber } from '../evidence';
import { lotLink } from '../place/placeLink';
import { PRESENT_SOURCES } from '../report/buildReport';
import { ringsOf } from '../report/cropPlan';
import { lotForPoint } from '../report/search';
import { AddressCombobox } from './AddressCombobox';
import * as copy from './copy';
import { industrialLots, landingFact } from './landing';
import { addressBook, defaultSuggestions, randomRecorded } from './suggest';
import type { Suggestion } from './suggest';
import { useLotData } from './useLotData';
import '../styles/lotcheck.css';

type PlanPicture = { source: string; image: string; width_px: number; height_px: number; corners: TileCorners };

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

export function RegistrationCrosses() {
  return (
    <>
      {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
        <span key={corner} className={`lc-cross lc-cross-${corner}`} aria-hidden="true" />
      ))}
    </>
  );
}

/** The Landing (spec 08 requirement 2): the question, the address field, the computed fact and the plan. */
export function LandingPage() {
  const loaded = useLotData('landing');
  const picture = usePlanPicture();
  const [message, setMessage] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  const data = loaded.status === 'ready' ? loaded.data : null;
  const addresses = data?.presentLayers.get(PRESENT_SOURCES.addresses);
  const lots = data?.presentLayers.get(PRESENT_SOURCES.lots);

  const fact = useMemo(() => (data ? landingFact(data.evidence, addresses, data.registry) : null), [data, addresses]);
  const recordedLots = useMemo(() => (data ? industrialLots(data.evidence, lots, addresses, data.registry) : []), [data, lots, addresses]);
  const book = useMemo(() => (data ? addressBook(addresses, recordedLots) : null), [data, addresses, recordedLots]);

  const open = (choice: Suggestion) => {
    const id = choice.lotId ?? lotForPoint(lots, choice.point);
    if (id === null) setMessage(copy.NOT_RECONSTRUCTED);
    else window.location.assign(lotLink(id));
  };

  const random = () => {
    const pick = book ? randomRecorded(book, Math.random) : null;
    if (pick) open(pick);
  };

  // The outline of the counted yard, from the evidence, through the picture's own transform.
  const outline = useMemo(() => {
    if (!picture || !fact) return null;
    const t = makeSheetTransform(picture.corners, picture.width_px, picture.height_px);
    const areas = fact.areas.filter((a) => a.sourceId === picture.source);
    if (areas.length === 0) return null;
    const rings = areas.flatMap((a) => ringsOf(a.geometry));
    const pts = rings.flat().map((p) => worldToPixel(t, p));
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const source = data?.sources.get(picture.source);
    return { d: ringsToPath(t, rings), cx, cy, label: `${(areas[0] as (typeof areas)[number]).head}, ${source ? plainYears(source) : ''}`.replace(/, $/, '') };
  }, [picture, fact, data]);

  return (
    <main className="lc-landing">
      <RegistrationCrosses />
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
      <figure className="lc-plate" data-testid="lc-plan">
        {picture ? (
          <div className="lc-plate-frame">
            <svg viewBox={`0 0 ${picture.width_px} ${picture.height_px}`} role="img" aria-label={outline ? `The ${data?.sources.get(picture.source) ? plainYears(data.sources.get(picture.source)!) : ''} plan with the yard outlined: ${outline.label}.` : 'The plan'}>
              <image href={`/lotcheck/${picture.image}`} width={picture.width_px} height={picture.height_px} />
              {outline ? (
                <>
                  <path d={outline.d} className="lc-outline-casing" fillRule="evenodd" />
                  <path d={outline.d} className="lc-outline" fillRule="evenodd" />
                  <line className="lc-leader" x1={outline.cx} y1={outline.cy} x2={picture.width_px * 0.8} y2={picture.height_px * 0.12} />
                  <circle className="lc-leader-dot" cx={outline.cx} cy={outline.cy} r={5} />
                </>
              ) : null}
            </svg>
            {outline ? <p className="lc-plate-label mono">{outline.label}</p> : null}
            <p className="lc-sheet mono">Sheet {sheetNumber(picture.source)}</p>
          </div>
        ) : (
          <div className="lc-plate-frame lc-plate-empty" aria-hidden="true" />
        )}
      </figure>
      <p className="lc-coverage" data-testid="lc-coverage">
        {data ? copy.coverageText(data.registry) : ''}
      </p>
    </main>
  );
}
