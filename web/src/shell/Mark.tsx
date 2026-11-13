/**
 * The core-sample mark (design.md "Identity"): a circle holding four strata lines, drawn in thin
 * strokes of the current text colour. It is the header mark, the favicon (public/favicon.svg draws
 * the same lines) and the loading mark. No other logo exists.
 */
export function Mark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className ? `mark ${className}` : 'mark'}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      data-testid="mark"
    >
      <circle cx="16" cy="16" r="14.5" />
      <path d="M5 10.5h22M3.6 16h24.8M5 21.5h22M8.5 26.2h15" />
    </svg>
  );
}

/** The loading mark: the mark above a short line of text. Used where a page waits for its records. */
export function Loading({ text }: { text: string }) {
  return (
    <p className="loading-mark" role="status">
      <Mark size={20} />
      <span>{text}</span>
    </p>
  );
}
