/**
 * The Block page's bridge messages (bridge 0.8.0, spec 06 design "Bridge 0.7.0" and session 040 notes). Pure: no
 * bridge, no DOM. The Player's answers (`scene/anchors`, `scene/raised`) are read here into plain values.
 *
 * Property names of the new messages are snake_case, as the Schema writes them (`feature_ids`, `era_id`,
 * `first_feature_id`, `feature_id`, `on_screen`); the rest of the bridge is camelCase.
 */
import type { MessageOf, PayloadOf } from '../bridge/bridge';
import type { TagAnchor } from './tagLayout';

/** The Schema allows 64 ids in one `scene/setAnchors`. */
export const MAX_ANCHOR_IDS = 64;

/** `scene/setAnchors`: the features whose screen positions the Shell wants, each once, in the order given. */
export function buildSetAnchors(featureIds: readonly string[]): MessageOf<'scene/setAnchors'> {
  const unique = [...new Set(featureIds)].slice(0, MAX_ANCHOR_IDS);
  return { type: 'scene/setAnchors', payload: { feature_ids: unique } };
}

/** `scene/raise`: Raise the past. `animate` is false for a share link and under reduced motion. */
export function buildRaise(eraId: string, firstFeatureId: string, animate: boolean): MessageOf<'scene/raise'> {
  return { type: 'scene/raise', payload: { era_id: eraId, first_feature_id: firstFeatureId, animate } };
}

/** `scene/selectFeature`: with an id it selects, with none it clears. */
export function buildSelectFeature(featureId: string | null): MessageOf<'scene/selectFeature'> {
  return featureId === null
    ? { type: 'scene/selectFeature', payload: {} }
    : { type: 'scene/selectFeature', payload: { feature_id: featureId } };
}

/** `scene/frameFeature`: "Show on the map". Sent only from that button. */
export function buildFrameFeature(featureId: string): MessageOf<'scene/frameFeature'> {
  return { type: 'scene/frameFeature', payload: { feature_id: featureId } };
}

/** The canvas the Player measured, and the anchors it reported, as the Shell uses them. */
export type AnchorReport = {
  width: number;
  height: number;
  /** In the canvas's own CSS pixels (`width` by `height`). */
  anchors: ReadonlyMap<string, { x: number; y: number; onScreen: boolean }>;
};

export function readAnchors(payload: PayloadOf<'scene/anchors'>): AnchorReport {
  const anchors = new Map<string, { x: number; y: number; onScreen: boolean }>();
  for (const a of payload.anchors) anchors.set(a.feature_id, { x: a.x, y: a.y, onScreen: a.on_screen });
  return { width: payload.width, height: payload.height, anchors };
}

/**
 * The Player's anchors as positions in the stage the Shell draws over. The Player's `width` and `height` are its own
 * guess of the canvas size (session 040 note 5), so each anchor is mapped by its share of that size onto the canvas the
 * Shell measures. An anchor the Player reports off screen stays off screen, whatever its numbers.
 */
export function anchorsInStage(report: AnchorReport, ids: readonly string[], stage: { w: number; h: number }): TagAnchor[] {
  return ids.map((id) => {
    const a = report.anchors.get(id);
    if (!a || report.width <= 0 || report.height <= 0) return { id, x: 0, y: 0, onScreen: false };
    const x = (a.x / report.width) * stage.w;
    const y = (a.y / report.height) * stage.h;
    return { id, x, y, onScreen: a.onScreen && x >= 0 && x <= stage.w && y >= 0 && y <= stage.h };
  });
}
