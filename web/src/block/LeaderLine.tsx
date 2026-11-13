import type { LeaderLine as LeaderGeometry } from './tagLayout';

export type LeaderLineProps = {
  /** From `leaderLine()`: null hides the line (no card, a phone, an anchor off screen or under the card). */
  line: LeaderGeometry | null;
};

/**
 * The thin `--lantern` line from the selected find's anchor to the card's left edge. It draws no text and takes no
 * pointer events; the card carries everything it points at.
 */
export function LeaderLine({ line }: LeaderLineProps) {
  if (!line) return null;
  return (
    <svg className="leader-line" aria-hidden="true" focusable="false" data-testid="leader-line">
      <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
      <circle cx={line.x1} cy={line.y1} r={4} />
    </svg>
  );
}
