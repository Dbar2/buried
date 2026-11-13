/**
 * WCAG 2 contrast measured on pixels (session 045). A browser check screenshots the page with its text made
 * transparent, so what is left is what the text sits on; the worst case (the brightest backdrop pixel under
 * light text) is compared with the text colour.
 */

export type Rgb = readonly [number, number, number];

const channel = (value: number): number => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance of an sRGB colour (0 to 255 per channel). */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The WCAG 2 contrast ratio of two luminances, in either order. */
export function contrastRatio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/** `rgb(...)` or `rgba(...)` as computed by a browser, or null. */
export function parseCssColour(text: string): Rgb | null {
  const m = /^rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

type Image = { width: number; height: number; data: Uint8Array | Uint8ClampedArray | Buffer };

/**
 * The lowest contrast of `text` against any pixel of the image: the pixel whose luminance is nearest the
 * text's. Pixels of a screenshot have no alpha worth reading, so only red, green and blue are used.
 */
export function worstContrast(image: Image, text: Rgb): { ratio: number; at: { x: number; y: number } } {
  const t = luminance(text);
  let worst = Infinity;
  let at = { x: 0, y: 0 };
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      const ratio = contrastRatio(t, luminance([image.data[i] as number, image.data[i + 1] as number, image.data[i + 2] as number]));
      if (ratio < worst) {
        worst = ratio;
        at = { x, y };
      }
    }
  }
  return { ratio: worst, at };
}
