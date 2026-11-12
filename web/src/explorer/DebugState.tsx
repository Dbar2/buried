import type { PlayerState } from './playerState';

/**
 * Only rendered with ?debug=1. The gate test reads this element's text instead of a global, so the
 * test needs no channel into the page besides the DOM. Hidden from sight with CSS, not removed.
 */
export function DebugState({ depth, player }: { depth: number; player: PlayerState }) {
  return (
    <pre className="debug-state" data-testid="debug-state">
      {JSON.stringify({ depth, ...player })}
    </pre>
  );
}
