import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { browserFetchText, parseIndex } from '../data/loadData';
import type { FetchText } from '../data/loadData';
import { parseContract, parseSourceRegistry, sourceYearsText } from '../evidence';
import type { Source, TileSidecar } from '../evidence';
import { streetCaption } from '../lotcheck/photos';
import type { ImaginedView, Photo } from '../lotcheck/photos';
import { loadImagined, loadPhotos } from '../lotcheck/usePictures';
import './sources.css';

/** Years as a source states them: "1911 to 1914", "1935", or "up to 2026" for a dataset. */
export function yearsText(source: Pick<Source, 'year_from' | 'year_to'>): string {
  if (source.year_from === null) return `up to ${source.year_to}`;
  return source.year_from === source.year_to ? `${source.year_from}` : `${source.year_from} to ${source.year_to}`;
}

/** Sorted by id; sources whose rights are not confirmed are listed but marked as not shown. */
export function sortedSources(sources: readonly Source[]): Source[] {
  return [...sources].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Plans and photographs carry a picture of the original; the City datasets are layers. */
export const isArchival = (source: Pick<Source, 'type'>): boolean => source.type !== 'present_day_reference';

export type SourcesData = {
  sources: Source[];
  sidecars: Map<string, TileSidecar>;
  /** The aerial photographs of the compare view (session 055), from `lotcheck/aerial/aerial.json`. Not registry sources. */
  photos?: Photo[];
  /** The imagined views, from `lotcheck/imagined/imagined.json`. */
  imagined?: { views: ImaginedView[]; how: string };
};

/** Reads the registry and the tile sidecars from the site's own `data/` files. Nothing else. */
export async function loadSourcesData(fetchText: FetchText): Promise<SourcesData> {
  const registry = parseSourceRegistry(await fetchText('sources.json'), 'data/sources.json');
  const sidecars = new Map<string, TileSidecar>();
  try {
    const index = parseIndex(await fetchText('index.json'));
    const served = new Set(index.tiles);
    for (const name of index.tiles.filter((n) => n.endsWith('.json'))) {
      try {
        const tile = parseContract('tileSidecar', await fetchText(`tiles/${name}`), `tiles/${name}`);
        if (tile.full_image !== undefined && served.has(tile.full_image)) sidecars.set(tile.source, tile);
      } catch {
        // A sidecar that does not pass is left out; the source is listed without its photograph.
      }
    }
  } catch {
    // No index: the sources are listed without photographs.
  }
  return { sources: sortedSources(registry.sources), sidecars };
}

/** "plate 229" from a plate's id, for alt text. */
function plateNumber(source: Pick<Source, 'id'>): string | null {
  const m = /^fip_v\d+_\d{4}_(\d+)$/.exec(source.id);
  return m ? `plate ${m[1]}` : null;
}

export const fullImageUrl = (tile: Pick<TileSidecar, 'full_image'>): string => `/data/tiles/${tile.full_image}`;

export function fullImageAlt(source: Pick<Source, 'id' | 'title'>): string {
  const plate = plateNumber(source);
  return `The whole photograph of ${plate ?? source.title}, archive labels and ruler included.`;
}

/** The typefaces the site serves from its own origin, and their licence. */
export const TYPEFACES_LINE =
  'Set in Libre Baskerville, Source Sans 3 and IBM Plex Mono, each served from this site under the SIL Open Font License 1.1.';

/** The night art on the lot check pages (session 053). Decoration, not evidence. */
export const ILLUSTRATIONS_LINE =
  'The lantern, the earth cross-section, the paper, the skyline and the spade are illustrations made with an image model. They are decoration, not evidence.';

/** Aerial photographs in the compare view (session 055). */
export const AERIAL_INTRO =
  'Two aerial photographs of the block, from the City of Toronto, sit beside the plans in the compare view. They are for looking, not for measuring, and no finding on this site is taken from them.';
export const HISTORIC_CAVEAT =
  'The City says its historic aerial photographs were not orthorectified, that their positions vary across the city, and that they are provided as is. The lot outline over this photograph carries the note "The 1939 photograph is placed approximately."';

/** Imagined views (session 055). The sentence the maintainer set for them. */
export const IMAGINED_INTRO =
  'Made with an image model from the plans: decoration and illustration, not evidence. Each picture has the word IMAGINED set into a corner. No finding, tag, sentence or inscription on this site is taken from one, and one is shown only for a use that the plans letter on the lot.';

/** A plain-language crop of a photograph around the showcase coal and wood yard, as CSS for an `<img>` with `object-fit: none`. */
export function cropStyle(photo: Pick<Photo, 'bounds' | 'widthPx' | 'heightPx'>, centre: readonly [number, number], box: { width: number; height: number }): CSSProperties {
  const [minE, minN, maxE, maxN] = photo.bounds;
  const x = ((centre[0] - minE) / (maxE - minE)) * photo.widthPx;
  const y = ((maxN - centre[1]) / (maxN - minN)) * photo.heightPx;
  const left = Math.min(Math.max(x - box.width / 2, 0), Math.max(photo.widthPx - box.width, 0));
  const top = Math.min(Math.max(y - box.height / 2, 0), Math.max(photo.heightPx - box.height, 0));
  return { width: box.width, height: box.height, objectFit: 'none', objectPosition: `${-Math.round(left)}px ${-Math.round(top)}px` };
}

/** The middle of the coal and wood yard's imagined top-down picture, in EPSG:26917: where the Sources page's small crops are cut. */
const CROP_CENTRE: readonly [number, number] = [632410.5, 4834915.3];
const CROP_BOX = { width: 320, height: 180 };

function AerialEntry({ photo }: { photo: Photo }) {
  return (
    <article className="source-entry" data-testid={`aerial-${photo.id}`}>
      <h3>{photo.label}</h3>
      <dl>
        <dt>Year</dt>
        <dd className="mono">{photo.year}</dd>
        <dt>Dataset</dt>
        <dd>{photo.dataset}</dd>
        <dt>Rights</dt>
        <dd>{photo.licence}</dd>
        <dt>Credit</dt>
        <dd>{photo.attribution}</dd>
        <dt>Retrieved</dt>
        <dd className="mono">{photo.fetched}</dd>
        <dt>Resolution</dt>
        <dd className="mono">{photo.metresPerPixel} m per pixel</dd>
        <dt>Address</dt>
        <dd>
          <a href={photo.sourceUrl}>{photo.sourceUrl}</a>
        </dd>
      </dl>
      {photo.approximate ? <p data-testid="aerial-caveat">{HISTORIC_CAVEAT}</p> : null}
      <figure className="source-photo">
        <img src={photo.src} loading="lazy" alt={`A small crop of the ${photo.label}, around the coal and wood yard.`} style={cropStyle(photo, CROP_CENTRE, CROP_BOX)} />
        <figcaption className="small">A small crop of the photograph. {photo.note}</figcaption>
      </figure>
    </article>
  );
}

function ImaginedList({ views, how }: { views: readonly ImaginedView[]; how: string }) {
  return (
    <>
      <p>{IMAGINED_INTRO}</p>
      {how !== '' ? <p>{how}</p> : null}
      <p>The sites that have one:</p>
      <ul data-testid="imagined-list">
        {views.map((v) => (
          <li key={v.slug} data-testid={`imagined-${v.slug}`}>
            {streetCaption(v)} <span className="small">From {v.planName}, {v.about}.</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function SourceEntry({ source, tile }: { source: Source; tile: TileSidecar | undefined }) {
  const archival = isArchival(source);
  const years = archival && source.year_from !== null ? sourceYearsText(source) : yearsText(source);
  return (
    <article className="source-entry" data-testid={`source-${source.id}`}>
      <h3>{source.title}</h3>
      {source.attribution_status !== 'confirmed' && <p className="small">Not shown in the app yet.</p>}
      <dl>
        <dt>Years</dt>
        <dd className="mono">{years}</dd>
        {source.holding !== undefined && (
          <>
            <dt>Held by</dt>
            <dd>{source.holding}</dd>
          </>
        )}
        <dt>Credit</dt>
        <dd>{source.attribution_line}</dd>
        <dt>Rights</dt>
        <dd>{source.licence_note}</dd>
        <dt>Rights checked</dt>
        <dd className="mono">{source.rights_checked_on ?? 'not yet'}</dd>
        <dt>Address</dt>
        <dd>
          <a href={source.url}>{source.url}</a>
        </dd>
        <dt>Record</dt>
        <dd className="mono small">{source.id}</dd>
      </dl>
      {tile?.full_image !== undefined && tile.full_width_px !== undefined && tile.full_height_px !== undefined && (
        <figure className="source-photo" data-testid={`source-photo-${source.id}`}>
          <img src={fullImageUrl(tile)} width={tile.full_width_px} height={tile.full_height_px} loading="lazy" alt={fullImageAlt(source)} />
          <figcaption className="small">The whole photograph, archive labels and ruler included. The map in the Explorer is cut from the part inside the map area.</figcaption>
        </figure>
      )}
    </article>
  );
}

/** The page body, from loaded data. Pure, so tests can render it without the network. */
export function SourcesView({ data }: { data: SourcesData }) {
  const archival = data.sources.filter(isArchival);
  const present = data.sources.filter((s) => !isArchival(s));
  return (
    <>
      <h1>Sources</h1>
      <p>
        Every plan, photograph and dataset behind what Buried shows, with who holds it, the credit it asks for and what we know about the rights to use it. The plans are shown as they were
        photographed, labels included, so nothing about where they came from is hidden.
      </p>
      <p>
        <a href="/studio" data-testid="workshop-link">
          The workshop (runs on a maintainer's machine)
        </a>
      </p>
      <section aria-labelledby="sources-archival">
        <h2 id="sources-archival">Plans and photographs</h2>
        {archival.map((s) => (
          <SourceEntry key={s.id} source={s} tile={data.sidecars.get(s.id)} />
        ))}
      </section>
      <section aria-labelledby="sources-present">
        <h2 id="sources-present">City of Toronto data</h2>
        {present.map((s) => (
          <SourceEntry key={s.id} source={s} tile={undefined} />
        ))}
      </section>
      {data.photos && data.photos.length > 0 ? (
        <section aria-labelledby="sources-aerial" data-testid="sources-aerial">
          <h2 id="sources-aerial">Aerial photographs</h2>
          <p>{AERIAL_INTRO}</p>
          {[...data.photos].reverse().map((p) => (
            <AerialEntry key={p.id} photo={p} />
          ))}
        </section>
      ) : null}
      {data.imagined && data.imagined.views.length > 0 ? (
        <section aria-labelledby="sources-imagined" data-testid="sources-imagined">
          <h2 id="sources-imagined">Imagined views</h2>
          <ImaginedList views={data.imagined.views} how={data.imagined.how} />
        </section>
      ) : null}
      <section aria-labelledby="sources-typefaces" data-testid="sources-typefaces">
        <h2 id="sources-typefaces">Typefaces</h2>
        <p>{TYPEFACES_LINE}</p>
      </section>
      <section aria-labelledby="sources-illustrations" data-testid="sources-illustrations">
        <h2 id="sources-illustrations">Illustrations</h2>
        <p>{ILLUSTRATIONS_LINE}</p>
      </section>
    </>
  );
}

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; data: SourcesData };

/**
 * /sources: every registered source with its title, years, holder, credit, rights note, rights date
 * and address, and for each plate the whole uncropped photograph (spec 03 requirement 21). Built from
 * data/sources.json and the tile sidecars. Plain layout on the paper theme.
 */
export function SourcesPage() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadSourcesData(browserFetchText)
      .then(async (data) => {
        // The photographs and imagined views are small index files under /lotcheck/. A missing one leaves its section out.
        const [photos, imagined] = await Promise.all([loadPhotos(), loadImagined()]);
        if (!cancelled) setState({ status: 'ready', data: { ...data, photos, imagined } });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="sources" data-testid="sources">
      {state.status === 'loading' && <p>Loading the source list.</p>}
      {state.status === 'error' && <p role="alert">The source list could not be loaded. {state.message}</p>}
      {state.status === 'ready' && <SourcesView data={state.data} />}
    </main>
  );
}
