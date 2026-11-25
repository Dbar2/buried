import { useEffect, useMemo, useState } from 'react';
import { plainYears } from '../evidence';
import type { PolygonalGeometry, PresentLayer } from '../evidence';
import type { LoadedData } from '../data/loadData';
import { lotIdFor } from '../place/placeLink';
import { buildReport, PRESENT_SOURCES, withMappedAreas } from '../report/buildReport';
import { ringsOf } from '../report/cropPlan';
import type { Sentence } from '../report/sentence';
import { SetPageTitle } from '../shell/SetPageTitle';
import { CompareView } from './CompareView';
import type { ComparePlan } from './CompareView';
import type { WorldPolygon } from './compare';
import * as copy from './copy';
import { buildLotCheck } from './lotCheck';
import type { LotCheck, PlanRow, TodayRow, UseLine } from './lotCheck';
import { LetteringCrop } from './LetteringCrop';
import { RegistrationCrosses } from './LandingPage';
import { useLotData, useBuildings } from './useLotData';
import '../styles/lotcheck.css';

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

function Row({ row, showCrop, todayPending }: { row: PlanRow | TodayRow; showCrop: boolean; todayPending: boolean }) {
  return (
    <li className="lc-row" data-testid="lc-row">
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

function Body({ check, data, afterPaint }: { check: Extract<LotCheck, { kind: 'check' }>; data: Prepared; afterPaint: boolean }) {
  const phone = usePhone();
  const [copied, setCopied] = useState(false);
  const lotGeometry = data.lots?.features.find((f) => f.id === check.lotId)?.geometry as PolygonalGeometry;
  const lot = useMemo(() => ringsOf(lotGeometry), [lotGeometry]);
  const buildings = useMemo(() => polygonsOf(data.buildings), [data.buildings]);
  const lotLines = useMemo(() => polygonsOf(data.lots), [data.lots]);

  const plans: ComparePlan[] = check.compare.planSourceIds.flatMap((id) => {
    const tile = data.loaded.tiles.find((t) => t.source === id);
    const source = data.loaded.sources.get(id);
    if (!tile || !source) return [];
    const years = plainYears(source);
    return [{ sourceId: id, planName: `the ${years} plan`, label: `${years} plan`, tile: { src: `/data/tiles/${tile.image}`, widthPx: tile.width_px, heightPx: tile.height_px, corners: tile.corners, mapArea: tile.map_area?.coordinates as WorldPolygon | undefined } }];
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
        <div className="lc-title-row">
          <h1 className="lc-title" data-testid="lc-title">
            {check.title.text}
          </h1>
          <p className="lc-tag" data-testid="lc-tag">
            {v.tagText}
          </p>
        </div>
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
      </header>
      <div className="lc-result-grid">
        <div className="lc-main">
          <section className="lc-section lc-compare-section" aria-labelledby="lc-compare-heading">
            <h2 id="lc-compare-heading" className="visually-hidden">
              The plan and today
            </h2>
            <CompareView plans={plans} lot={lot} buildings={buildings} lots={lotLines} loadPlan={afterPaint} aspect={phone ? 1 : 4 / 3} />
            <p className="lc-compare-note">The plan is the untouched scan. The outline marks this lot on both sides.</p>
          </section>
        </div>
        <div className="lc-side">
          <section className="lc-section" aria-labelledby="lc-plans-heading">
            <h2 id="lc-plans-heading" className="lc-section-heading">
              {copy.SECTION.plans}
            </h2>
            <ul className="lc-rows">
              {check.rows.map((row) => (
                <Row key={row.kind === 'plan' ? row.sourceId : 'today'} row={row} showCrop={afterPaint} todayPending={data.buildings === undefined} />
              ))}
            </ul>
          </section>
          <section className="lc-section" aria-labelledby="lc-cannot-heading">
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
      <footer className="lc-provenance" aria-label={copy.SECTION.provenance} data-testid="lc-provenance">
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
      </footer>
    </>
  );
}

/** The Result (spec 08 requirement 3): the tag and the sentence, the compare view, the rows, the limits, the actions. */
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

  const check: LotCheck | null = useMemo(() => {
    if (!prepared || lotId === null) return null;
    const { loaded, lots, addresses } = prepared;
    const buildings = buildingsLayer;
    const model = buildReport({
      lotId,
      eraId: null,
      canon: { collections: loaded.evidence, registry: loaded.registry, project: loaded.project, sidecars: loaded.tiles, lots, addresses, buildings },
      workspace: null,
      dataVersion: '',
      linkDataVersion: null,
      siteOrigin: window.location.origin,
    });
    const geometry = lots?.features.find((f) => f.id === lotId)?.geometry;
    return buildLotCheck(model, {
      lot: geometry as PolygonalGeometry,
      collections: withMappedAreas(loaded.evidence, loaded.tiles),
      tiles: loaded.tiles,
      sources: loaded.sources,
      siteOrigin: window.location.origin,
    });
  }, [prepared, lotId, buildingsLayer]);

  const address = check?.kind === 'check' ? (check.title.text === 'This lot' ? null : check.title.text) : null;

  return (
    <main className="lc-result" data-testid="lc-result">
      <SetPageTitle page="lot" address={address} />
      <RegistrationCrosses />
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
        <Body check={check} data={{ ...prepared, buildings: buildingsLayer }} afterPaint={afterPaint} />
      ) : null}
    </main>
  );
}

function NotCovered({ tag, sentence, coverage }: { tag: string; sentence: string; coverage: string }) {
  return (
    <header className="lc-result-head" data-testid="lc-not-covered">
      <p className="lc-kicker">Lot check</p>
      <div className="lc-title-row">
        <p className="lc-tag" data-testid="lc-tag">
          {tag}
        </p>
      </div>
      <p className="lc-sentence">{sentence}</p>
      <p className="lc-small" data-testid="lc-coverage">
        {coverage}
      </p>
    </header>
  );
}
