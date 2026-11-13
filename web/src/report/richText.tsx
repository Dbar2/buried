import type { ReactNode } from 'react';

/**
 * Sentence text with its ids, years and figures set in IBM Plex Mono (design.md "Type"). Only the
 * look changes; the words are exactly the sentence's.
 */
const MONO = /([a-z][a-z0-9]*(?:_[a-z0-9]+)+|\b\d{4}(?:[–-]\d{2,4})?\b|\b\d+(?:\.\d+)? m\b)/g;

export function RichText({ text }: { text: string }): ReactNode {
  const parts = text.split(MONO);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="mono">
        {part}
      </span>
    ) : (
      part
    ),
  );
}
