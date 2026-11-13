import type { CSSProperties } from 'react';
import { makeSheetTransform, ringsToPath } from './sheetTransform';
import type { Pt, TileCorners } from './sheetTransform';

export type Confidence = 'documented' | 'estimated' | 'unknown';

export type FlatTile = {
  /** The untouched plate tile, for example `/data/tiles/fip_v3_1911_229.jpg`. */
  src: string;
  widthPx: number;
  heightPx: number;
  /** Corners from the tile sidecar, EPSG:26917 metres. */
  corners: TileCorners;
};

export type FlatFootprint = {
  id: string;
  /** Polygon rings in EPSG:26917 metres. */
  rings: readonly (readonly Pt[])[];
  confidence: Confidence;
  /** The accessible name: what the list view also says. */
  name: string;
};

export type FlatSheetProps = {
  tile: FlatTile;
  footprints: readonly FlatFootprint[];
  /** Today's outlines, drawn cold in `--block` (for the Today stop). */
  present?: readonly (readonly (readonly Pt[])[])[];
  /** Dim the tile (the Today stop shows the 1911 tile dimmed under today's outlines). */
  dimmed?: boolean;
  /** Told to raise: the footprints draw on. Until then only the tile (and today's outlines) show. */
  raised: boolean;
  /** Reduced motion: the footprints are there at once. */
  reducedMotion: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

/** The last footprint starts by 1.5 s and the draw takes 0.7 s, so everything settles by 2.2 s (design.md "Motion"). */
export const FLAT_STAGGER_TOTAL_S = 1.5;
export const FLAT_STAGGER_S = 0.02;
export const FLAT_DRAW_S = 0.7;

/** Seconds between one footprint's start and the next: 0.02 s, less when there are many. Pure. */
export function flatStagger(count: number): number {
  return count > 1 ? Math.min(FLAT_STAGGER_S, FLAT_STAGGER_TOTAL_S / (count - 1)) : 0;
}

/**
 * The Flat sheet (spec 06 requirement 11.3): the no-WebGL view. One SVG holds the untouched tile and a layer of
 * footprints, both in tile pixels, so they always line up; `sheetTransform` places the footprints from the sidecar
 * corners. Confidence is shown by line pattern, never colour alone: solid for documented, dashed for estimated,
 * dotted for unknown (design.md "Confidence encoding"). Raising draws each outline on through a mask that reveals
 * it along its length (so the dash pattern, which is the confidence mark, stays intact), then its fill comes up.
 * The selected footprint's edge is `--lantern` and thicker.
 */
export function FlatSheet({ tile, footprints, present = [], dimmed = false, raised, reducedMotion, selectedId, onSelect }: FlatSheetProps) {
  const transform = makeSheetTransform(tile.corners, tile.widthPx, tile.heightPx);
  const animate = raised && !reducedMotion;
  const step = flatStagger(footprints.length);
  return (
    <div className={`flat-sheet${dimmed ? ' is-dimmed' : ''}`} data-testid="flat-sheet" data-raised={raised}>
      <svg
        className="flat-sheet-svg"
        viewBox={`0 0 ${tile.widthPx} ${tile.heightPx}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`The plan sheet, flat. ${raised ? `${footprints.length} ${footprints.length === 1 ? 'footprint' : 'footprints'} drawn.` : 'No footprints drawn yet.'} The list of finds has the same records as text.`}
      >
        <image className="flat-sheet-tile" href={tile.src} width={tile.widthPx} height={tile.heightPx} />
        <g className="flat-present">
          {present.map((rings, i) => (
            <path key={i} d={ringsToPath(transform, rings)} fillRule="evenodd" />
          ))}
        </g>
        {raised ? (
          <g className="flat-footprints" data-testid="flat-footprints">
            {footprints.map((footprint, i) => {
              const d = ringsToPath(transform, footprint.rings);
              const selected = footprint.id === selectedId;
              const delay = animate ? `${(i * step).toFixed(2)}s` : undefined;
              const maskId = `flat-reveal-${i}`;
              return (
                <g
                  key={footprint.id}
                  className={`flat-fp flat-fp-${footprint.confidence}${selected ? ' is-selected' : ''}${animate ? ' is-drawing' : ''}`}
                  data-feature-id={footprint.id}
                  style={delay ? ({ '--flat-delay': delay } as CSSProperties) : undefined}
                  onClick={() => onSelect(footprint.id)}
                >
                  <title>{footprint.name}</title>
                  {animate ? (
                    <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={tile.widthPx} height={tile.heightPx}>
                      <path className="flat-reveal" d={d} pathLength={1} />
                    </mask>
                  ) : null}
                  <path className="flat-fp-fill" d={d} fillRule="evenodd" />
                  <path className="flat-fp-edge" d={d} fillRule="evenodd" mask={animate ? `url(#${maskId})` : undefined} />
                </g>
              );
            })}
          </g>
        ) : null}
      </svg>
    </div>
  );
}
