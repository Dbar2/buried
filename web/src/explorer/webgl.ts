/** WebGL 2 detection (spec 03 requirement 19.1). The Player needs WebGL 2 and nothing older. */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return canvas.getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

/**
 * Shown instead of the Player when there is no WebGL 2. Requirement 19.1 ends with "The map below
 * shows the same records."; the 2D map is task group 11, so that sentence is added with it. Saying
 * it now would promise a map that is not there.
 */
export const NO_WEBGL2_MESSAGE = 'This browser cannot show the 3D view (WebGL 2 is not available).';
