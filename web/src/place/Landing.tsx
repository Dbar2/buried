import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Explorer } from '../explorer/Explorer';
import type { SceneState } from '../explorer/Explorer';
import { PRESENT_SOURCES } from '../report/buildReport';
import { exampleAddresses } from '../report/examples';
import { coverageLine } from '../report/placeText';
import { lotForPoint, searchAddresses } from '../report/search';
import { useReportData } from '../report/useReportData';
import { Mark } from '../shell/Mark';
import { SetPageTitle } from '../shell/SetPageTitle';
import { TAGLINE } from '../shell/tagline';
import { placeLink } from './placeLink';
import './place.css';

export { TAGLINE };

/**
 * The address search (`/place` without a lot; the old landing, moved here by spec 06 W2): the wordmark, one field, "What was here?", and three real example addresses
 * chosen from the data (lots with a published outline within 15 m). Nothing else. A search result
 * goes to that lot's place page. Everything here is read from the site's own files: the page makes
 * no request to another origin.
 *
 * First load (session 031): the page paints on a still dusk backdrop drawn in CSS from the palette.
 * The scene behind it (the Player and its records) starts after that first paint and after the
 * address list has loaded, so that the field and the examples are not waiting on 8 MB of Player.
 * When the scene reports a first frame it cross-fades in; with `prefers-reduced-motion` it appears
 * without the fade. The core-sample mark shows while it loads and goes when the scene is in, or when
 * there will be no scene (no WebGL 2, or the build did not start), and the backdrop stays.
 */
export function Landing() {
  const loaded = useReportData(false);
  const [query, setQuery] = useState('');
  const [noLot, setNoLot] = useState(false);
  const [painted, setPainted] = useState(false);
  const [scene, setScene] = useState<SceneState | 'loading'>('loading');

  // One animation frame, then a timer: the browser has painted the first frame by the time it runs.
  useEffect(() => {
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setPainted(true), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  const startScene = painted && loaded.status !== 'loading';

  const layers = loaded.status === 'ready' ? loaded.data.presentLayers : null;
  const addresses = layers?.get(PRESENT_SOURCES.addresses);
  const lots = layers?.get(PRESENT_SOURCES.lots);
  const examples = useMemo(() => (loaded.status === 'ready' ? exampleAddresses(addresses, lots, loaded.data.evidence) : []), [loaded, addresses, lots]);
  const hits = useMemo(() => searchAddresses(addresses, query), [addresses, query]);
  const coverage = useMemo(() => (loaded.status === 'ready' ? coverageLine(loaded.data.registry, loaded.data.tiles) : []), [loaded]);

  const open = (point: [number, number]) => {
    const id = lotForPoint(lots, point);
    if (id === null) {
      setNoLot(true);
      return;
    }
    window.location.assign(placeLink(id));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const first = hits[0];
    if (first) open(first.point);
    else if (loaded.status === 'ready' && query.trim().length >= 2) setNoLot(true);
  };

  const showMark = scene === 'loading' && loaded.status !== 'error';

  return (
    <div className="landing" data-testid="landing" data-scene={scene === 'loading' && !startScene ? 'waiting' : scene}>
      <SetPageTitle page="landing" />
      <div className={scene === 'ready' ? 'landing-scene landing-scene--shown' : 'landing-scene'} aria-hidden="true" data-testid="landing-scene">
        {startScene && <Explorer variant="backdrop" onScene={setScene} />}
      </div>
      <main className="landing-main">
        <h1 className="landing-wordmark">
          <Mark size={44} />
          <span>Buried</span>
        </h1>
        <p className="landing-tagline" data-testid="landing-tagline">
          {TAGLINE}
        </p>
        <form className="landing-search" role="search" onSubmit={submit}>
          <label htmlFor="landing-address" className="visually-hidden">
            What was here?
          </label>
          <input
            id="landing-address"
            type="search"
            autoComplete="off"
            autoFocus
            placeholder="What was here?"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setNoLot(false);
            }}
            aria-busy={loaded.status === 'loading'}
            data-testid="landing-address"
          />
          {loaded.status === 'loading' && query.trim().length >= 2 && <p role="status">Loading the address list.</p>}
          {hits.length > 0 && (
            <ul className="landing-list" aria-label="Matching addresses" data-testid="landing-hits">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => open(h.point)}>
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && loaded.status === 'ready' && hits.length === 0 && <p role="status">No address in the area Buried covers matches that.</p>}
          {noLot && hits.length > 0 && <p role="status">Not reconstructed yet.</p>}
          {loaded.status === 'error' && <p role="alert">The records could not be loaded.</p>}
        </form>
        {examples.length > 0 && query === '' && (
          <div className="landing-try">
            <p id="landing-try-label">Try</p>
            <ul className="landing-list landing-examples" aria-labelledby="landing-try-label" data-testid="landing-examples">
              {examples.map((e) => (
                <li key={e.lotId}>
                  <a href={placeLink(e.lotId)}>{e.address}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
        {coverage.length > 0 && (
          <p className="landing-coverage" data-testid="landing-coverage">
            {coverage.map((s) => s.text).join(' ')}
          </p>
        )}
      </main>
      {showMark && (
        <p className="landing-loading" role="status" data-testid="landing-loading">
          <Mark size={20} className="landing-loading-mark" />
          <span>Loading the scene.</span>
        </p>
      )}
    </div>
  );
}
