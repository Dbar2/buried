import { useCallback, useState } from 'react';

/**
 * A line of help that shows until the visitor has used what it explains, then never again in this browser.
 * The flag is kept in localStorage; a browser that refuses storage shows the line every visit, which is harmless.
 */
export function useSeenOnce(key: string): { seen: boolean; markSeen: () => void } {
  const [seen, setSeen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const markSeen = useCallback(() => {
    setSeen(true);
    try {
      window.localStorage.setItem(key, '1');
    } catch {
      // Storage is refused: the flag lasts for this page only.
    }
  }, [key]);
  return { seen, markSeen };
}
