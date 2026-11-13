import { statusLabel } from '../evidence';
import { ConfidenceBadge, StatusBadge } from './StatusBadge';
import type { ReportFinding } from './findings';
import { RichText } from './richText';

/** One finding: status label, its sentences, the confidence class, and for "nothing" the records checked. */
export function FindingItem({ finding, printExtra }: { finding: ReportFinding; printExtra?: boolean }) {
  const f = finding.finding;
  // A "nothing" finding's sentences are the headline, "Records checked:" and one line per record
  // (id, years, coverage wording). The lines come out as a list.
  const [head, , ...recordLines] = finding.sentences;
  const isChecked = f.status === 'nothing_found' || f.status === 'not_covered';
  const body = isChecked ? [head] : finding.sentences;
  return (
    <li className={`finding${printExtra ? ' print-extra' : ''}`} data-status={f.status} data-testid="finding">
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
      {body.map((s, i) => (
        <p key={i} className="finding-sentence">
          <RichText text={s?.text ?? ''} />
        </p>
      ))}
      {isChecked && recordLines.length > 0 && (
        <>
          <p className="finding-sentence">Records checked:</p>
          <ul className="checked" data-testid="checked-records">
            {recordLines.map((s, i) => (
              <li key={i}>
                <RichText text={s.text} />
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="finding-sources small">
        Sources: <span className="mono">{f.sourceIds.join(', ')}</span>
      </p>
    </li>
  );
}
