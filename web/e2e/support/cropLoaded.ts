import { expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** An image that is complete, has a natural width above zero and has been decoded, so a screenshot cannot catch it blank. */
async function imageReady(img: Locator): Promise<void> {
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : 0)), { timeout: 30_000 }).toBeGreaterThan(0);
  await img.evaluate((el: HTMLImageElement) => el.decode().catch(() => undefined));
}

/**
 * The card's lettering crop is a real picture: wait until it is visible, complete, decoded and has a natural width
 * above zero, so a screenshot never shows a blank frame where the crop goes.
 */
export async function cropLoaded(page: Page): Promise<void> {
  await imageReady(page.getByTestId('card-crop').locator('img'));
}

/** The same for the Still, while it is on screen (it fades once the Player has drawn the held scene). */
export async function stillLoaded(page: Page): Promise<void> {
  await imageReady(page.getByTestId('still').locator('img'));
}
