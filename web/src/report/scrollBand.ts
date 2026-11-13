/**
 * Scrolling the core sample to the band the scene is showing (session 029). Only the report column
 * is scrolled, and only when it is its own scroll container and the band is not fully in view: on a
 * narrow screen the report sits below the scene and the page scrolls, and moving the page would take
 * the scene out of sight while the visitor digs.
 */

/** The `scrollTop` that centres the band in the container, or null when nothing should move. */
export function bandScrollTop(box: {
  containerTop: number;
  containerHeight: number;
  scrollHeight: number;
  scrollTop: number;
  bandTop: number;
  bandHeight: number;
}): number | null {
  if (box.scrollHeight <= box.containerHeight + 1) return null;
  const bandTop = box.bandTop - box.containerTop;
  const bandBottom = bandTop + box.bandHeight;
  if (bandTop >= 0 && bandBottom <= box.containerHeight) return null;
  const wanted = box.scrollTop + bandTop - Math.max(0, (box.containerHeight - box.bandHeight) / 2);
  const top = Math.min(Math.max(wanted, 0), box.scrollHeight - box.containerHeight);
  return Math.abs(top - box.scrollTop) < 1 ? null : top;
}

export function scrollBandIntoView(container: HTMLElement, band: HTMLElement, reducedMotion: boolean): boolean {
  const c = container.getBoundingClientRect();
  const b = band.getBoundingClientRect();
  const top = bandScrollTop({
    containerTop: c.top,
    containerHeight: container.clientHeight,
    scrollHeight: container.scrollHeight,
    scrollTop: container.scrollTop,
    bandTop: b.top,
    bandHeight: b.height,
  });
  if (top === null) return false;
  container.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' });
  return true;
}
