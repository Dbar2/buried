/**
 * The Block page without WebGL (spec 06 W12, requirements 1 to 3, 5.3, 7 and 11.3): the Flat sheet. WebGL is turned
 * off before the page starts, so the Player never loads. Run after `npm run build`:
 *   npx playwright test -c playwright.blockflat.config.ts
 * Screenshots go to web/e2e/output/block-flat-*.png (1440 by 900 and 390 by 844).
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { cropLoaded } from './support/cropLoaded';

const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), 'output');

test.beforeAll(() => mkdirSync(OUTPUT, { recursive: true }));

/** WebGL turned off before the page starts: no context for the Player to take. */
async function withoutWebGL(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest) as never;
    } as typeof original;
  });
}

/** Decode the visible images before a screenshot: the 2 MB tile decodes off the main thread. */
async function settleImages(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const images = [...document.images, ...[...document.querySelectorAll('image')].map((i) => i as unknown as HTMLImageElement)];
    await Promise.all(images.filter((i) => 'decode' in i).map((i) => i.decode().catch(() => undefined)));
  });
}

for (const viewport of [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
]) {
  test(`the flat landing, the raise, the first find, the ruler and the share link at ${viewport.name}`, async ({ page, context }) => {
    test.setTimeout(120_000);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await withoutWebGL(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    // Landing (requirement 1): the headline, the button and the line, the sheet, one line saying why it is flat.
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something used to stand here.');
    await expect(page.getByTestId('raise-button')).toHaveText('Raise the past');
    await expect(page.locator('.block-line')).toHaveText('Every ghost comes with the map that proves it.');
    await expect(page.getByTestId('flat-sheet')).toBeVisible();
    await expect(page.getByTestId('block-failed')).toContainText('cannot show the 3D view');
    // Tags sit on the sheet where the layout finds room; on a phone the headline covers most of the sheet, so they may hide.
    if (viewport.width >= 720) await expect(page.getByTestId('pinned-overall-factory')).toBeVisible();
    await expect(page.getByTestId('look-up-address')).toHaveAttribute('href', '/place');
    await expect(page.getByTestId('find-card')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText("Buried screens; it doesn't certify.");
    await expect(page.locator('input')).toHaveCount(0);
    await settleImages(page);
    await page.screenshot({ path: join(OUTPUT, `block-flat-landing-${viewport.name}.png`) });

    // Raise (requirement 3, 11.3): the outlines draw on, then the first find's card opens.
    await page.getByTestId('raise-button').click();
    await expect(page.getByTestId('flat-footprints')).toBeVisible();
    expect(await page.locator('.flat-fp').count()).toBeGreaterThan(10);
    await expect(page.getByTestId('block-intro')).toHaveCount(0);
    const title = page.getByTestId('card-title');
    await expect(title).toHaveText('Glove & Overall Factory', { timeout: 15_000 });
    await expect(page.getByTestId('card-kicker')).toHaveText('LETTERED ON THE 1911 PLAN');
    await expect(page.getByTestId('card-seen-on')).toContainText('1911 plan, sheet 229');
    await expect(page.getByTestId('card-status')).toHaveText('Status: draft, not yet reviewed');
    await expect(page.getByTestId('era-ruler')).toBeVisible();
    await expect(page.getByTestId('ruler-1911')).toHaveAttribute('aria-checked', 'true');
    if (viewport.width >= 720) await cropLoaded(page);
    await settleImages(page);
    await page.screenshot({ path: join(OUTPUT, `block-flat-raised-${viewport.name}.png`) });

    // The phone's card is a sheet that peeks at kicker, name and status.
    if (viewport.width < 720) {
      await expect(page.getByTestId('bottom-sheet')).toBeVisible();
      await expect(page.getByTestId('sheet-peek')).toContainText('Glove & Overall Factory');
      await expect(page.getByTestId('sheet-peek')).toContainText('Status: draft, not yet reviewed');
    }

    // The ruler (requirement 5.3): 1935 adds the one line about the 1931-35 plan.
    await page.getByTestId('ruler-1935').click();
    await expect(page.getByTestId('block-page')).toHaveAttribute('data-era', '1935');
    if (viewport.width < 720) await page.getByTestId('sheet-handle').click();
    await expect(page.getByTestId('card-ruler-line')).toHaveText('On the 1931-35 plan this factory is lettered “Glove & Overall Fac.”.');
    await cropLoaded(page);
    await settleImages(page);
    await page.screenshot({ path: join(OUTPUT, `block-flat-1935-${viewport.name}.png`) });

    // Share (requirement 7.1): the link is copied and announced.
    await page.getByTestId('card-share').click();
    await expect(page.getByTestId('card-share-status')).toHaveText('Link copied.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/find\/overall-factory$/);
  });
}

test('/find/coal-yard opens raised on the yard, without waiting for the animation', async ({ page }) => {
  test.setTimeout(120_000);
  await withoutWebGL(page);
  await page.goto('/find/coal-yard');
  await expect(page.getByTestId('card-title')).toHaveText('Coal & Wood Yard', { timeout: 15_000 });
  await expect(page.getByTestId('card-kicker')).toHaveText('LETTERED ON THE 1911 PLAN');
  await expect(page.getByTestId('block-intro')).toHaveCount(0);
  await expect(page.getByTestId('tag-coal-yard')).toHaveAttribute('aria-pressed', 'true');
  await expect(page).toHaveTitle('Coal & Wood Yard, 1911 plan · Buried');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /^Lettered on the 1911 plan at Queen Street East and River Street, Toronto/);
});

test('an unknown slug opens the landing with "No find by that name."', async ({ page }) => {
  test.setTimeout(120_000);
  await withoutWebGL(page);
  await page.goto('/find/no-such-find');
  await expect(page.getByTestId('block-notice')).toHaveText('No find by that name.');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('raise-button')).toBeVisible();
});

test('the Lantern shows the other layer inside a circle, and the list is reachable', async ({ page }) => {
  test.setTimeout(120_000);
  await withoutWebGL(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/find/overall-factory');
  await expect(page.getByTestId('card-title')).toHaveText('Glove & Overall Factory', { timeout: 15_000 });

  await expect(page.getByTestId('flat-lens-layer')).toHaveCount(0);
  await page.getByTestId('lens-control').click();
  await expect(page.getByTestId('lens-ring')).toBeVisible();
  await expect(page.getByTestId('flat-lens-layer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('flat-lens-layer')).toHaveCount(0);

  await page.getByTestId('feature-list-toggle').click();
  await expect(page.getByTestId('feature-list-panel')).toBeVisible();
});
