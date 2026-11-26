import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { plainYears } from '../evidence';
import type { PolygonalGeometry, PresentLayer } from '../evidence';
import type { LoadedData } from '../data/loadData';
import { lotIdFor } from '../place/placeLink';
import { PRESENT_SOURCES } from '../report/buildReport';
import { ringsOf } from '../report/cropPlan';
import type { Sentence } from '../report/sentence';
import { SetPageTitle } from '../shell/SetPageTitle';
import { CompareView } from './CompareView';
import type { ComparePlan } from './CompareView';
import type { WorldPolygon } from './compare';
import { computeLotCheck } from './computeLotCheck';
import * as copy from './copy';
import type { LotCheck, PlanRow, TodayRow, UseLine } from './lotCheck';
import { LetteringCrop } from './LetteringCrop';
import { ART, Fog, RegistrationCrosses } from './night';
import { InscriptionBlock, Stamp } from './RecordSheet';
import { onLotFeatureIds, viewsOnLot } from './photos';
import { usePictures } from './usePictures';
import type { Pictures } from './usePictures';
import { useLotData, useBuildings } from './useLotData';
import '../styles/lotcheck.css';
import '../styles/night.css';

/**
 * "See this block in 3D" (spec 08 requirement 3.6). Session 051 decision 3: the Unity Player is about 81 MB
 * while the parked walk model is in it, which is over the 30 MB limit of task 9, so the link is not shown.
 * The `/block` and `/find/<slug>` routes still work. The maintainer turns this on after the Player is rebuilt.
 */
export const BLOCK_LINK_SHOWN = false;

type Layer = PresentLayer | undefined;

function polygonsOf(layer: Layer): WorldPolygon[] {
  const out: WorldPolygon[] = [];
  for (const f of layer?.features ?? []) {
    if (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') out.push(ringsOf(f.geometry as PolygonalGeometry));
  }
  return out;
}

/** True once the page's text has been painted: two animation frames after `ready`. */
function useAfterPaint(ready: boolean): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!ready || done) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setDone(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [ready, done]);
  return done;
}

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 719px)').matches : false));
  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(max-width: 719px)');
    const on = () => setPhone(query.matches);
    query.addEventListener('change', on);
    return () => query.removeEventListener('change', on);
  }, []);
  return phone;
}

const text = (sentences: readonly Sentence[]): string => sentences.map((s) => s.text).join(' ');

function UseItem({ line, showCrop }: { line: UseLine; showCrop: boolean }) {
  return (
    <div className="lc-use" data-testid="lc-use" data-matched={line.matched ?? ''}>
      {line.cropRef ? (
        showCrop ? (
          <LetteringCrop crop={line.cropRef} />
        ) : (
          <span className="lc-crop lc-crop-missing" aria-hidden="true" />
        )
      ) : (
        <p className="lc-crop-missing">No crop of the lettering is recorded.</p>
      )}
      <p>
        <span className={line.quotable ? 'lc-lettering' : undefined}>{line.text.text}</span>
        <span className="lc-relation">{line.relationText.text}</span>
        {line.matched ? <span className="lc-match">{copy.countsAsIndustrial(line.matched)}</span> : null}
      </p>
    </div>
  );
}

/** One row of "What the plans show". The rows arrive one after another (`--r` is the row's place in the order). */
function Row({ row, index, showCrop, todayPending }: { row: PlanRow | TodayRow; index: number; showCrop: boolean; todayPending: boolean }) {
  return (
    <li className="lc-row" data-testid="lc-row" style={{ ['--r' as string]: index } as CSSProperties}>
      <span className="lc-year">{row.yearLabel}</span>
      <div className="lc-row-body">
        {row.kind === 'today' && todayPending ? (
          <p className="lc-small">Loading today's outlines.</p>
        ) : row.kind === 'plan' && row.lines.length > 0 ? (
          row.lines.map((line) => <UseItem key={line.featureId} line={line} showCrop={showCrop} />)
        ) : (
          <p>{text(row.sentences)}</p>
        )}
      </div>
    </li>
  );
}

type Prepared = { loaded: LoadedData; lots: Layer; buildings: Layer; addresses: Layer };
type BodyData = Prepared & { pictures: Pictures };

