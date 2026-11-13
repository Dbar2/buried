import type { KeyboardEvent } from 'react';
import type { EraInfo } from './eraOrder';

/**
 * The depth gauge (design.md "Layout", requirements 17.1 and 17.2): a DOM slider on the right edge
 * with one stop per project era, Today at the top. Up goes to the shallower era, Down to the deeper
 * one, Home to Today and End to the earliest era. Integer steps only, a hard switch: the tween, drag
 * and wheel come with task 3.1. Colour is never the only mark: the current stop has a filled bar and
 * a heavier label.
 */

/** The era index a key moves to, or null when the key is not a gauge key or nothing changes. */
export function nextIndexForKey(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  let target: number;
  switch (key) {
    case 'ArrowUp':
      target = index - 1;
      break;
    case 'ArrowDown':
      target = index + 1;
      break;
    case 'Home':
      target = 0;
      break;
    case 'End':
      target = count - 1;
      break;
    default:
      return null;
  }
  target = Math.min(Math.max(target, 0), count - 1);
  return target === index ? null : target;
}

/** What a screen reader hears when the gauge reaches an era (requirement 10.7). */
export function announcementFor(era: Pick<EraInfo, 'label'> | undefined): string {
  return era ? `Now showing ${era.label}` : '';
}

/** The short text for a stop: the year, in the mono face, for a dated era; the label for Today. */
export function stopText(era: Pick<EraInfo, 'id' | 'label'>): { text: string; mono: boolean } {
  return /^\d{4}$/.test(era.id) ? { text: era.id, mono: true } : { text: era.label, mono: false };
}

export type DepthGaugeProps = {
  /** Every era, Today first. */
  eras: readonly EraInfo[];
  /** The current era index. */
  index: number;
  onChange: (index: number) => void;
};

export function DepthGauge({ eras, index, onChange }: DepthGaugeProps) {
  const current = eras.find((era) => era.index === index);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = nextIndexForKey(event.key, index, eras.length);
    if (target === null) return;
    event.preventDefault();
    onChange(target);
  };

  return (
    <div
      className="depth-gauge"
      role="slider"
      tabIndex={0}
      aria-label="Depth"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={Math.max(eras.length - 1, 0)}
      aria-valuenow={index}
      aria-valuetext={current?.label ?? ''}
      onKeyDown={onKeyDown}
      data-testid="depth-gauge"
    >
      {eras.map((era) => {
        const { text, mono } = stopText(era);
        return (
          <button
            key={era.id}
            type="button"
            tabIndex={-1}
            className="depth-stop"
            aria-current={era.index === index ? 'true' : undefined}
            title={era.label}
            data-testid={`era-${era.id}`}
            onClick={() => onChange(era.index)}
          >
            <span className="depth-mark" aria-hidden="true" />
            <span className={mono ? 'depth-year' : 'depth-label'}>{text}</span>
          </button>
        );
      })}
    </div>
  );
}
