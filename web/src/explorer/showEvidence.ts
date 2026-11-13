/**
 * Show Evidence (spec 03 requirement 12): which ghost, and which source's untouched scan to put beneath it. The Shell
 * decides; the Player draws. A ghost is shown only while the era that draws it is the one on screen, so a change of
 * depth ends it without a separate step (requirement 12.3). Pure.
 */
import type { TileSidecar } from '../evidence';
import type { EvidenceCommand } from './lantern';
import { drapeForSource } from './drapes';
import type { EraInfo } from './eraOrder';

type FeatureLike = { properties: { provenance: { origin_source: string } } };
type ListLike = { features: readonly { id: string }[] };

/**
 * The command for a feature, or null when there is none to send: no feature chosen, the feature unknown, no past
 * era draws it, the era on screen is not that one, or its origin source has no tile.
 */
export function evidenceCommand(
  model: {
    features: ReadonlyMap<string, FeatureLike>;
    lists: ReadonlyMap<string, ListLike>;
    order: readonly Pick<EraInfo, 'id' | 'index'>[];
    tiles: readonly TileSidecar[];
  },
  featureId: string | null,
  settledIndex: number | null,
): EvidenceCommand | null {
  if (featureId === null || settledIndex === null || settledIndex <= 0) return null;
  const feature = model.features.get(featureId);
  if (!feature) return null;
  const era = model.order.find((e) => e.index === settledIndex);
  if (!era || !model.lists.get(era.id)?.features.some((f) => f.id === featureId)) return null;
  const drape = drapeForSource(feature.properties.provenance.origin_source, model.tiles);
  return drape === null ? null : { featureId, drape };
}
