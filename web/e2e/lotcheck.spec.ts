import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const OUT = 'e2e/output';
mkdirSync(OUT, { recursive: true });

test('the landing, at 1440 wide', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('lc-fact')).toBeVisible();
  await expect(page.getByTestId('lc-plan').locator('path.lc-outline')).toBeVisible();
  await page.screenshot({ path: `${OUT}/lotcheck-landing.png` });
});
