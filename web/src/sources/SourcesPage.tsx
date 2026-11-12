import { useEffect, useState } from 'react';
import { browserFetchText } from '../data/loadData';
import { parseSourceRegistry } from '../evidence';
import type { Source } from '../evidence';

/** Years as a source states them: "1911 to 1914", "1935", or "refreshed 2025 to 2026" for a dataset. */
export function yearsText(source: Pick<Source, 'year_from' | 'year_to'>): string {
  if (source.year_from === null) return `up to ${source.year_to}`;
  return source.year_from === source.year_to ? `${source.year_from}` : `${source.year_from} to ${source.year_to}`;
}

/** Sorted by id; sources whose rights are not confirmed are listed but marked as not shown. */
export function sortedSources(sources: readonly Source[]): Source[] {
  return [...sources].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; sources: Source[] };

/**
 * /sources: every registered source with its id, title, years, URL, licence note, attribution line
 * and the date its rights were checked (spec 03 requirement 21.3). Built from data/sources.json.
 */
export function SourcesPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    browserFetchText('sources.json')
      .then((text) => parseSourceRegistry(text, 'data/sources.json'))
      .then((registry) => {
        if (!cancelled) setState({ status: 'ready', sources: sortedSources(registry.sources) });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="sources">
      <p>
        <a href="/">Back to the Explorer</a>
      </p>
      <h1>Sources</h1>
      {state.status === 'loading' && <p>Loading the source list.</p>}
      {state.status === 'error' && <p>The source list could not be loaded. {state.message}</p>}
      {state.status === 'ready' &&
        state.sources.map((source) => (
          <article key={source.id} data-testid={`source-${source.id}`}>
            <h2 className="mono">{source.id}</h2>
            <p>{source.title}</p>
            {source.attribution_status !== 'confirmed' && <p className="muted">Not shown in the app yet.</p>}
            <dl>
              <dt>Years</dt>
              <dd className="mono">{yearsText(source)}</dd>
              <dt>Address</dt>
              <dd>
                <a href={source.url}>{source.url}</a>
              </dd>
              <dt>Licence</dt>
              <dd>{source.licence_note}</dd>
              <dt>Attribution</dt>
              <dd>{source.attribution_line}</dd>
              <dt>Rights checked</dt>
              <dd className="mono">{source.rights_checked_on ?? 'not yet'}</dd>
            </dl>
          </article>
        ))}
    </main>
  );
}
