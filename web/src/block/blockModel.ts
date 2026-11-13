/**
 * What the Block page shows, as plain values (spec 06 requirements 4 and 5, design "The card"). Pure: the model, the
 * resolved finds and a choice go in; a card view model, the ruler, the tags and the Flat sheet's layers come out.
 * Every sentence comes from the Evidence Library (`findText`, `review`); nothing here words anything but a link.
 */
import {
  findPositionLine,
  ghostTitle,
  kickerText,
  letteredLines,
  plainSourceName,
  reviewStatusLine,
  rulerLine,
  seenOnText,
  sheetNumber,
} from '../evidence';
import type { Feature, PlanSource, Source, TileSidecar } from '../evidence';
import { shareLink } from '../report/links';
import type { EraInfo } from '../explorer/eraOrder';
import type { GateModel } from '../explorer/gateModel';
import type { CardViewModel } from './FindCard';
import type { RulerStop } from './EraRuler';
import type { TagItem } from './FindTags';
import { cropInTile } from './finds';
import type { ResolvedFind, ResolvedReading, TileRect } from './finds';
import { findLink } from './share';
import type { Pt } from './sheetTransform';

/** The three stops of the ruler, left to right (requirement 5.2). 1947 is not on it. */
export const RULER_ERA_IDS = ['today', '1935', '1911'] as const;

/** The era the raise lifts, and the one the ruler sits on afterwards (requirement 3.2). */
export const RAISE_ERA_ID = '1911';

const PLAN_TYPES: ReadonlySet<Source['type']> = new Set(['fire_insurance_plan', 'historical_map']);

/** The eras of the ruler that the project has, in ruler order. */
export function rulerEras(model: Pick<GateModel, 'order'>): EraInfo[] {
  return RULER_ERA_IDS.flatMap((id) => model.order.filter((e) => e.id === id));
}

/**
 * The plans loaded for an era: registered plan sources whose years lie inside the era's, and that have a feature on
 * file. Null for Today, which has no plan. The ruler line of requirement 5.3 reads this.
 */
