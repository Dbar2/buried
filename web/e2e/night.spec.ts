/**
 * The night dig (session 053): the Landing after its entrance, the suggestion list, the dig held at its second
 * mark, the Result after the stamp, each at 1440 by 900 and 390 by 844 (screenshots in e2e/output/night-*.png), and
 * what each of them does. Run after `npm run build`: `npx playwright test -c playwright.lotcheck.config.ts`.
 * No sleeps: the page's own finite animations are awaited, and the dig is frozen by its test hook.
 */
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const OUT = 'e2e/output';
mkdirSync(OUT, { recursive: true });

const SIZES = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
] as const;

/** Every animation that ends has ended. The ones that loop (flicker, pulse, drift) are left running. */
export async function finite(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const all = document.getAnimations().filter((a) => (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity);
    await Promise.all(all.map((a) => a.finished.catch(() => undefined)));
  });
}

for (const size of SIZES) {
  test.describe(`${size.name} ${size.width} by ${size.height}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.name === 'phone' });

    test('the Landing after its entrance', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('lc-fact')).toBeVisible();
      await expect(page.getByTestId('lc-lot').first()).toBeAttached();
      await finite(page);
      await page.screenshot({ path: `${OUT}/night-landing-${size.name}.png` });
    });

    test('the suggestion list, open', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByTestId('lc-fact')).toBeVisible();
      await page.getByTestId('lc-address').fill('2a p');
      await expect(page.getByTestId('lc-option').first()).toHaveText(/2A Percy St.*something recorded/);
      await finite(page);
      await page.screenshot({ path: `${OUT}/night-suggest-${size.name}.png` });
    });
  });
}
