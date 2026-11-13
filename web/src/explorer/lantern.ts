/**
 * The Lantern and Show Evidence messages (bridge 0.6.0) and the pure rules around them. The Shell decides when
 * the lens is on and where it is; the Player draws it. Nothing here touches the DOM or the bridge.
 */
import type { MessageOf, PayloadOf } from '../bridge/bridge';
import { plainSourceName } from '../evidence';
import type { SourceIndex } from '../evidence';
import type { Drape } from './drapes';
import type { EraInfo } from './eraOrder';

/** The lens radius as a fraction of the canvas height (spec 03 design, "Lantern"). */
export const LENS_RADIUS = 0.18;
/** An arrow key moves the lens by this share of the canvas (requirement 13.7). */
export const LENS_KEY_STEP = 0.05;
/** A touch held this long without moving turns the lens on (design, "Lantern"). */
export const LONG_PRESS_MS = 500;
/** ... and moving more than this many pixels cancels it. */
export const LONG_PRESS_SLOP_PX = 8;

/** A point on the canvas, 0 to 1 from the left and from the top. */
export type ScreenPoint = PayloadOf<'scene/setLantern'>['center'];

export type LensCommand = { on: boolean; center: ScreenPoint; eraId: string };

export type EvidenceCommand = { featureId: string; drape: Drape };

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** The lens centre when the pointer has not been over the canvas: the middle of it. */
export const CANVAS_CENTRE: ScreenPoint = { x: 0.5, y: 0.5 };

/** A client position as a point on a canvas rectangle, clamped to the canvas. A zero-sized rectangle gives its centre. */
export function toScreenPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): ScreenPoint {
  if (rect.width <= 0 || rect.height <= 0) return CANVAS_CENTRE;
  return { x: clamp01((clientX - rect.left) / rect.width), y: clamp01((clientY - rect.top) / rect.height) };
}

/** An arrow key moves the lens; any other key leaves it. */
export function moveByKey(point: ScreenPoint, key: string): ScreenPoint {
  switch (key) {
    case 'ArrowLeft':
      return { x: clamp01(point.x - LENS_KEY_STEP), y: point.y };
    case 'ArrowRight':
      return { x: clamp01(point.x + LENS_KEY_STEP), y: point.y };
    case 'ArrowUp':
      return { x: point.x, y: clamp01(point.y - LENS_KEY_STEP) };
    case 'ArrowDown':
      return { x: point.x, y: clamp01(point.y + LENS_KEY_STEP) };
    default:
      return point;
  }
}

/**
 * The era shown inside the lens: `requested` when it names a past era, else the nearest era below Today that has a
 * drape to show (`hasDrape`), else the era at depth 1 (requirement 13.4). With no `hasDrape` every era counts as
 * having one. Null when the project has no past era.
 */
export function lanternEra(
  order: readonly Pick<EraInfo, 'id' | 'index'>[],
  requested: string | null,
  hasDrape: (eraId: string) => boolean = () => true,
): string | null {
  const past = order.filter((era) => era.index > 0).sort((a, b) => a.index - b.index);
  const named = requested === null ? undefined : past.find((era) => era.id === requested);
  return (named ?? past.find((era) => hasDrape(era.id)) ?? past.find((era) => era.index === 1) ?? past[0])?.id ?? null;
}

/**
 * The Lantern control's label: "Lantern: 1931-35 plan", naming what is inside the lens in plain words (the first
 * drape's source, "the 1931-35 plan" without the article). Just "Lantern" when the lens era has no drape to name.
 */
export function lanternLabel(sources: SourceIndex, drapesInLens: readonly Pick<Drape, 'sourceId'>[]): string {
  const first = drapesInLens[0];
  const source = first ? sources.get(first.sourceId) : undefined;
  return source ? `Lantern: ${plainSourceName(source).replace(/^the /, '')}` : 'Lantern';
}

/**
 * The one line of help shown the first time the Lantern control is on screen (session 034). It names the keys and the
 * touch gesture, and what is inside the circle in plain words ("the 1931-35 plan"); with no drape to name it says
 * "an older view".
 */
export function lanternHelp(sources: SourceIndex, drapesInLens: readonly Pick<Drape, 'sourceId'>[]): string {
  const first = drapesInLens[0];
  const source = first ? sources.get(first.sourceId) : undefined;
  const inside = source ? plainSourceName(source) : 'an older view';
  return `Hold Space or press L (on a touch screen, press and hold) to see ${inside} inside a circle.`;
}

export function buildSetLantern(command: LensCommand): MessageOf<'scene/setLantern'> {
  return {
    type: 'scene/setLantern',
    payload: { on: command.on, center: { x: command.center.x, y: command.center.y }, radius: LENS_RADIUS, eraId: command.eraId },
  };
}

/** Show Evidence on, with the drape of the feature's origin source, or off. */
export function buildShowEvidence(featureId: string, drape: Drape | null): MessageOf<'scene/showEvidence'> {
  return drape === null
    ? { type: 'scene/showEvidence', payload: { featureId, on: false } }
    : { type: 'scene/showEvidence', payload: { featureId, on: true, drape } };
}