function Body({ check, data, afterPaint }: { check: Extract<LotCheck, { kind: 'check' }>; data: BodyData; afterPaint: boolean }) {
  const phone = usePhone();
  const [copied, setCopied] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const lotGeometry = data.lots?.features.find((f) => f.id === check.lotId)?.geometry as PolygonalGeometry;
  const lot = useMemo(() => ringsOf(lotGeometry), [lotGeometry]);
  const buildings = useMemo(() => polygonsOf(data.buildings), [data.buildings]);
  const lotLines = useMemo(() => polygonsOf(data.lots), [data.lots]);
  // Imagined views are offered only for a lettered use ON the lot (product.md "Pictures" rule 4), from the view model's rows.
  const imagined = useMemo(() => viewsOnLot(onLotFeatureIds(check.rows), data.pictures.views), [check, data.pictures.views]);

  // Where it stood: the outline of each lettered use on the lot, from the evidence, drawn faint on today's side.
  const stood = useMemo(() => {
    const ids = new Set(check.rows.flatMap((r) => (r.kind === 'plan' ? r.lines.filter((l) => l.relation.kind === 'on').map((l) => l.featureId) : [])));
    const out: WorldPolygon[] = [];
    for (const c of data.loaded.evidence) {
      for (const f of c.features) {
        if (ids.has(f.id) && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon')) out.push(ringsOf(f.geometry as PolygonalGeometry));
      }
    }
    return out;
  }, [check, data.loaded.evidence]);

  // Focus lands on the title once the check is on screen.
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, []);

  const plans: ComparePlan[] = check.compare.planSourceIds.flatMap((id) => {
    const tile = data.loaded.tiles.find((t) => t.source === id);
    const source = data.loaded.sources.get(id);
    if (!tile || !source) return [];
    const years = plainYears(source);
    return [{ sourceId: id, planName: `the ${years} plan`, label: `${years} plan`, years, tile: { src: `/data/tiles/${tile.image}`, widthPx: tile.width_px, heightPx: tile.height_px, corners: tile.corners, mapArea: tile.map_area?.coordinates as WorldPolygon | undefined } }];
  });

  const share = async () => {
    try {
      await navigator.clipboard.writeText(check.links.share);
      setCopied(true);
    } catch {
      window.prompt('Copy this link', check.links.share);
    }
  };

  const v = check.verdict;
  return (
    <>
      <header className="lc-result-head">
        <p className="lc-kicker">Lot check</p>
        <h1 className="lc-title" data-testid="lc-title" tabIndex={-1} ref={title}>
          {check.title.text}
        </h1>
      </header>
      <div className="lc-result-grid">
        <div className="lc-main">
          {/* The lantern is fetched once the text is on screen, with the plan: it is not in the 700 KB before the tile (requirement 1.4). */}
          {afterPaint ? <img className="lc-lantern lc-lantern-result" src={ART.lantern} alt="" width={311} height={640} decoding="async" /> : null}
          <div className="lc-record lc-on-paper" data-testid="lc-record">
            <Stamp text={v.tagText} />
            <InscriptionBlock inscription={v.inscription} />
            {v.sentences.map((s, i) => (
              <p key={i} className="lc-sentence" data-testid="lc-sentence">
                {s.text}
              </p>
            ))}
            {v.notClearance ? (
              <p className="lc-not-clearance" data-testid="lc-not-clearance">
                {v.notClearance}
              </p>
            ) : null}
            <section className="lc-section lc-compare-section" aria-labelledby="lc-compare-heading">
              <h2 id="lc-compare-heading" className="visually-hidden">
                The plan and today
              </h2>
              <CompareView
                plans={plans}
                lot={lot}
                buildings={buildings}
                lots={lotLines}
                stood={stood}
                intro
                loadPlan={afterPaint}
                aspect={phone ? 1 : 4 / 3}
                pictures={data.pictures}
                imagined={imagined}
              />
            </section>
          </div>
          <section className="lc-provenance" aria-label={copy.SECTION.provenance} data-testid="lc-provenance">
            <ul>
              {check.provenance.attribution.map((a) => (
                <li key={a}>{a}</li>
              ))}
              {check.provenance.position ? (
                <li className="mono" data-testid="lc-position">
                  {check.provenance.position.text}
                </li>
              ) : null}
              {check.provenance.traced.map((s) => (
                <li key={s.text}>{s.text}</li>
              ))}
              {check.provenance.review.map((s) => (
                <li key={s.text}>{s.text}</li>
              ))}
            </ul>
          </section>
        </div>
        <div className="lc-side">
          <section className="lc-section lc-plans" aria-labelledby="lc-plans-heading">
            <h2 id="lc-plans-heading" className="lc-section-heading">
              {copy.SECTION.plans}
            </h2>
            <ul className="lc-rows">
              {check.rows.map((row, i) => (
                <Row key={row.kind === 'plan' ? row.sourceId : 'today'} row={row} index={i} showCrop={afterPaint} todayPending={data.buildings === undefined} />
              ))}
            </ul>
          </section>
          <section className="lc-section lc-cannot" aria-labelledby="lc-cannot-heading">
            <h2 id="lc-cannot-heading" className="lc-section-heading">
              {copy.SECTION.cannotTell}
            </h2>
            <p>
              <strong>{check.cannotTell.screens.text}</strong>
            </p>
            <p>{check.cannotTell.soil.text}</p>
            <p>
              {check.cannotTell.locate.lead.text} <a href={check.cannotTell.locate.link.url}>{check.cannotTell.locate.link.text}</a>.
            </p>
          </section>
          <section className="lc-section lc-actions" aria-label="Actions">
            <a className="lc-button" href={check.links.print} data-testid="lc-download">
              {copy.ACTIONS.download}
            </a>
            <button type="button" className="lc-linkbutton" onClick={share} data-testid="lc-share">
              {copy.ACTIONS.share}
            </button>
            <a className="lc-linkbutton" href="/#dig" data-testid="lc-another">
              {copy.ACTIONS.another}
            </a>
            {copied ? (
              <p role="status" className="lc-small">
                {copy.ACTIONS.copied}
              </p>
            ) : null}
            {BLOCK_LINK_SHOWN ? (
              <a className="lc-linkbutton" href="/block">
                {copy.ACTIONS.block}
              </a>
            ) : null}
          </section>
        </div>
      </div>
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="lc-verdict-live">
        {text(v.sentences)}
      </p>
    </>
  );
}

