import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';

/** Commit a text or number field on Enter or when it loses focus, then give the keys back to the review. */
export function useDraft(value: string, commit: (draft: string) => void, key: string) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value, key]);
  return {
    value: draft,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    onBlur: () => {
      if (draft !== value) commit(draft);
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') {
        setDraft(value);
        event.currentTarget.blur();
      }
    },
  };
}
