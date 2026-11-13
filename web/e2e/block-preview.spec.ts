/**
 * Screenshots of the Block page's parts on the stand-in stage (spec 06 session 041), for the maintainer to look
 * at before the Player is wired. Run after `npm run build`:
 *
 *   npx playwright test -c playwright.blockpreview.config.ts
 *
 * Writes `web/e2e/output/block-preview-wide.png` (1440 by 900) and `block-preview-phone.png` (390 by 844), the
 * raised page, and `block-preview-landing-wide.png` and `block-preview-landing-phone.png`, the landing. Beyond
 * the screenshots it checks what can be measured: every part is there, the pinned tags sit clear of the card,
 * the ruler and the Lantern control, and every control is at least 44 px high.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const OUTPUT = join(fileURLToPath(new URL('.', import.meta.url)), 'output');

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.getByTestId('block-preview')).toBeVisible({ timeout: 30_000 });
  // The fonts and the crop image have to be in before a screenshot says anything about the look.
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await imagesLoaded(page);
}

/** (An image in the closed sheet is lazy and hidden, and never loads; only the ones on screen count.) */
async function imagesLoaded(page: Page): Promise<void> {
  await page.waitForFunction(() => [...document.images].filter((img) => img.getClientRects().length > 0).every((img) => img.complete && img.naturalWidth > 0));
  // The card's crop is a 2 MB tile decoded off the main thread; a screenshot taken before it is decoded shows an empty frame.
  await page.evaluate(async () => {
    const visible = [...document.images].filter((img) => img.getClientRects().length > 0);
    await Promise.all(visible.map((img) => img.decode().catch(() => undefined)));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function box(page: Page, testId: string) {
  const found = await page.getByTestId(testId).boundingBox();
  expect(found, testId).not.toBeNull();
  return found!;
}

const overlaps = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.beforeAll(() => mkdirSync(OUTPUT, { recursive: true }));

test('the raised page on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/block-preview');

  await expect(page.getByTestId('find-card')).toBeVisible();
  await expect(page.getByTestId('card-title')).toHaveText('Glove & Overall Factory');
  await expect(page.getByTestId('leader-line')).toBeVisible();
  await expect(page.getByTestId('era-ruler')).toBeVisible();
  await expect(page.getByTestId('lens-ring')).toBeVisible();
  await expect(page.getByTestId('bottom-sheet')).toHaveCount(0);
  for (const id of ['overall-factory', 'bank', 'coal-yard']) await expect(page.getByTestId(`tag-${id}`)).toBeVisible();
  await expect(page.getByTestId('tag-overall-factory')).toHaveAttribute('aria-pressed', 'true');

  // Pinned tags (the finds that are not selected) clear the card, the ruler and the Lantern control.
  const keepOut = [await box(page, 'find-card'), await box(page, 'era-ruler'), await box(page, 'lens-control'), await box(page, 'tag-row')];
  for (const id of ['bank', 'coal-yard']) {
    const pinned = page.getByTestId(`pinned-${id}`);
    if ((await pinned.count()) === 0) continue;
    const tag = (await pinned.boundingBox())!;
    for (const other of keepOut) expect(overlaps(tag, other), `${id} overlaps a keep-out`).toBe(false);
  }
  await expect(page.getByTestId('pinned-overall-factory')).toHaveCount(0);

  // 44 px targets for every control.
  for (const control of await page.locator('main button, main a').all()) {
    if (!(await control.isVisible())) continue;
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  }

  await page.screenshot({ path: join(OUTPUT, 'block-preview-wide.png') });
});

test('the raised page on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/block-preview');

  await expect(page.getByTestId('bottom-sheet')).toBeVisible();
  await expect(page.getByTestId('sheet-peek')).toContainText('LETTERED ON THE 1911 PLAN');
  await expect(page.getByTestId('sheet-peek')).toContainText('Glove & Overall Factory');
  await expect(page.getByTestId('sheet-peek')).toContainText('Status: draft, not yet reviewed');
  await expect(page.getByTestId('leader-line')).toHaveCount(0);
  await expect(page.getByTestId('find-card')).toBeHidden();
  // The tags are one row that scrolls, and the ruler sits above the sheet.
  const row = await box(page, 'tag-row');
  const tags = await page.getByTestId('tag-row').locator('button').all();
  expect(tags.length).toBe(3);
  for (const tag of tags) expect((await tag.boundingBox())!.y).toBeCloseTo(row.y, 0);
  const sheet = await box(page, 'bottom-sheet');
  const ruler = await box(page, 'era-ruler');
  expect(ruler.y + ruler.height).toBeLessThanOrEqual(sheet.y + 1);
  for (const control of await page.locator('main button, main a').all()) {
    if (!(await control.isVisible())) continue;
    expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  }

  await page.screenshot({ path: join(OUTPUT, 'block-preview-phone.png') });

  // Opening the sheet shows the whole card.
  await page.getByTestId('sheet-handle').click();
  await expect(page.getByTestId('find-card')).toBeVisible();
  await imagesLoaded(page);
  await page.screenshot({ path: join(OUTPUT, 'block-preview-phone-open.png') });
});

test('the landing, wide and phone', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/block-preview?state=landing');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Something used to stand here.');
  await expect(page.getByTestId('raise-button')).toHaveText('Raise the past');
  await expect(page.getByTestId('find-card')).toHaveCount(0);
  const button = await box(page, 'raise-button');
  expect(button.height).toBeGreaterThanOrEqual(43.5);
  // The tags are pinned, none under the headline block.
  const intro = (await page.locator('.block-intro').boundingBox())!;
  for (const tag of await page.locator('.find-tag-pinned').all()) {
    expect(overlaps((await tag.boundingBox())!, intro)).toBe(false);
  }
  expect(button.x).toBeLessThan(720);
  await page.screenshot({ path: join(OUTPUT, 'block-preview-landing-wide.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, '/block-preview?state=landing');
  await page.screenshot({ path: join(OUTPUT, 'block-preview-landing-phone.png') });
});
