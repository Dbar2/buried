import { useState } from 'react';
import { Band } from './Band';
import type { Report, ReportModel, SourceEntry } from './buildReport';
import * as copy from './copy';
import { FindingItem } from './FindingItem';
import type { Group } from './findings';
import { liveLink } from './links';
import { moreFindingsText, printSplit } from './printModel';
import { RichText } from './richText';
import './report.css';
import './report.print.css';

export type ReportViewProps = {
  model: ReportModel;
  /** Set when the Report is a panel beside the Explorer: a band then moves the Explorer to its era. */
  onBandSelect?: (eraId: string) => void;
};

/**
 * The Report as semantic HTML on the light paper theme (spec 05 requirement 16). The first line is
 * "Buried screens; it doesn't certify.". Status and confidence are text first; dates, ids and
 * figures are set in IBM Plex Mono. The view only lays out the model; it decides nothing.
 */
export function ReportView({ model, onBandSelect }: ReportViewProps) {
  if (model.kind === 'not_reconstructed') {
    return (
      <article className="report" data-testid="report-not-reconstructed">
        <p className="report-screens">{copy.SCREENS_LINE}</p>
        <p className="report-lead">{model.text}</p>
      </article>
    );
  }
  if (model.kind === 'failed') {
    return (
      <article className="report" data-testid="report-failed" role="alert">
        <p className="report-screens">{copy.SCREENS_LINE}</p>
        <p className="report-lead">{model.text}</p>
        {model.place && (
          <p>
            Lot <span className="mono">{model.place}</span>
          </p>
        )}
      </article>
    );
  }
  return <FullReport report={model} onBandSelect={onBandSelect} />;
}

function FullReport({ report, onBandSelect }: { report: Report; onBandSelect: ((eraId: string) => void) | undefined }) {
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(report.links.share);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  const lotId = report.place.lotId;

  return (
    <article className="report" data-testid="report" aria-labelledby="report-title">
      <p className="report-screens" data-testid="screens-line">
        {report.screensLine.text}
      </p>
      <h1 id="report-title">{report.title.text}</h1>
      {report.recordsChanged && (
        <p role="status" className="report-note" data-testid="records-changed">
          {report.recordsChanged.text}
        </p>
      )}

      <section aria-labelledby="report-place">
        <h2 id="report-place">{copy.SECTION_HEADINGS.place}</h2>
        {report.place.sentences.map((s, i) => (
          <p key={i}>
            <RichText text={s.text} />
          </p>
        ))}
      </section>

      <section aria-labelledby="report-core">
        <h2 id="report-core">{copy.SECTION_HEADINGS.coreSample}</h2>
        <ol className="bands">
          {report.coreSample.map((band) => (
            <Band key={band.eraId} band={band} onSelect={onBandSelect} href={onBandSelect ? undefined : liveLink('', lotId, band.eraId)} />
          ))}
        </ol>
      </section>

      {report.groups.map((g) => (
        <GroupSection key={g.id} group={g} />
      ))}

      {report.workspace && (
        <section aria-labelledby="report-workspace" className="workspace-section print-limited" data-testid="workspace-section">
          <h2 id="report-workspace">{copy.SECTION_HEADINGS.workspace}</h2>
          <p>{report.workspace.line.text}</p>
          {report.workspace.groups
            .filter((g) => g.findings.length > 0)
            .map((g) => (
              <GroupSection key={g.id} group={g} level={3} idPrefix="ws-" label="Your workspace" />
            ))}
        </section>
      )}

      <section aria-labelledby="report-cannot">
        <h2 id="report-cannot">{copy.SECTION_HEADINGS.cannotTell}</h2>
        {report.cannotTell.map((s, i) => (
          <p key={i}>
            <RichText text={s.text} />
          </p>
        ))}
        {report.cannotTellLink && (
          <p>
            <a href={report.cannotTellLink.url}>{report.cannotTellLink.text}</a> <span className="mono small">{report.cannotTellLink.url}</span>
          </p>
        )}
      </section>

      <section aria-labelledby="report-dig">
        <h2 id="report-dig">{copy.SECTION_HEADINGS.beforeYouDig}</h2>
        {report.beforeYouDig.map((s, i) => (
          <p key={i}>{s.text}</p>
        ))}
        <p>
          <a href={report.beforeYouDigLink.url}>{report.beforeYouDigLink.text}</a> <span className="mono small">{report.beforeYouDigLink.url}</span>
        </p>
      </section>

      <section aria-labelledby="report-sources" className="sources-block">
        <h2 id="report-sources">{copy.SECTION_HEADINGS.sources}</h2>
        <ul className="source-list">
          {report.sources.map((s) => (
            <SourceItem key={s.id} source={s} />
          ))}
        </ul>
        <p className="small">
          Data version <span className="mono">{report.dataVersion.slice(0, 12) || 'unknown'}</span>
        </p>
      </section>

      <section aria-label="Links" className="report-links">
        <p>
          <a href={report.links.live} data-testid="live-link">
            Open this lot in the live view
          </a>
          <span className="print-only"> <span className="mono small">{report.links.live}</span></span>
        </p>
        <p>
          Share link: <a className="mono small" href={report.links.share} data-testid="share-link">{report.links.share}</a>
        </p>
        <div className="report-actions no-print">
          <button type="button" onClick={() => window.print()} data-testid="print">
            Print or save as PDF
          </button>
          <button type="button" onClick={copyLink} data-testid="copy-link">
            Copy share link
          </button>
          <span role="status" className="small">
            {copied ? 'Link copied.' : ''}
          </span>
        </div>
      </section>
    </article>
  );
}

function GroupSection({ group, level = 2, idPrefix = '', label }: { group: Group; level?: 2 | 3; idPrefix?: string; label?: string }) {
  const { shown, hiddenCount } = printSplit(group.findings);
  const Heading = level === 2 ? 'h2' : 'h3';
  const headingId = `${idPrefix}group-${group.id}`;
  return (
    <section aria-labelledby={headingId} className="group print-limited" data-testid={`group-${group.id}`}>
      <Heading id={headingId}>{group.heading}</Heading>
      {label && <p className="small workspace-label">{label}</p>}
      <ul className="findings">
        {group.findings.map((f, i) => (
          <FindingItem key={`${f.sortKey.featureId}-${i}`} finding={f} printExtra={i >= shown.length} />
        ))}
      </ul>
      {hiddenCount > 0 && <p className="print-only print-more">{moreFindingsText(hiddenCount)}</p>}
      {group.nextStep && (
        <p className="next-step" data-testid="next-step">
          {group.nextStep.map((s) => s.text).join(' ')}
        </p>
      )}
    </section>
  );
}

function SourceItem({ source }: { source: SourceEntry }) {
  return (
    <li>
      <span className="mono">{source.id}</span>
      <span className="source-title">, {source.title}</span>, <span className="mono">{source.years}</span>. {source.licenceNote} {source.attributionLine}{' '}
      <span className="mono small source-url">{source.url}</span>
    </li>
  );
}
