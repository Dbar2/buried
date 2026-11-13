import { useCallback, useState } from 'react';

/**
 * A line of help that shows until the visitor has used what it explains, then never again in this browser.
 * The flag is kept in localStorage, or in sessionStorage when `store` is `'session'` (it then comes back in a new
 * browser session). A browser that refuses storage shows the line every visit, which is harmless.
 */
export function useSeenOnce(key: string, store: 'local' | 'session' = 'local'): { seen: boolean; markSeen: () => void } {
  const storage = (): Storage => (store === 'session' ? window.sessionStorage : window.localStorage);
  const [seen, setSeen] = useState<boolean>(() => {
    try {
      return storage().getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const markSeen = useCallback(() => {
    setSeen(true);
    try {
      (store === 'session' ? window.sessionStorage : window.localStorage).setItem(key, '1');
    } catch {
      // Storage is refused: the flag lasts for this page only.
    }
  }, [key, store]);
  return { seen, markSeen };
}
