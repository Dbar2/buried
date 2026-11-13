/**
 * The palette tokens, read from the CSS custom properties (src/styles/tokens.css) so that canvas
 * drawing uses the same values as the page and no hex value appears in a component.
 */
export type Tokens = {
  night: string;
  fog: string;
  present: string;
  ink: string;
  lantern: string;
  text: string;
  muted: string;
};

const NAMES = ['night', 'fog', 'present', 'ink', 'lantern', 'text', 'muted'] as const;

export function readTokens(root: Element = document.documentElement): Tokens {
  const style = getComputedStyle(root);
  const out = {} as Record<(typeof NAMES)[number], string>;
  for (const name of NAMES) out[name] = style.getPropertyValue(`--${name}`).trim();
  return out;
}

/** `colour` at `alpha` (0 to 1). Accepts the `#rrggbb` form the tokens use. */
export function withAlpha(colour: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(colour);
  if (!m) return colour;
  return `rgba(${parseInt(m[1] as string, 16)}, ${parseInt(m[2] as string, 16)}, ${parseInt(m[3] as string, 16)}, ${alpha})`;
}
