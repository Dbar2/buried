import { useEffect, useState } from 'react';
import { AERIAL_DIR, IMAGINED_DIR, parseImagined, parsePhotos } from './photos';
import type { ImaginedView, Photo } from './photos';

export type Pictures = { status: 'pending' | 'ready' | 'failed'; photos: Photo[]; views: ImaginedView[]; how: string };

export const NO_PICTURES: Pictures = { status: 'pending', photos: [], views: [], how: '' };

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

let photosOnce: Promise<Photo[]> | null = null;
let imaginedOnce: Promise<{ views: ImaginedView[]; how: string }> | null = null;

/** The photograph index: about 2 KB. Read once. A failure is an empty list, never an error on screen. */
export function loadPhotos(): Promise<Photo[]> {
  photosOnce ??= getJson(`${AERIAL_DIR}/aerial.json`).then(parsePhotos, () => []);
  return photosOnce;
}

/** The imagined-view index: about 5 KB. Read once. */
export function loadImagined(): Promise<{ views: ImaginedView[]; how: string }> {
  imaginedOnce ??= getJson(`${IMAGINED_DIR}/imagined.json`).then(parseImagined, () => ({ views: [], how: '' }));
  return imaginedOnce;
}

/**
 * The two picture indexes, read once `enabled` is true (the Result's text is on screen). Only the small JSON files
 * are read here; the pictures themselves are requested by whatever draws them, after the plan tile has loaded.
 */
export function usePictures(enabled: boolean): Pictures {
  const [pictures, setPictures] = useState<Pictures>(NO_PICTURES);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    Promise.all([loadPhotos(), loadImagined()])
      .then(([photos, imagined]) => {
        if (!cancelled) setPictures({ status: 'ready', photos, views: imagined.views, how: imagined.how });
      })
      .catch(() => {
        if (!cancelled) setPictures({ status: 'failed', photos: [], views: [], how: '' });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return pictures;
}
