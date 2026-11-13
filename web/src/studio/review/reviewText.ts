/**
 * Words and small rules for the review panel. Nothing here decides geometry or confidence.
 *
 *  - Outline quality bands mirror the preview image of `buried extract --preview`
 *    (pipeline/buried_pipeline/extract/preview.py: high from 0.9, medium from 0.6). They are a way
 *    to look at a proposal's score, not a confidence class and not evidence.
 *  - A tone is how the shape is shaded on the scan. A grey tone on a scan is not a material.
 */
import { pointInRect, polygonCentroid } from '../plate/plateView';
import type { Rect } from '../plate/plateView';
import type { ProposalFeature } from './reviewModel';

export type Band = 'high' | 'medium' | 'low';
export const BAND_HIGH_MIN = 0.9;
export const BAND_MEDIUM_MIN = 0.6;

export function bandOf(score: number): Band {
  return score >= BAND_HIGH_MIN ? 'high' : score >= BAND_MEDIUM_MIN ? 'medium' : 'low';
}

export const BAND_LABEL: Readonly<Record<Band, string>> = {
  high: 'Clean outline',
  medium: 'Fair outline',
  low: 'Weak outline',
};

export const TONE_LABEL: Readonly<Record<string, string>> = {
  light: 'light grey',
  mid: 'mid grey',
  dark: 'dark grey',
  hatched: 'hatched lines',
  mixed: 'mixed shading',
};

export function toneText(toneClass: string): string {
  return `Shaded ${TONE_LABEL[toneClass] ?? toneClass} on the scan. A tone on a scan does not tell you what the building is made of.`;
}

export const WEAKNESS_TEXT: Readonly<Record<string, string>> = {
  open_outline: 'The outline has gaps, so the shape may be wrong.',
  hatched_fill: 'The inside is hatched, which may be lettering or a symbol rather than shading.',
  text_overlap: 'Printed text runs across this shape.',
  touches_edge: 'It touches the edge of the map area.',
  touches_fold: 'It touches a fold or a seam in the scan.',
};

export function weaknessText(flag: string): string {
  return WEAKNESS_TEXT[flag] ?? `The extraction flagged this shape as "${flag}".`;
}

/** The ids of proposals with no decision whose centre lies inside the reviewed area. */
export function undecidedInside(
  area: Rect,
  proposals: readonly ProposalFeature[],
  decisions: Readonly<Record<string, unknown>>,
): string[] {
  return proposals
    .filter((p) => decisions[p.id] === undefined && pointInRect(polygonCentroid(p.properties.pixel_polygon), area))
    .map((p) => p.id);
}

/** The short form of a proposal id for the screen: the last six characters of its hash. */
export function shortId(id: string): string {
  return id.slice(-6);
}

export const KEY_LEGEND: ReadonlyArray<readonly [string, string]> = [
  ['A', 'accept'],
  ['R', 'reject'],
  ['J / K', 'next / previous'],
  ['← →', 'next / previous'],
  ['F', 'fit to current'],
  ['U', 'undo'],
];
