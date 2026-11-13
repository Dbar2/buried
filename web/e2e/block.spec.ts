/**
 * The Block page with the real Player (spec 06 W12, requirements 1 to 3, 5, 6, 7.2). Tagged `@unity`: it needs the
 * Unity build in web/public/unity/ (tools/unity.sh build, then `npm run build`), which only the main suite has. It was
 * written in session 042 against a fake Player and has not been run against the real one: the maintainer runs it after the
 * lanes are merged.
 *
 *   npx playwright test -c playwright.block.config.ts e2e/block.spec.ts
 *
 * Screenshots go to web/e2e/output/block-*.png.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cropLoaded, stillLoaded } from './support/cropLoaded';
import { introContrast } from './support/introContrast';

const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), 'output');
const PLAYER_TIMEOUT = 180_000;

test.beforeAll(() => mkdirSync(OUTPUT, { recursive: true }));
test.use({ viewport: { width: 1440, height: 900 } });

async function raised(page: Page): Promise<void> {
  await expect(page.getByTestId('block-page')).toHaveAttribute('data-phase', 'raised', { timeout: PLAYER_TIMEOUT });
  await expect(page.getByTestId('card-title')).toHaveText('Glove & Overall Factory');
  await cropLoaded(page);
}

test.describe('@unity the Block page', { tag: '@unity' }, () => {
  test('the Still and the button are there at once; pressing Raise raises the past and opens the first find', async ({ page }) => {
    test.setTimeout(PLAYER_TIMEOUT + 60_000);
    const started = Date.now();
    await page.goto('/');
    const button = page.getByTestId('raise-button');
    await expect(button).toBeEnabled();
    expect(Date.now() - started, 'the button is usable within 2 s of first paint (requirement 2.1)').toBeLessThan(2000);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something used to stand here.');
    await expect(page.getByTestId('still')).toBeVisible();
    await stillLoaded(page);
    await expect(page.locator('body')).not.toContainText("Buried screens; it doesn't certify.");
    await page.screenshot({ path: join(OUTPUT, 'block-landing-1440.png') });

    // The words are read on what is behind them: the worst pixel under each line, against the text colour (design.md floor 4.5).
    const contrast = await introContrast(page);
    writeFileSync(join(OUTPUT, 'block-landing-contrast.json'), `${JSON.stringify(contrast, null, 2)}\n`);
    expect(contrast.map((c) => c.name)).toEqual(['headline', 'line']);
    for (const c of contrast) expect(c.ratio, `the ${c.name} against what is behind it`).toBeGreaterThanOrEqual(c.floor);
    await expect(page.locator('.block-line')).toHaveCSS('color', 'rgb(232, 220, 193)');

    await button.click();
    await raised(page);
    await expect(page.getByTestId('card-kicker')).toHaveText('LETTERED ON THE 1911 PLAN');
    await expect(page.getByTestId('card-status')).toHaveText('Status: draft, not yet reviewed');
    await expect(page.getByTestId('ruler-1911')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('tag-overall-factory')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('leader-line')).toBeVisible();
    await expect(page.getByTestId('still')).toHaveAttribute('data-faded', 'true');
    await page.screenshot({ path: join(OUTPUT, 'block-raised-1440.png') });
  });

  test('the Still is on screen at first paint, whatever else is slow', async ({ page }) => {
    // block.json (the anchors) is held back for 3 s: the picture itself must not wait for it.
    await page.route('**/still/block.json', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.continue();
    });
    await page.goto('/');
    const still = page.getByTestId('still');
    await expect(still).toBeVisible({ timeout: 1500 });
    await expect(still).toHaveAttribute('data-faded', 'false');
    await expect.poll(() => still.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 3000 }).toBeGreaterThan(0);
  });

  test('the Still is not faded before the Player reports the held era loaded', async ({ page }) => {
    test.setTimeout(PLAYER_TIMEOUT + 60_000);
    await page.addInitScript(() => {
      const w = window as unknown as { __stillEarly: number; __stillFadedSeen: boolean };
      w.__stillEarly = 0;
      w.__stillFadedSeen = false;
      const check = () => {
        const still = document.querySelector('[data-testid="still"]');
        const stage = document.querySelector('[data-testid="block-page"]');
        if (still?.getAttribute('data-faded') === 'true') {
          w.__stillFadedSeen = true;
          if (stage?.getAttribute('data-held-loaded') !== 'true') w.__stillEarly += 1;
        }
      };
      new MutationObserver(check).observe(document, { subtree: true, attributes: true, childList: true });
    });
    await page.goto('/');
    await expect(page.getByTestId('still')).toHaveAttribute('data-faded', 'true', { timeout: PLAYER_TIMEOUT });
    await expect(page.getByTestId('block-page')).toHaveAttribute('data-held-loaded', 'true');
    expect(await page.evaluate(() => (window as unknown as { __stillEarly: number }).__stillEarly)).toBe(0);
    expect(await page.evaluate(() => (window as unknown as { __stillFadedSeen: boolean }).__stillFadedSeen)).toBe(true);
  });

  test('after the raise an unselected find is a small marker: its text shows on hover and on focus, and it selects the find', async ({ page }) => {
    test.setTimeout(PLAYER_TIMEOUT + 60_000);
    await page.goto('/');
    await page.getByTestId('raise-button').click();
    await raised(page);
    await expect(page.getByTestId('tag-layer')).toHaveCount(0);
    const markers = page.locator('[data-testid^="marker-"]:not([data-testid^="marker-label-"]):not([data-testid="marker-layer"])');
    await expect.poll(() => markers.count(), { message: 'at least one unselected find is marked on the scene' }).toBeGreaterThan(0);
    await expect(page.getByTestId('marker-overall-factory'), 'the selected find has no marker').toHaveCount(0);
    const marker = markers.first();
    const id = ((await marker.getAttribute('data-testid')) as string).replace('marker-', '');
    const label = page.getByTestId(`marker-label-${id}`);
    const dot = marker.locator('.find-marker-dot');
    const box = (await dot.boundingBox())!;
    expect(Math.round(box.width)).toBe(10);
    expect(Math.round(box.height)).toBe(10);
    await expect(label).toHaveCSS('opacity', '0');
    await marker.hover();
    await expect(label).toHaveCSS('opacity', '1');
    await expect(label).toHaveText(/\S/);
    await page.mouse.move(5, 500);
    await expect(label).toHaveCSS('opacity', '0');
    await marker.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(label).toHaveCSS('opacity', '1');
    await page.screenshot({ path: join(OUTPUT, 'block-markers-1440.png') });
    await marker.click();
    await expect(page.getByTestId(`tag-${id}`)).toHaveAttribute('aria-pressed', 'true');
  });

  test('the ruler moves the era, and 1935 adds the one line about the 1931-35 plan', async ({ page }) => {
    test.setTimeout(PLAYER_TIMEOUT + 60_000);
    await page.goto('/');
    await page.getByTestId('raise-button').click();
    await raised(page);
    await page.getByTestId('ruler-1935').click();
    await expect(page.getByTestId('block-page')).toHaveAttribute('data-era', '1935');
    await expect(page.getByTestId('card-ruler-line')).toHaveText('On the 1931-35 plan this factory is lettered “Glove & Overall Fac.”.');
    await expect(page.getByTestId('era-ruler').getByTestId('ruler-status')).toHaveText('Now showing the 1931-35 plan');
    await page.keyboard.press('Escape');
  });

  test('selecting another find, "Show the original sheet" and "Share this find"', async ({ page, context }) => {
    test.setTimeout(PLAYER_TIMEOUT + 60_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByTestId('raise-button').click();
    await raised(page);
    await page.getByTestId('tag-coal-yard').click();
    await expect(page.getByTestId('card-title')).toHaveText('Coal & Wood Yard');
    await page.getByTestId('card-show-original').click();
    await expect(page.getByTestId('card-show-original')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('card-share').click();
    await expect(page.getByTestId('card-share-status')).toHaveText('Link copied.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/find\/coal-yard$/);
  });

  test('the Lantern: the L key and the control toggle the ring, Escape turns it off', async ({ page }) => {
    test.setTimeout(PLAYER_TIMEOUT + 60_000);
    await page.goto('/');
    await page.getByTestId('raise-button').click();
    await raised(page);
    await expect(page.getByTestId('lens-ring')).toHaveCount(0);
    const ignored: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('setLantern ignored')) ignored.push(message.text());
    });
    await page.keyboard.press('l');
    await expect(page.getByTestId('lens-ring')).toBeVisible();
    // The Player draws the lens only at Today: the ruler goes there and the 1911 plan shows inside the lens.
    await expect(page.getByTestId('block-page')).toHaveAttribute('data-era', 'today');
    await expect(page.getByTestId('lens-control')).toHaveText(/1911/);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUTPUT, 'block-lantern-1440.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('lens-ring')).toHaveCount(0);
    await expect(page.getByTestId('block-page')).toHaveAttribute('data-era', '1911');
    await page.getByTestId('lens-control').click();
    await expect(page.getByTestId('lens-ring')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(ignored, 'the Player took every lens message').toEqual([]);
  });

  test('/find/overall-factory opens raised on the factory without the animation, and a bad slug opens the landing', async ({ page }) => {
    test.setTimeout(PLAYER_TIMEOUT + 60_000);
    await page.goto('/find/overall-factory');
    await raised(page);
    await expect(page).toHaveTitle('Glove & Overall Factory, 1911 plan · Buried');
    await page.goto('/find/no-such-find');
    await expect(page.getByTestId('block-notice')).toHaveText('No find by that name.');
  });

  test('"List" opens the accessible list, and "Look up an address" goes to /place', async ({ page }) => {
    test.setTimeout(PLAYER_TIMEOUT + 60_000);
    await page.goto('/');
    await page.getByTestId('raise-button').click();
    await raised(page);
    await page.getByTestId('feature-list-toggle').click();
    await expect(page.getByTestId('feature-list-panel')).toBeVisible();
    await expect(page.getByTestId('look-up-address')).toHaveAttribute('href', '/place');
  });
});
