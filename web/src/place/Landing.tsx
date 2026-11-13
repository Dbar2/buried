import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Explorer } from '../explorer/Explorer';
import { PRESENT_SOURCES } from '../report/buildReport';
import { exampleAddresses } from '../report/examples';
import { coverageLine } from '../report/placeText';
import { lotForPoint, searchAddresses } from '../report/search';
import { useReportData } from '../report/useReportData';
import { Mark } from '../shell/Mark';
import { placeLink } from './placeLink';
import './place.css';

/** The tagline from design.md "Identity". */
export const TAGLINE = 'Forgotten maps, rebuilt with proof.';

/**
 * The landing (`/`): the dusk scene full-bleed behind, the wordmark, one field, "What was here?",
 * and three real example addresses chosen from the data (lots with a published outline within
 * 15 m). Nothing else. A search result goes to that lot's place page. Everything here is read from
 * the site's own files: the page makes no request to another origin.
 */
export function Landing() {
  const loaded = useReportData(false);
  const [query, setQuery] = useState('');
  const [noLot, setNoLot] = useState(false);

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
    else if (query.trim().length >= 2) setNoLot(true);
  };

  return (
    <div className="landing" data-testid="landing">
      <Explorer variant="backdrop" />
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
            disabled={loaded.status === 'loading'}
            data-testid="landing-address"
          />
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
    </div>
  );
}
