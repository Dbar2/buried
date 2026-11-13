import './LanternToggle.css';

/**
 * Turns the Lantern on and off without holding a key (spec 03 requirement 13: touch, and people who cannot hold
 * Space). Shown at Today only, where the Lantern works; at other depths the status line says why it is not offered.
 */
export function LanternToggle({ pressed, onToggle }: { pressed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="lantern-toggle" aria-pressed={pressed} onClick={onToggle} data-testid="lantern-toggle">
      Lantern
    </button>
  );
}
