import { statusLabel } from '../evidence';
import { ConfidenceBadge, StatusBadge } from './StatusBadge';
import type { ReportFinding } from './findings';
import { RichText } from './richText';

/**
 * One finding. A finding with evidence shows its status badge, its sentences and the confidence
 * class. A finding that says "nothing" or "not covered" is one plain line: the status in words, what
 * was checked and the records and years looked at. Source ids sit in the small sources line and in
 * `title` text, not in the sentences.
 */
export function FindingItem({ finding, printExtra }: { finding: ReportFinding; printExtra?: boolean }) {
  const f = finding.finding;
  const isChecked = f.status === 'nothing_found' || f.status === 'not_covered';
  const className = `finding${isChecked ? ' finding-checked' : ''}${printExtra ? ' print-extra' : ''}`;

  if (isChecked) {
    return (
      <li className={className} data-status={f.status} data-testid="finding">
        <p className="finding-sentence" data-testid="checked-records" title={`Records checked: ${f.checked.map((c) => c.sourceId).join(', ')}`}>
          <span className="status-text">{statusLabel(f.status)}.</span>{' '}
          {finding.sentences.map((s, i) => (
            <span key={i}>
              {i > 0 ? ' ' : ''}
              <RichText text={s.text} />
            </span>
          ))}
        </p>
        <p className="finding-sources small">
          Sources: <span className="mono">{f.sourceIds.join(', ')}</span>
        </p>
      </li>
    );
  }

  return (
    <li className={className} data-status={f.status} data-testid="finding">
      <p className="finding-head">
        <StatusBadge status={f.status} />
        {finding.confidence.some((c) => c.label !== statusLabel(f.status)) && (
          <>
            {' '}
            {finding.confidence.map((c) => (
              <ConfidenceBadge key={`${c.label}|${c.reason}`} entry={c} />
            ))}
          </>
        )}
      </p>
      {finding.sentences.map((s, i) => (
        <p key={i} className="finding-sentence">
          <RichText text={s.text} />
        </p>
      ))}
      <p className="finding-sources small">
        Sources: <span className="mono">{f.sourceIds.join(', ')}</span>
      </p>
    </li>
  );
}
