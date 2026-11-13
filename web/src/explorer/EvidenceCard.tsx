import { useEffect, useRef } from 'react';
import type { GateCard } from './gateCard';

/** Escape closes the card (requirement 11.5). */
export function isCloseKey(key: string): boolean {
  return key === 'Escape';
}

/** The id of a row's value element, for tests: "Read from" is "card-read-from". */
export function rowTestId(label: string): string {
  return `card-${label.toLowerCase().replace(/\s+/g, '-')}`;
}

/**
 * The gate evidence card: DOM text built by buildGateCard from the Evidence Library, on a `fog`
 * panel at the left edge of the view. The heading is Fraunces, the body Inter at 16 px, and ids,
 * years and the position figure are IBM Plex Mono. Escape or the close button closes it.
 */
export function EvidenceCard({ card, onClose }: { card: GateCard; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isCloseKey(event.key)) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, [card]);

  return (
    <section className="card" aria-label="Evidence" data-testid="evidence-card">
      <h2 data-testid="card-heading">{card.heading}</h2>
      <dl>
        {card.rows.map((row) => (
          <div key={row.label} className="card-row">
            <dt>{row.label}</dt>
            <dd className={row.mono ? 'mono' : undefined} data-testid={rowTestId(row.label)} title={row.title}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p>
        <button ref={closeRef} type="button" onClick={onClose}>
          Close
        </button>
      </p>
    </section>
  );
}
