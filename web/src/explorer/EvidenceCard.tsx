import { useEffect, useRef } from 'react';
import type { GateCard } from './gateCard';

/**
 * The gate evidence card: DOM text built by buildGateCard from the Evidence Library. Escape or the
 * close button closes it (requirement 11.5).
 */
export function EvidenceCard({ card, onClose }: { card: GateCard; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
  }, [card]);

  return (
    <section className="card" aria-label="Evidence" data-testid="evidence-card">
      <h2>{card.heading}</h2>
      <dl>
        {card.rows.map((row) => (
          <div key={row.label} style={{ display: 'contents' }}>
            <dt>{row.label}</dt>
            <dd className={row.mono ? 'mono' : undefined} data-testid={`card-${row.label.toLowerCase().replace(/\s+/g, '-')}`}>
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
