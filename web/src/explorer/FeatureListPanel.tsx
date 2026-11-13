import type { FeatureRow } from './featureList';

export type FeatureListProps = {
  rows: readonly FeatureRow[];
  eraLabel: string;
  open: boolean;
  onToggle: () => void;
  /** Choosing a row opens that feature's card. */
  onChoose: (featureId: string) => void;
  selectedId: string | null;
  /** The toggle's label while the list is closed; the default counts the features. The Block page says "List". */
  closedLabel?: string;
};

/**
 * The features of the era on screen as text, reachable with Tab. The toggle says how many there are;
 * each row is a button that opens the feature's card, the keyboard path to what a click on a ghost
 * does.
 */
export function FeatureList({ rows, eraLabel, open, onToggle, onChoose, selectedId, closedLabel }: FeatureListProps) {
  return (
    <div className="feature-list" data-testid="feature-list">
      <button type="button" className="feature-list-toggle" aria-expanded={open} aria-controls="feature-list-panel" onClick={onToggle} data-testid="feature-list-toggle">
        {open ? 'Hide the list' : (closedLabel ?? `List the features (${rows.length})`)}
      </button>
      {open && (
        <section id="feature-list-panel" className="feature-list-panel" aria-label={`Features shown in ${eraLabel}`} data-testid="feature-list-panel">
          {rows.length === 0 ? (
            <p data-testid="feature-list-empty">Nothing is drawn for {eraLabel}.</p>
          ) : (
            <ul>
              {rows.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => onChoose(row.id)} aria-current={row.id === selectedId ? 'true' : undefined} data-testid={`feature-row-${row.id}`}>
                    <span className="feature-name">{row.name}</span>
                    {row.workspace && (
                      <span className="feature-meta feature-origin" data-testid="feature-origin">
                        From your workspace
                      </span>
                    )}
                    <span className="feature-meta">
                      {row.confidenceLabel}
                      {row.dates ? `. ${row.dates}` : ''}
                    </span>
                    <span className="feature-meta mono">{row.position}</span>
                    {row.status && <span className="feature-meta">{row.status}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