export function eraPlanSources(model: Pick<GateModel, 'sources' | 'features'>, era: EraInfo): PlanSource[] | null {
  if (era.index === 0) return null;
  const loaded = new Set<string>();
  for (const feature of model.features.values()) loaded.add(feature.properties.provenance.origin_source);
  return [...model.sources.values()]
    .filter((s) => PLAN_TYPES.has(s.type) && s.year_from !== null && s.year_from >= era.yearFrom && s.year_to <= era.yearTo && loaded.has(s.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** "Now showing today" or "Now showing the 1911 plan". */
export function rulerAnnouncement(model: Pick<GateModel, 'sources' | 'features'>, era: EraInfo): string {
  const plans = eraPlanSources(model, era);
  if (plans === null) return 'Now showing today';
  const first = plans[0];
  return first ? `Now showing ${plainSourceName(first)}` : `Now showing ${era.label}`;
}

export function rulerStops(model: Pick<GateModel, 'order' | 'sources' | 'features'>): RulerStop[] {
  return rulerEras(model).map((era) => ({
    id: era.id,
    label: era.id === 'today' ? 'Today' : era.id,
    announcement: rulerAnnouncement(model, era),
  }));
}

/** The paper tags, one per find, in find order. A tag's id is its find's slug. */
export function tagItems(finds: readonly ResolvedFind[]): TagItem[] {
  return finds.map((f) => ({ id: f.find.slug, text: f.find.tag }));
}

/** The feature ids to ask the Player for anchors of: every reading's, each once, in find order. */
export function anchorFeatureIds(finds: readonly ResolvedFind[]): string[] {
  return [...new Set(finds.flatMap((f) => f.readings.map((r) => r.reading.feature_id)))];
}

/** The reading of a find that the era draws, or undefined when no reading's feature is in the era's list. */
export function readingForEra(find: ResolvedFind, eraId: string, model: Pick<GateModel, 'lists'>): ResolvedReading | undefined {
  const ids = new Set((model.lists.get(eraId)?.features ?? []).map((f) => f.id));
  return find.readings.find((r) => ids.has(r.reading.feature_id));
}

/** The feature the scene should select and anchor for a find in an era: the era's reading, else the first one. */
export function sceneFeatureFor(find: ResolvedFind, eraId: string, model: Pick<GateModel, 'lists'>): string {
  return (readingForEra(find, eraId, model) ?? find.primary).reading.feature_id;
}

type Ring = readonly (readonly number[])[];

/** Every ring of a Polygon or MultiPolygon, as [easting, northing] pairs. Other geometry has none. */
export function ringsOfGeometry(geometry: Feature['geometry'] | { type: string; coordinates: unknown }): Pt[][] {
  const toRing = (ring: Ring): Pt[] => ring.map((p) => [p[0] as number, p[1] as number] as const);
  if (geometry.type === 'Polygon') return (geometry.coordinates as readonly Ring[]).map(toRing);
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as readonly (readonly Ring[])[]).flatMap((polygon) => polygon.map(toRing));
  return [];
}

/** The middle of a feature's bounding box in EPSG:26917, or null for a feature with no area. */
export function featureCentre(feature: Pick<Feature, 'geometry'>): [number, number] | null {
  const rings = ringsOfGeometry(feature.geometry);
  const points = rings.flat();
  if (points.length === 0) return null;
  const es = points.map((p) => p[0]);
  const ns = points.map((p) => p[1]);
  return [(Math.min(...es) + Math.max(...es)) / 2, (Math.min(...ns) + Math.max(...ns)) / 2];
}

/** Finds the lot that holds a point (`lotForPoint` in `report/search`, which pulls in the geometry library, so the page loads it later). */
export type LotFinder = (lots: GateModel['lots'], point: readonly [number, number]) => string | null;

/** `/report?lot=<id>&era=<era id>` for the lot that holds the feature, or null when no lot does ("Full record"). */
export function fullRecordHref(
  model: Pick<GateModel, 'lots'>,
  feature: Pick<Feature, 'geometry'>,
  eraId: string | null,
  lotFor: LotFinder | null,
): string | null {
  const centre = lotFor ? featureCentre(feature) : null;
  if (!lotFor || !centre) return null;
  const lot = lotFor(model.lots, centre);
  return lot === null ? null : shareLink('', lot, eraId, '');
}

function cardCrop(source: Source, tile: TileSidecar | null, rect: TileRect | null, what: string) {
  if (!tile || !rect) return null;
  const sheet = sheetNumber(source.id);
  return {
    src: `/data/tiles/${tile.image}`,
    tileWidth: tile.width_px,
    tileHeight: tile.height_px,
    rect,
    alt: `${what} as drawn on ${plainSourceName(source)}${sheet ? `, sheet ${sheet}` : ''}`,
  };
}

export type CardContext = {
  model: GateModel;
  /** The era the ruler shows. */
  eraId: string;
  siteOrigin: string;
  /** The selected feature's anchor is off screen: the card offers "Show on the map". */
  anchorOffScreen: boolean;
  /** The Player or the Flat sheet can show the original sheet (a tile exists for the feature's source). */
  canShowOriginal: boolean;
  /** Finds the lot that holds a point; null until it has loaded (then "Full record" is not offered yet). */
  lotFor: LotFinder | null;
};

/**
 * The card of a find (requirement 4.2). The card opens on the find's primary reading (the earliest plan); the ruler
 * line (requirement 5.3) is added when the ruler's era has a reading of its own.
 */
export function findCardView(find: ResolvedFind, ctx: CardContext): CardViewModel {
  const reading = find.primary;
  const feature = reading.feature;
  const era = ctx.model.order.find((e) => e.id === ctx.eraId);
  const eraSources = era ? eraPlanSources(ctx.model, era) : null;
  return {
    kicker: kickerText(reading.source, 'lettered'),
    lines: letteredLines(reading.reading.lettered),
    crop: cardCrop(reading.source, reading.tile, reading.tileRect, 'The lettering'),
    seenOn: seenOnText(reading.source),
    position: findPositionLine(feature.properties.position_error_m),
    status: reviewStatusLine(feature.properties.provenance.review),
    rulerLine: rulerLine({
      noun: find.find.noun,
      readings: find.readings.map((r) => r.reading),
      primary: reading.reading,
      eraSources,
    }),
    actions: { showOriginalSheet: ctx.canShowOriginal, share: true, fullRecord: true, showOnMap: ctx.anchorOffScreen },
    fullRecordHref: fullRecordHref(ctx.model, feature, ctx.eraId, ctx.lotFor),
    shareLink: findLink(ctx.siteOrigin, find.find.slug),
  };
}

/**
 * The card of a ghost that is no find's feature (requirement 4.5): "DRAWN ON THE <PLAN> PLAN", the title the record
 * supports, the provenance crop. It offers no "Share this find". Null when the feature or its source is unknown.
 */
export function ghostCardView(featureId: string, ctx: CardContext): CardViewModel | null {
  const feature = ctx.model.features.get(featureId);
  if (!feature) return null;
  const source = ctx.model.sources.get(feature.properties.provenance.origin_source);
  if (!source) return null;
  const tile = ctx.model.tiles.find((t) => t.source === source.id) ?? null;
  const rect = tile ? cropInTile(feature.properties.provenance.crop_px, tile) : null;
  const p = feature.properties;
  return {
    kicker: kickerText(source, 'drawn'),
    lines: [ghostTitle({ kind: p.kind, storeys: p.attributes.storeys, source })],
    crop: cardCrop(source, tile, rect, 'The outline'),
    seenOn: seenOnText(source),
    position: findPositionLine(p.position_error_m),
    status: reviewStatusLine(p.provenance.review),
    rulerLine: null,
    actions: { showOriginalSheet: ctx.canShowOriginal, share: false, fullRecord: true, showOnMap: ctx.anchorOffScreen },
    fullRecordHref: fullRecordHref(ctx.model, feature, ctx.eraId, ctx.lotFor),
    shareLink: null,
  };
}
