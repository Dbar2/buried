/**
 * The visitor's workspace: an IndexedDB database in their own browser (spec 04 design "Workspace").
 * It is never committed and nothing in it is canon. Database `buried-workspace`, version 1, stores:
 *
 *   sources   source id → source record          files     path → { text, updated_at }
 *   images    source id → { jpeg, sidecar }      progress  source id → step and UI state
 *   seen      feature id → time first shown      settings  key → value (reviewer name, consents)
 *
 * `openWorkspace` returns null when IndexedDB is unavailable (private modes, blocked storage). The
 * callers then carry on without a workspace and say so; nothing here throws for that.
 */

export const DB_NAME = 'buried-workspace';
export const DB_VERSION = 1;
export const STORES = ['sources', 'files', 'images', 'progress', 'seen', 'settings'] as const;
export type StoreName = (typeof STORES)[number];

export type WorkspaceFile = { text: string; updated_at: string };

export interface WorkspaceDb {
  getFile(path: string): Promise<WorkspaceFile | undefined>;
  putFile(path: string, text: string, updatedAt: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  /** Paths that start with `prefix`, sorted. */
  listFiles(prefix: string): Promise<string[]>;
  getSetting<T = unknown>(key: string): Promise<T | undefined>;
  putSetting(key: string, value: unknown): Promise<void>;
  /** Feature ids already shown in the Explorer. */
  seenIds(): Promise<Set<string>>;
  markSeen(ids: readonly string[], at: string): Promise<void>;
  close(): void;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Open (and on first use create) the workspace database, or null when IndexedDB cannot be used. */
export async function openWorkspace(factory?: IDBFactory | null): Promise<WorkspaceDb | null> {
  const idb = factory === undefined ? (typeof indexedDB === 'undefined' ? null : indexedDB) : factory;
  if (idb === null) return null;

  let db: IDBDatabase;
  try {
    const opening = idb.open(DB_NAME, DB_VERSION);
    opening.onupgradeneeded = () => {
      const created = opening.result;
      for (const name of STORES) {
        if (!created.objectStoreNames.contains(name)) created.createObjectStore(name);
      }
    };
    db = await request(opening);
  } catch {
    return null;
  }

  return {
    async getFile(path) {
      return (await request(db.transaction('files').objectStore('files').get(path))) as WorkspaceFile | undefined;
    },
    async putFile(path, text, updatedAt) {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({ text, updated_at: updatedAt } satisfies WorkspaceFile, path);
      await finished(tx);
    },
    async deleteFile(path) {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(path);
      await finished(tx);
    },
    async listFiles(prefix) {
      const keys = (await request(db.transaction('files').objectStore('files').getAllKeys())) as string[];
      return keys.filter((k) => typeof k === 'string' && k.startsWith(prefix)).sort();
    },
    async getSetting<T>(key: string) {
      return (await request(db.transaction('settings').objectStore('settings').get(key))) as T | undefined;
    },
    async putSetting(key, value) {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(value, key);
      await finished(tx);
    },
    async seenIds() {
      const keys = (await request(db.transaction('seen').objectStore('seen').getAllKeys())) as string[];
      return new Set(keys.filter((k): k is string => typeof k === 'string'));
    },
    async markSeen(ids, at) {
      if (ids.length === 0) return;
      const tx = db.transaction('seen', 'readwrite');
      const store = tx.objectStore('seen');
      for (const id of ids) store.put(at, id);
      await finished(tx);
    },
    close() {
      db.close();
    },
  };
}
