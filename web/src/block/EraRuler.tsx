import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export type RulerStop = {
  /** An era id, passed back as it is. */
  readonly id: string;
  /** "Today", "1935", "1911". */
  readonly label: string;
  /** What a screen reader hears when the stop is chosen, for example "Now showing the 1911 plan". */
  readonly announcement: string;
};

export type EraRulerProps = {
  /** Left to right: Today, 1935, 1911. 1947 is not on this ruler (requirement 5.2). */
  stops: readonly RulerStop[];
  value: string;
  onChange: (id: string) => void;
};

/** The stop a key leads to, or null for any other key. Left and Right stop at the ends. Pure. */
export function stopIndexForKey(index: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowLeft') return Math.max(0, index - 1);
  if (key === 'ArrowRight') return Math.min(count - 1, index + 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** Tick marks every 5 units across a 0 to 200 scale, a long one at each of the three stops. */
const TICKS = Array.from({ length: 41 }, (_, i) => i * 5);

/**
 * The era ruler: a surveyor's scale bar with three stops, not a slider. It is a radio group (roving tabindex), so
 * Left and Right move between stops and Tab moves on. Choosing a stop is announced politely.
 */
export function EraRuler({ stops, value, onChange }: EraRulerProps) {
  const [announcement, setAnnouncement] = useState('');
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, stops.findIndex((stop) => stop.id === value));

  const choose = (index: number) => {
    const stop = stops[index];
    if (!stop) return;
    buttons.current[index]?.focus();
    if (stop.id !== value) {
      setAnnouncement(stop.announcement);
      onChange(stop.id);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = stopIndexForKey(current, event.key, stops.length);
    if (next === null) return;
    event.preventDefault();
    choose(next);
  };

  return (
    <div className="era-ruler" role="radiogroup" aria-label="Date shown" onKeyDown={onKeyDown} data-testid="era-ruler">
      <svg className="ruler-scale" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path className="ruler-ticks" d={TICKS.map((x) => `M${x} ${x % 100 === 0 ? 0 : 5}V10`).join('')} />
        <path className="ruler-base" d="M0 9.5H200" />
      </svg>
      {stops.map((stop, i) => (
        <button
          key={stop.id}
          ref={(el) => {
            buttons.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === current}
          tabIndex={i === current ? 0 : -1}
          className="ruler-stop"
          data-testid={`ruler-${stop.id}`}
          onClick={() => choose(i)}
        >
          <span className="ruler-mark" aria-hidden="true" />
          <span className="ruler-label">{stop.label}</span>
        </button>
      ))}
      <p className="visually-hidden" role="status" aria-live="polite" data-testid="ruler-status">
        {announcement}
      </p>
    </div>
  );
}
