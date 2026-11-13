import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The card's lettering crop is a real picture: wait until it is visible, complete and has a natural width above zero,
 * so a screenshot never shows a blank frame where the crop goes.
 */
export async function cropLoaded(page: Page): Promise<void> {
  const img = page.getByTestId('card-crop').locator('img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : 0)), { timeout: 30_000 }).toBeGreaterThan(0);
}
