/** Small pieces the night pages share: the art, the fog, the registration crosses. Decoration only; none carries a claim. */

/** The illustrations (web/public/lotcheck/art/), made with an image model. The Sources page says so. */
export const ART = {
  lantern: '/lotcheck/art/lantern.webp',
  paper: '/lotcheck/art/paper.webp',
  skyline: '/lotcheck/art/skyline.webp',
  spade: '/lotcheck/art/spade.webp',
  strata: '/lotcheck/art/strata.webp',
} as const;

/** Two layers of fog at the foot of the page. They drift sideways (transform only) and stop under reduced motion. */
export function Fog() {
  return (
    <div className="lc-fog" aria-hidden="true">
      <div className="lc-fog-a" />
      <div className="lc-fog-b" />
    </div>
  );
}

export function RegistrationCrosses() {
  return (
    <>
      {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
        <span key={corner} className={`lc-cross lc-cross-${corner}`} aria-hidden="true" />
      ))}
    </>
  );
}