/** The Result (spec 08 requirement 3): the record sheet with its inscription and stamp, the compare view, the rows, the limits, the actions. */
export function LotPage() {
  const lotId = useMemo(() => lotIdFor(window.location.pathname, window.location.search), []);
  const raw = useLotData('result');
  const ready = raw.status === 'ready' ? raw.data : null;

  const prepared = useMemo(() => {
    if (!ready) return null;
    return { loaded: ready, lots: ready.presentLayers.get(PRESENT_SOURCES.lots), addresses: ready.presentLayers.get(PRESENT_SOURCES.addresses) };
  }, [ready]);

  // The text is built and painted first; the plan, the lettering crops and today's building outlines follow it.
  const afterPaint = useAfterPaint(prepared !== null);
  const buildingsLayer = useBuildings(afterPaint);
  // The two small picture indexes (a few KB). The pictures themselves are requested by the compare view after the plan tile.
  const pictures = usePictures(true);

  const check: LotCheck | null = useMemo(() => {
    if (!ready || lotId === null) return null;
    return computeLotCheck(ready, lotId, buildingsLayer, window.location.origin);
  }, [ready, lotId, buildingsLayer]);

  const address = check?.kind === 'check' ? (check.title.text === 'This lot' ? null : check.title.text) : null;

  return (
    <main className="lc-result" data-testid="lc-result">
      <SetPageTitle page="lot" address={address} />
      <RegistrationCrosses />
      <Fog />
      {lotId === null ? <NotCovered tag={copy.TAG_TEXT.not_covered} sentence={copy.NOT_RECONSTRUCTED} coverage={prepared ? copy.coverageText(prepared.loaded.registry) : ''} /> : null}
      {lotId !== null && raw.status === 'loading' ? (
        <p className="lc-notice" role="status">
          Loading the records.
        </p>
      ) : null}
      {raw.status === 'error' ? (
        <p className="lc-notice" role="alert">
          The records could not be loaded. {raw.message}
        </p>
      ) : null}
      {check?.kind === 'not_covered' && prepared ? <NotCovered tag={check.tagText} sentence={check.sentence.text} coverage={copy.coverageText(prepared.loaded.registry)} /> : null}
      {check?.kind === 'failed' ? (
        <p className="lc-notice" role="alert">
          {check.text}
        </p>
      ) : null}
      {check?.kind === 'check' && prepared ? (
        <Body check={check} data={{ ...prepared, buildings: buildingsLayer, pictures }} afterPaint={afterPaint} />
      ) : null}
    </main>
  );
}

/** A lot outside the coverage area: "NOT DUG YET", the spade, the sentence and the coverage line. */
function NotCovered({ tag, sentence, coverage }: { tag: string; sentence: string; coverage: string }) {
  return (
    <section className="lc-result-head lc-not-covered" data-testid="lc-not-covered">
      <p className="lc-kicker">Lot check</p>
      <div className="lc-record lc-on-paper lc-record-solo">
        <Stamp text={tag} />
        <InscriptionBlock inscription={{ lead: copy.INSCRIPTION.notDug, name: null, foot: null }} />
        <p className="lc-sentence">{sentence}</p>
        <p className="lc-small" data-testid="lc-coverage">
          {coverage}
        </p>
      </div>
    </section>
  );
}
