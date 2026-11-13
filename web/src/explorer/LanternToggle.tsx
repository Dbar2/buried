import './LanternToggle.css';

/**
 * Turns the Lantern on and off without holding a key (spec 03 requirement 13: touch, and people who cannot hold
 * Space). Shown at Today only, where the Lantern works; at other depths the status line says why it is not offered.
 * Each word of the label is kept whole, so a narrow control wraps between words ("Lantern:" / "1931-35 plan"),
 * never inside a year range. The text is still the one label.
 */
export function LanternToggle({ pressed, onToggle, label = 'Lantern' }: { pressed: boolean; onToggle: () => void; label?: string }) {
  const words = label.split(' ');
  return (
    <button type="button" className="lantern-toggle" aria-pressed={pressed} onClick={onToggle} data-testid="lantern-toggle">
      {words.map((word, i) => (
        <span key={i}>
          {i > 0 ? ' ' : ''}
          <span className="lantern-toggle-word">{word}</span>
        </span>
      ))}
    </button>
  );
}
