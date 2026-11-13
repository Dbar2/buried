import { statusLabel } from '../evidence';
import type { FindingStatus } from '../evidence';
import type { ConfidenceEntry } from './findings';

/**
 * A finding's status, always as text, with a line pattern as well (design.md "Confidence encoding"):
 * solid for Documented, dashed for Estimated, dotted for the two "nothing" statuses. Never colour
 * alone, and the Report theme has no colour to rely on.
 */
export function StatusBadge({ status }: { status: FindingStatus }) {
  const pattern = status === 'documented' ? 'solid' : status === 'estimated' ? 'dashed' : 'dotted';
  return (
    <span className={`status-badge status-${pattern}`} data-status={status} data-testid="status">
      {statusLabel(status)}
    </span>
  );
}

/** The confidence class with its label and its reason beside it. */
export function ConfidenceBadge({ entry }: { entry: ConfidenceEntry }) {
  return (
    <span className={`confidence-badge status-${entry.pattern}`} data-testid="confidence">
      {entry.pattern === 'dotted' ? '? ' : ''}
      {entry.label}
    </span>
  );
}
