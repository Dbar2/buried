import { useEffect, useRef, useState } from 'react';
import { Band } from './Band';
import type { Report, ReportModel, SourceEntry } from './buildReport';
import * as copy from './copy';
import { FindingItem } from './FindingItem';
import type { Group } from './findings';
import { liveLink } from './links';
import { moreFindingsText, printSplit } from './printModel';
import { RichText } from './richText';
import { scrollBandIntoView } from './scrollBand';
import './report.css';
import './report.print.css';

export type ReportViewProps = {
  model: ReportModel;
  /** Set when the Report is a panel beside the Explorer: a band then moves the Explorer to its era. */
  onBandSelect?: (eraId: string) => void;
  /** The era the scene is showing. Its band is marked and, in a scrolling report column, scrolled into view. */
  activeEraId?: string | null;
};

/**
 * The Report as semantic HTML on the light paper theme (spec 05 requirement 16). The first line is
 * "Buried screens; it doesn't certify.". Status and confidence are text first; dates, ids and
 * figures are set in IBM Plex Mono. The view only lays out the model; it decides nothing.
 */
export function ReportView({ model, onBandSelect, activeEraId = null }: ReportViewProps) {
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
  return <FullReport report={model} onBandSelect={onBandSelect} activeEraId={activeEraId} />;
}

function FullReport({
  report,
  onBandSelect,
  activeEraId,
}: {
  report: Report;
  onBandSelect: ((eraId: string) => void) | undefined;
  activeEraId: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const bandList = useRef<HTMLOListElement>(null);
  const shown = useRef<string | null>(null);
  // The band for the era on screen comes into view when the era changes, not when the page opens.
  useEffect(() => {
    const first = shown.current === null;
    shown.current = activeEraId;
    if (first || activeEraId === null) return;
    const band = bandList.current?.querySelector<HTMLElement>(`[data-era="${CSS.escape(activeEraId)}"]`);
    const container = bandList.current?.closest<HTMLElement>('.report-scroll');
    if (!band || !container || typeof container.scrollTo !== 'function') return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scrollBandIntoView(container, band, reduced);
  }, [activeEraId]);
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
      <h1 id="report-title">{report.place.heading.text}</h1>
      <p className="report-subtitle" data-testid="report-subtitle">
        {report.title.text}
      </p>
      {report.recordsChanged && (
        <p role="status" className="report-note" data-testid="records-changed">
          {report.recordsChanged.text}
        </p>
      )}

      <div className="report-summary" data-testid="report-summary">
        {report.summary.map((s, i) => (
          <span key={i}>
            {i > 0 ? ' ' : ''}
            <RichText text={s.text} />
          </span>
        ))}
      </div>
      {report.coverage.length > 0 && (
        <p className="report-coverage print-extra" data-testid="report-coverage">
          {report.coverage.map((s) => s.text).join(' ')}
        </p>
      )}

      <section aria-labelledby="report-core">
        <h2 id="report-core">{copy.SECTION_HEADINGS.coreSample}</h2>
        <ol className="bands" ref={bandList}>
          {report.coreSample.map((band) => (
            <Band
              key={band.eraId}
              band={band}
              sources={report.sources}
              onSelect={onBandSelect}
              href={onBandSelect ? undefined : liveLink('', lotId, band.eraId)}
              active={activeEraId === band.eraId}
            />
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
        <p className="small" data-testid="report-lot">
          City property lot <span className="mono">{lotId}</span>. Data version <span className="mono">{report.dataVersion.slice(0, 12) || 'unknown'}</span>.
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
          <button type="button" className="primary" onClick={() => window.print()} data-testid="print">
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
