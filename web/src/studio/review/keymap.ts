/**
 * Review keys (spec 04 design "Keys", the part this slice builds). Pure: a key event goes in, a
 * command or null comes out. Keys are inactive in a text field, so typing a use or a name never
 * decides a proposal.
 */

export type ReviewCommand = 'accept' | 'reject' | 'next' | 'previous' | 'fit' | 'undo' | 'redo';

type TargetLike = { tagName?: string; isContentEditable?: boolean; getAttribute?(name: string): string | null };

export type KeyLike = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  /** The element the key went to (a DOM event target, or a plain object in tests). */
  target?: unknown;
};

export function isTextEntry(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const target = raw as TargetLike;
  const tag = (target.tagName ?? '').toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = (target.getAttribute?.('type') ?? 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(type);
  }
  return target.isContentEditable === true;
}

export function reviewCommand(event: KeyLike): ReviewCommand | null {
  if (isTextEntry(event.target) || event.altKey) return null;
  const mod = event.ctrlKey === true || event.metaKey === true;
  const key = event.key.toLowerCase();
  if (mod) {
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    return null;
  }
  switch (key) {
    case 'a':
      return 'accept';
    case 'r':
      return 'reject';
    case 'j':
    case 'arrowright':
    case 'arrowdown':
      return 'next';
    case 'k':
    case 'arrowleft':
    case 'arrowup':
      return 'previous';
    case 'f':
      return 'fit';
    case 'u':
      return 'undo';
    default:
      return null;
  }
}
