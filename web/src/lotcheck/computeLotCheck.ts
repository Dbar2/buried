import type { LoadedData } from '../data/loadData';
import type { PolygonalGeometry, PresentLayer } from '../evidence';
import { buildReport, PRESENT_SOURCES, withMappedAreas } from '../report/buildReport';
import { buildLotCheck } from './lotCheck';
import type { LotCheck } from './lotCheck';

/**
 * The lot check for one lot from the loaded records: the Report model, then `buildLotCheck`. The Result builds it
 * from here, and so does the Landing, so the dig's slips and the Result's rows come from one function. `buildings`
 * is today's building outlines when they are loaded (the Landing does not load them; the verdict does not need them).
 */
export function computeLotCheck(loaded: LoadedData, lotId: string, buildings: PresentLayer | undefined, siteOrigin: string): LotCheck | null {
  const lots = loaded.presentLayers.get(PRESENT_SOURCES.lots);
  const addresses = loaded.presentLayers.get(PRESENT_SOURCES.addresses);
  const model = buildReport({
    lotId,
    eraId: null,
    canon: { collections: loaded.evidence, registry: loaded.registry, project: loaded.project, sidecars: loaded.tiles, lots, addresses, buildings },
    workspace: null,
    dataVersion: '',
    linkDataVersion: null,
    siteOrigin,
  });
  const geometry = lots?.features.find((f) => f.id === lotId)?.geometry;
  return buildLotCheck(model, {
    lot: geometry as PolygonalGeometry,
    collections: withMappedAreas(loaded.evidence, loaded.tiles),
    tiles: loaded.tiles,
    sources: loaded.sources,
    siteOrigin,
  });
}
