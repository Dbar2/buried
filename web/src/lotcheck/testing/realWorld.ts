/** The committed data, loaded from disk, and the lot check for any lot in it. For tests only. */
import { loadData } from '../../data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../../explorer/testing/diskFetch';
import type { PolygonalGeometry } from '../../evidence';
import { buildReport, PRESENT_SOURCES, withMappedAreas } from '../../report/buildReport';
import { buildLotCheck } from '../lotCheck';
import type { LotCheck } from '../lotCheck';

export async function realWorld() {
  const data = await loadData(diskFetch(REPOSITORY_DATA));
  return { data, lots: data.presentLayers.get(PRESENT_SOURCES.lots)!, addresses: data.presentLayers.get(PRESENT_SOURCES.addresses)! };
}

export type RealWorld = Awaited<ReturnType<typeof realWorld>>;

const cache = new WeakMap<object, Map<string, LotCheck>>();

/** The lot check for one lot, remembered per loaded world (a full pass over every lot takes seconds). */
export function checkLot(w: RealWorld, lotId: string): LotCheck {
  const memo = cache.get(w.lots) ?? new Map<string, LotCheck>();
  cache.set(w.lots, memo);
  const hit = memo.get(lotId);
  if (hit) return hit;
  const made = computeLotCheck(w, lotId);
  memo.set(lotId, made);
  return made;
}

function computeLotCheck(w: RealWorld, lotId: string): LotCheck {
  const { data } = w;
  const model = buildReport({
    lotId,
    eraId: null,
    canon: {
      collections: data.evidence,
      registry: data.registry,
      project: data.project,
      sidecars: data.tiles,
      lots: w.lots,
      addresses: w.addresses,
      buildings: data.presentLayers.get(PRESENT_SOURCES.buildings),
    },
    workspace: null,
    dataVersion: '0123456789abcdef'.repeat(4),
    linkDataVersion: null,
    siteOrigin: 'https://buried.example',
  });
  const lot = w.lots.features.find((f) => f.id === lotId)?.geometry as PolygonalGeometry;
  return buildLotCheck(model, { lot, collections: withMappedAreas(data.evidence, data.tiles), tiles: data.tiles, sources: data.sources, siteOrigin: 'https://buried.example' });
}
