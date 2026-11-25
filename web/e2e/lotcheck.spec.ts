import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const OUT = 'e2e/output';
mkdirSync(OUT, { recursive: true });

test('the result for 2A Percy St, at 1440 wide', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1500 });
  await page.goto('/lot/5451729');
  await expect(page.getByTestId('lc-tag')).toHaveText('Past industrial use recorded');
  await expect(page.getByTestId('lc-frame')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/lotcheck-result.png`, fullPage: true });
});

test('the result for 2A Percy St, on a phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 2400 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await context.newPage();
  await page.goto('/lot/5451729');
  await expect(page.getByTestId('lc-frame')).toHaveAttribute('data-ready', 'true');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/lotcheck-phone.png`, fullPage: true });
  await context.close();
});

test('the landing, at 1440 wide', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('lc-fact')).toBeVisible();
  await expect(page.getByTestId('lc-plan').locator('path.lc-outline')).toBeVisible();
  await page.screenshot({ path: `${OUT}/lotcheck-landing.png` });
});
