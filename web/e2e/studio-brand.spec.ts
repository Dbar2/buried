/**
 * The Studio's look (session 024): the scan dimmed toward mid-grey, `ink` outlines, the current
 * outline thicker with a mono tag, one primary button per panel filled `ink`, the active step and
 * nav item underlined in `lantern`. No new features: it opens a plate, extracts and screenshots.
 *
 * Run with `npm run test:e2e:studio` (playwright.studio.config.ts starts the Service). Needs the
 * plate rasters in data/raw/. Writes web/e2e/output/brand-studio.png.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const PLATE = 'fip_v3_1911_229';
const OUTPUT = fileURLToPath(new URL('./output/', import.meta.url));
const TOKENS = readFileSync(fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url)), 'utf8');
const rgb = (name: string): string => {
  const hex = new RegExp(`--${name}:\\s*#([0-9a-f]{6})`, 'i').exec(TOKENS)?.[1] as string;
  return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
};

test('the Studio restyle: parchment primary, lantern underline on the active step, 2 px controls', async ({ page }) => {
  test.setTimeout(240_000);
  mkdirSync(OUTPUT, { recursive: true });
  await page.goto('/studio');
  await page.getByTestId(`plate-${PLATE}`).click();
  await expect(page.getByTestId('region-readout')).toContainText('Region');

  // The extract panel's one primary: filled `ink` with dark text, a 2 px radius, no shadow.
  const primary = page.getByTestId('extract');
  await expect(primary).toBeEnabled();
  expect(await page.locator('.studio-side button.primary:not(:disabled)').count()).toBe(1);
  const style = await primary.evaluate((el) => {
    const s = getComputedStyle(el);
    return { background: s.backgroundColor, color: s.color, radius: s.borderTopLeftRadius, shadow: s.boxShadow };
  });
  expect(style).toEqual({ background: rgb('parchment'), color: rgb('ink'), radius: '2px', shadow: 'none' });

  await page.getByTestId('extract').click();
  const summary = page.locator('.proposal-list summary');
  await expect(summary).toContainText('All proposals');
  await expect(page.getByTestId('plate-canvas')).toHaveAttribute('data-drawn', /\d+/, { timeout: 30_000 });
  await summary.click();
  await page.locator('.proposal-list button').first().click();
  await page.keyboard.press('f');
  await page.waitForTimeout(500);

  // The header has no Studio link now (spec 06 W2); the active step is still underlined in `lantern`.
  await expect(page.getByTestId('nav-studio')).toHaveCount(0);
  const step = page.locator('.studio button[aria-current="step"]').first();
  expect(await step.evaluate((el) => getComputedStyle(el).borderBottomColor)).toBe(rgb('lantern'));

  // One primary button per panel.
  expect(await page.locator('.studio-side button.primary:not(:disabled)').count()).toBeLessThanOrEqual(1);

  // The plate's own labels are mono, and the Studio chrome has no `lantern` fill.
  expect(await page.locator('.plate-label').first().evaluate((el) => (getComputedStyle(el).fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim())).toBe('IBM Plex Mono');
  const lanternFills = await page.evaluate((lantern) => [...document.querySelectorAll('.studio *')].filter((el) => getComputedStyle(el).backgroundColor === lantern).length, rgb('lantern'));
  expect(lanternFills).toBe(0);

  await page.screenshot({ path: `${OUTPUT}brand-studio.png` });
});
