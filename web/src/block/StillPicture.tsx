import { STILL_SIZES } from './stillAnchors';
import type { StillKind } from './stillAnchors';

export type StillSource = { readonly src: string };

export type StillPictureProps = {
  /** The committed Stills, wide and tall (spec 06 design "The Still"). */
  sources: { readonly wide: StillSource; readonly tall: StillSource };
  /** Which one to show, from `stillKindFor(viewport)`. */
  kind: StillKind;
  /** True once the Player has drawn its first frame: the Still fades out over 300 ms (requirement 2.3). */
  faded: boolean;
};

/**
 * The Still: a committed picture of the real opening scene, shown at once while the Player loads. It is
 * drawn with `object-fit: cover`, so `stillAnchors` can place the tags on it. It is a picture of the scene,
 * and the finds' list and tags carry its text, so it has no alt text of its own. The image dimensions are
 * set so the page does not shift when it arrives.
 */
export function StillPicture({ sources, kind, faded }: StillPictureProps) {
  const size = STILL_SIZES[kind];
  return (
    <div className={`still-picture${faded ? ' is-faded' : ''}`} data-testid="still" data-kind={kind} data-faded={faded} aria-hidden="true">
      <img className="still-image" src={sources[kind].src} width={size.w} height={size.h} alt="" loading="eager" decoding="async" />
    </div>
  );
}
