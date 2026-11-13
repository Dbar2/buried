import type { EraFeatureList } from '../evidence';
import type { Drape } from './drapes';
import type { EraInfo } from './eraOrder';

/**
 * The plain line shown when a past era has nothing to draw yet (session 018): no feature and no
 * drape. The scene then shows only today's buildings as faint outlines, and the viewer is told why.
 * Today is never empty: it is the present layer. Returns null when the era has something to show.
 */
export function noImageryNote(
  era: Pick<EraInfo, 'index' | 'label'> | undefined,
  list: Pick<EraFeatureList, 'features'> | undefined,
  drapes: readonly Drape[] | undefined,
): string | null {
  if (!era || era.index === 0) return null;
  if ((list?.features.length ?? 0) > 0 || (drapes?.length ?? 0) > 0) return null;
  return `No ${era.label} imagery loaded yet`;
}
