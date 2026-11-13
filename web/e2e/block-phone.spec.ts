/**
 * The Block page on a phone, with the real Player (spec 06 W12, requirement 11.1): 390 by 844, a touch screen. Tagged
 * `@unity`; it needs the Unity build and runs in the main suite (see block.spec.ts). Not run in session 042.
 *
 *   npx playwright test -c playwright.block.config.ts e2e/block-phone.spec.ts
 *
 * Screenshots go to web/e2e/output/block-phone-*.png.
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { cropLoaded, stillLoaded } from './support/cropLoaded';
import { introContrast } from './support/introContrast';

const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), 'output');
const PLAYER_TIMEOUT = 180_000;

test.beforeAll(() => mkdirSync(OUTPUT, { recursive: true }));
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test.describe('@unity the Block page on a phone', { tag: '@unity' }, () => {
  test('the tall Still, the raise, the sheet that peeks and opens, tags in one scrolling row, no leader line', async ({ page }) => {
    test.setTimeout(PLAYER_TIMEOUT + 60_000);
    await page.goto('/');
    await expect(page.getByTestId('still')).toHaveAttribute('data-kind', 'tall');
    await stillLoaded(page);
    await expect(page.getByTestId('raise-button')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'nothing scrolls sideways').toBe(true);
    await page.screenshot({ path: join(OUTPUT, 'block-phone-landing.png') });
    const contrast = await introContrast(page);
    for (const c of contrast) expect(c.ratio, `the ${c.name} against what is behind it`).toBeGreaterThanOrEqual(c.floor);
    expect(contrast.length).toBe(2);

    await page.getByTestId('raise-button').tap();
    await expect(page.getByTestId('block-page')).toHaveAttribute('data-phase', 'raised', { timeout: PLAYER_TIMEOUT });
    await expect(page.getByTestId('sheet-peek')).toContainText('Glove & Overall Factory');
    await expect(page.getByTestId('sheet-peek')).toContainText('Status: draft, not yet reviewed');
    await expect(page.getByTestId('leader-line')).toHaveCount(0);
    await expect(page.getByTestId('tag-row')).toBeVisible();
    await page.screenshot({ path: join(OUTPUT, 'block-phone-raised.png') });

    // Touch targets are at least 44 by 44 px (requirement 11.1).
    for (const id of ['sheet-handle', 'lens-control', 'ruler-1935', 'tag-bank']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(43.5);
      expect(box?.width ?? 0, id).toBeGreaterThanOrEqual(43.5);
    }

    await page.getByTestId('sheet-handle').tap();
    await expect(page.getByTestId('card-share')).toBeVisible();
    await cropLoaded(page);
    await page.screenshot({ path: join(OUTPUT, 'block-phone-card.png') });
  });
});
