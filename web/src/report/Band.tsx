import type { Band as BandModel } from './coreSample';
import { RichText } from './richText';

export type BandProps = {
  band: BandModel;
  /** On the Report route a band links to the live view at its era and lot. */
  href?: string;
  /** In a panel beside the Explorer a band moves the Explorer to its era. */
  onSelect?: (eraId: string) => void;
};

/** One band of the core sample: the era's label, then what its records show at the lot. */
export function Band({ band, href, onSelect }: BandProps) {
  const title = <span className="band-label">{band.label}</span>;
  return (
    <li className="band" data-era={band.eraId} data-testid={`band-${band.eraId}`}>
      <h3>
        {onSelect ? (
          <button type="button" onClick={() => onSelect(band.eraId)} data-testid={`band-select-${band.eraId}`}>
            {title}
          </button>
        ) : href ? (
          <a href={href} data-testid={`band-link-${band.eraId}`}>
            {title}
          </a>
        ) : (
          title
        )}
      </h3>
      {band.sentences.map((s, i) => (
        <p key={i}>
          <RichText text={s.text} />
        </p>
      ))}
    </li>
  );
}
