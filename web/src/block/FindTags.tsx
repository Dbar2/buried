import type { CSSProperties } from 'react';
import type { Placement, TagResult } from './tagLayout';

export type TagItem = { readonly id: string; readonly text: string };

type CommonProps = {
  items: readonly TagItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export type PinnedTagsProps = CommonProps & {
  mode: 'pinned';
  /** From `layoutTags`: one result per find. A hidden tag is not drawn (it stays in the top row and the list). */
  layout: readonly TagResult[];
};

export type TagRowProps = CommonProps & { mode: 'row' };

export type FindTagsProps = PinnedTagsProps | TagRowProps;

/**
 * The find tags, in two forms. `pinned`: paper tags on strings at the anchors, placed by `tagLayout`, over the
 * scene (they sit on the Still before the Player loads). `row`: the row along the top after the raise, one button
 * per find; on a phone it is one scrolling row. The selected tag is marked `aria-pressed`, and its edge is also
 * thicker (see block.css), so selection is never colour alone.
 */
export function FindTags(props: FindTagsProps) {
  if (props.mode === 'row') {
    return (
      <div className="tag-row" role="group" aria-label="Finds on this block" data-testid="tag-row">
        {props.items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="find-tag"
            aria-pressed={item.id === props.selectedId}
            data-testid={`tag-${item.id}`}
            onClick={() => props.onSelect(item.id)}
          >
            {item.text}
          </button>
        ))}
      </div>
    );
  }

  const placed = new Map<string, Placement>();
  for (const result of props.layout) if (result.placement !== 'hidden') placed.set(result.id, result.placement);
  return (
    <div className="tag-layer" data-testid="tag-layer">
      <svg className="tag-strings" aria-hidden="true" focusable="false">
        {[...placed.entries()].map(([id, p]) => (
          <g key={id} data-string-for={id}>
            <line x1={p.string.x1} y1={p.string.y1} x2={p.string.x2} y2={p.string.y2} />
            <circle cx={p.string.x1} cy={p.string.y1} r={3} />
          </g>
        ))}
      </svg>
      {props.items.map((item) => {
        const p = placed.get(item.id);
        if (!p) return null;
        const style: CSSProperties = { left: p.rect.x, top: p.rect.y, width: p.rect.w, height: p.rect.h };
        return (
          <button
            key={item.id}
            type="button"
            className="find-tag find-tag-pinned"
            style={style}
            aria-pressed={item.id === props.selectedId}
            data-testid={`pinned-${item.id}`}
            onClick={() => props.onSelect(item.id)}
          >
            {item.text}
          </button>
        );
      })}
    </div>
  );
}
