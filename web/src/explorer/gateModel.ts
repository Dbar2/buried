/**
 * Everything the gate Explorer derives from the loaded data, computed once and without the DOM:
 * the era order, each gate era's Era list (featuresForEra) and drapes, the raw features for the
 * card, and the debug markers.
 *
 * The gate uses plate 229 only (tasks.md group 1). The held-out plate `fip_v3_1935_232` is never
 * used for gate data, so tiles are limited to GATE_SOURCE_IDS here. Task group 3 removes the limit.
 */
import type { ControlPoints, Era, EraFeatureList, Feature, Project, SourceIndex, TileSidecar } from '../evidence';
import { featuresForEra } from '../evidence';
import type { LoadedData } from '../data/loadData';
import { drapesForEra } from './drapes';
import type { Drape } from './drapes';
import { eraOrder } from './eraOrder';
import type { EraInfo } from './eraOrder';
import { pickGateMarkers } from './gateMarkers';
import type { GateMarker } from './gateMarkers';
import { initialView } from './initialView';
import type { Rect } from './initialView';
import { PRESENT_BUILDINGS_SOURCE, presentBuildings } from './presentBuildings';
import type { PresentBuilding } from './presentBuildings';

export const GATE_ERA_IDS: readonly string[] = ['1911', '1935'];
export const GATE_SOURCE_IDS: ReadonlySet<string> = new Set(['fip_v3_1911_229', 'fip_v3_1935_229']);

export type GateModel = {
  project: Project;
  sources: SourceIndex;
  /** Every era, Today first. */
  order: EraInfo[];
  /** The two eras the gate loads, in depth order. */
  gateEras: EraInfo[];
  lists: Map<string, EraFeatureList>;
  drapes: Map<string, Drape[]>;
  /** Raw features by id, for the card (provenance). */
  features: Map<string, Feature>;
  tiles: TileSidecar[];
  markers: GateMarker[];
  /** The rectangle the default camera pose frames. */
  initialView: Rect;
  /** Today's buildings for scene/init, and the number left out because the bridge cannot carry them. */
  present: PresentBuilding[];
  presentSkipped: number;
};

export function buildGateModel(data: LoadedData): GateModel {
  const order = eraOrder(data.project.eras);
  const gateEras = order.filter((era) => GATE_ERA_IDS.includes(era.id));
  if (gateEras.length !== GATE_ERA_IDS.length) {
    throw new Error(`The project file has no eras ${GATE_ERA_IDS.join(' and ')}, which the gate needs`);
  }

  const tiles = data.tiles.filter((tile) => GATE_SOURCE_IDS.has(tile.source));
  const eraById = new Map<string, Era>(data.project.eras.map((era) => [era.id, era]));

  const lists = new Map<string, EraFeatureList>();
  const drapes = new Map<string, Drape[]>();
  // Every era is loaded at start (design.md "Startup", until sceneModel decides what to keep): the
  // gate eras carry the data; the others are empty until their data exists.
  for (const info of order) {
    const era = eraById.get(info.id) as Era;
    lists.set(info.id, featuresForEra(data.evidence, data.sources, era));
    drapes.set(info.id, drapesForEra(era, data.sources, tiles));
  }

  const b = data.project.bounds;
  const view = initialView(lists.values(), [...drapes.values()].flat(), {
    minE: b.min_e,
    minN: b.min_n,
    maxE: b.max_e,
    maxN: b.max_n,
  }, tiles.flatMap((tile) => (tile.map_area ? [tile.map_area.coordinates[0] as ReadonlyArray<readonly number[]>] : [])));

  const features = new Map<string, Feature>();
  for (const collection of data.evidence) {
    for (const feature of collection.features) features.set(feature.id, feature);
  }

  const first: ControlPoints | undefined = data.controls.get('fip_v3_1911_229');
  const second: ControlPoints | undefined = data.controls.get('fip_v3_1935_229');
  const markers = first ? pickGateMarkers(first, second) : [];

  const { buildings: present, skipped: presentSkipped } = presentBuildings(data.presentLayers.get(PRESENT_BUILDINGS_SOURCE));

  return {
    project: data.project,
    sources: data.sources,
    order,
    gateEras,
    lists,
    drapes,
    features,
    tiles,
    markers,
    initialView: view,
    present,
    presentSkipped,
  };
}
