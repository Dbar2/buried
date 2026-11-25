import * as copy from './copy';
import type { Inscription } from './lotCheck';
import { ART } from './night';

/**
 * The verdict tag as a rubber stamp (session 053): the same words as the tag, in `--stamp` ink with a double border,
 * rotated a little. The SVG turbulence filter roughens it once, as a static filter. Under reduced motion it is in place.
 */
export function Stamp({ text }: { text: string }) {
  return (
    <>
      <svg className="lc-filters" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id="lc-stamp-rough" x="-4%" y="-8%" width="108%" height="116%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" result="noise" />
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2 2.45" result="speck" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.4" result="rough" />
          <feComposite in="rough" in2="speck" operator="in" />
        </filter>
      </svg>
      <p className="lc-tag lc-stamp" data-testid="lc-tag">
        <span className="lc-stamp-text">{text}</span>
      </p>
    </>
  );
}

/**
 * The inscription at the top of the record sheet, set like a grave marker (requirement 10.1): a thin rule, small
 * corner ornaments, centred. The lead and the lettered name come from `buildLotCheck`; nothing is added here.
 */
export function InscriptionBlock({ inscription }: { inscription: Inscription }) {
  const dug = inscription.lead !== copy.INSCRIPTION.notDug;
  const showsUse = inscription.lead === copy.INSCRIPTION.here || inscription.lead === copy.INSCRIPTION.next;
  const name = inscription.name?.text ?? (showsUse ? copy.INSCRIPTION.notQuoted : null);
  return (
    <div className="lc-inscription" data-testid="lc-inscription" data-lead={inscription.lead}>
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <span key={c} className={`lc-orn lc-orn-${c}`} aria-hidden="true" />
      ))}
      <p className="lc-ins-lead" data-testid="lc-ins-lead">
        {inscription.lead}
      </p>
      {name ? (
        <p className="lc-ins-name" data-testid="lc-ins-name">
          {name}
        </p>
      ) : null}
      {inscription.foot ? (
        <p className="lc-ins-foot" data-testid="lc-ins-foot">
          {inscription.foot.text}
        </p>
      ) : null}
      {!dug ? <img className="lc-ins-spade" src={ART.spade} alt="" width={400} height={800} decoding="async" /> : null}
    </div>
  );
}
