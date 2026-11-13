/**
 * Measures the landing's words against what is actually behind them (session 045). The intro's text is made transparent,
 * each line of it is screenshotted where it was, and the worst pixel under it is compared with the text colour.
 */
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { parseCssColour, worstContrast } from './contrast';

export type IntroContrast = { name: string; ratio: number; floor: number; colour: string };

const TARGETS = [
  { name: 'headline', selector: '.block-intro .block-headline' },
  { name: 'line', selector: '.block-intro .block-line' },
] as const;

/** The WCAG floor for body text, which design.md applies to the landing's words. */
export const TEXT_FLOOR = 4.5;

export async function introContrast(page: Page): Promise<IntroContrast[]> {
  const boxes = await page.evaluate((targets) => {
    return targets.flatMap(({ name, selector }) => {
      const el = document.querySelector(selector);
      if (!el) return [];
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()].filter((r) => r.width > 2 && r.height > 2).map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height }));
      return [{ name, colour: getComputedStyle(el).color, rects }];
    });
  }, TARGETS);
  const hide = await page.addStyleTag({ content: '.block-intro h1, .block-intro p { color: transparent !important; }' });
  const results: IntroContrast[] = [];
  try {
    for (const box of boxes) {
      const text = parseCssColour(box.colour);
      if (!text) throw new Error(`the ${box.name} has no solid colour: ${box.colour}`);
      let ratio = Infinity;
      for (const rect of box.rects) {
        const x = Math.max(0, Math.floor(rect.x));
        const y = Math.max(0, Math.floor(rect.y));
        const clip = { x, y, width: Math.ceil(rect.x + rect.width) - x, height: Math.ceil(rect.y + rect.height) - y };
        const png = PNG.sync.read(await page.screenshot({ clip }));
        ratio = Math.min(ratio, worstContrast(png, text).ratio);
      }
      results.push({ name: box.name, ratio, floor: TEXT_FLOOR, colour: box.colour });
    }
  } finally {
    await hide.evaluate((node) => (node as Element).remove());
  }
  return results;
}
