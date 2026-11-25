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

    test('the dig, held at its second mark by the test hook', async ({ page }) => {
      await page.addInitScript(() => {
        (window as unknown as { __buriedDigHold: number }).__buriedDigHold = 1;
      });
      await page.goto('/');
      await expect(page.getByTestId('lc-fact')).toBeVisible();
      await page.getByTestId('lc-address').fill('2A Percy St');
      await page.getByTestId('lc-address').press('Enter');
      const dig = page.getByTestId('dig');
      await expect(dig).toBeVisible();
      await expect(dig).toHaveAttribute('data-held', 'true');
      await expect(dig).toHaveAttribute('data-active-mark', '1');
      await expect(page.getByTestId('dig-mark')).toHaveText(['Today', '1931-35', '1911']);
      await expect(page.getByTestId('dig-slip').nth(0)).toHaveText('2A, 2B, 2C and 2D Percy St');
      await expect(page.getByTestId('dig-slip').nth(1)).toHaveText('Coal & Wood Yard, Northern Fuels Co.');
      await expect(page.getByTestId('dig-slip').nth(1)).toHaveAttribute('data-shown', 'true');
      await expect(page.getByTestId('dig-slip').nth(2)).toHaveAttribute('data-shown', 'false');
      await expect(page.getByTestId('dig-caption')).toHaveText('Digging down to 1911…');
      await expect(page.getByTestId('dig-address')).toHaveText('2A, 2B, 2C and 2D Percy St');
      await expect(page.getByTestId('dig-announce')).toHaveText('Digging down through the plans');
      await finite(page);
      await page.screenshot({ path: `${OUT}/night-dig-${size.name}.png` });
      // Escape skips: the Result opens.
      await page.keyboard.press('Escape');
      await expect(page).toHaveURL(/\/lot\/5451729$/);
    });

    test('the Result after the stamp', async ({ page }) => {
      await page.goto('/lot/5451729');
      await expect(page.getByTestId('lc-tag')).toBeVisible();
      await expect(page.getByTestId('lc-frame')).toHaveAttribute('data-ready', 'true');
      await expect(page.getByTestId('lc-frame')).toHaveAttribute('data-sweep', 'done', { timeout: 8000 });
      await finite(page);
      await expect(page.getByTestId('lc-ins-lead')).toHaveText('HERE STOOD');
      await expect(page.getByTestId('lc-ins-name')).toHaveText('Coal & Wood Yard');
      await expect(page.getByTestId('lc-ins-foot')).toHaveText('recorded on the plans of 1911 and 1931-35');
      await expect(page.getByTestId('lc-tag')).toHaveText('Past industrial use recorded');
      await expect(page.getByTestId('lc-title')).toBeFocused();
      await page.screenshot({ path: `${OUT}/night-result-${size.name}.png` });
    });

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

test.describe('the dig runs as a visitor sees it', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('it takes about 4.5 s with two plans, never 7, and ends on the Result', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('lc-fact')).toBeVisible();
    await page.getByTestId('lc-address').fill('2A Percy St');
    await page.getByTestId('lc-address').press('Enter');
    await expect(page.getByTestId('dig')).toBeVisible();
    const began = Date.now();
    await page.waitForURL(/\/lot\/5451729$/, { timeout: 9000 });
    const took = Date.now() - began;
    console.log(`the dig took ${took} ms`);
    expect(took).toBeGreaterThan(3500);
    expect(took).toBeLessThan(7000);
  });

  test('a direct visit to a Result plays no dig', async ({ page }) => {
    await page.goto('/lot/5451729');
    await expect(page.getByTestId('lc-tag')).toBeVisible();
    await expect(page.getByTestId('dig')).toHaveCount(0);
  });

  test('"Skip" and Enter go straight to the Result', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('lc-fact')).toBeVisible();
    await page.getByTestId('lc-random').click();
    await expect(page.getByTestId('dig')).toBeVisible();
    await page.getByTestId('dig-skip').click();
    await expect(page).toHaveURL(/\/lot\/\d+$/);
    await expect(page.getByTestId('lc-tag')).toBeVisible();
  });
});

test.describe('reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('there is no overlay, and the Result gives the same verdict', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('lc-fact')).toBeVisible();
    await page.getByTestId('lc-address').fill('2A Percy St');
    await page.getByTestId('lc-address').press('Enter');
    await expect(page.getByTestId('dig')).toHaveCount(0);
    await expect(page).toHaveURL(/\/lot\/5451729$/);
    await expect(page.getByTestId('lc-tag')).toHaveText('Past industrial use recorded');
  });
});

test.describe('the reveal', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the divider sweeps once from the right edge to the middle, and the visitor can take it over', async ({ page }) => {
    await page.goto('/lot/5451729');
    const frame = page.getByTestId('lc-frame');
    const slider = page.getByTestId('lc-divider');
    await expect(frame).toHaveAttribute('data-sweep', 'pending');
    await expect(slider).toHaveAttribute('aria-valuenow', '100');
    await expect(frame).toHaveAttribute('data-sweep', 'done', { timeout: 8000 });
    await expect(slider).toHaveAttribute('aria-valuenow', '50');
  });

  test('a keypress during the sweep takes over', async ({ page }) => {
    await page.goto('/lot/5451729');
    const frame = page.getByTestId('lc-frame');
    await expect(frame).toHaveAttribute('data-ready', 'true');
    const slider = page.getByTestId('lc-divider');
    await slider.focus();
    await page.keyboard.press('Home');
    await expect(frame).toHaveAttribute('data-sweep', 'done');
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
    // Well past the moment the sweep would have ended: 100 frames.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          let n = 0;
          const frame = () => (++n >= 100 ? resolve() : requestAnimationFrame(frame));
          frame();
        }),
    );
    await expect(slider).toHaveAttribute('aria-valuenow', '0');
  });

  test('the stamp comes after the sheet, and the rows arrive one after another', async ({ page }) => {
    await page.goto('/lot/5451729');
    await expect(page.getByTestId('lc-tag')).toBeVisible();
    const timing = await page.evaluate(() => {
      const delay = (el: Element | null): number => {
        const a = el ? document.getAnimations().find((x) => (x.effect as KeyframeEffect | null)?.target === el && (x as CSSAnimation).animationName === 'lc-stamp-in') : undefined;
        return a ? Number(a.effect?.getComputedTiming().delay) : -1;
      };
      const rise = document.getAnimations().find((x) => (x as CSSAnimation).animationName === 'lc-rise');
      const rows = [...document.querySelectorAll('[data-testid="lc-row"]')].map((r) => {
        const a = document.getAnimations().find((x) => (x.effect as KeyframeEffect | null)?.target === r && (x as CSSAnimation).animationName === 'lc-row-in');
        return a ? Number(a.effect?.getComputedTiming().delay) : -1;
      });
      return { stamp: delay(document.querySelector('[data-testid="lc-tag"]')), riseMs: Number(rise?.effect?.getComputedTiming().duration), rows };
    });
    expect(timing.riseMs).toBe(600);
    // The stamp lands 0.4 s after the 0.6 s rise.
    expect(timing.stamp).toBe(1000);
    expect(timing.rows.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < timing.rows.length; i++) expect(timing.rows[i]).toBeGreaterThan(timing.rows[i - 1] as number);
  });

  test('"Dig another address" goes back to the Landing with the field focused', async ({ page }) => {
    await page.goto('/lot/5451729');
    await page.getByTestId('lc-another').click();
    await expect(page).toHaveURL(/\/#dig$/);
    await expect(page.getByTestId('lc-address')).toBeFocused();
    await expect(page.getByTestId('lc-suggest-head')).toHaveText('Try one of these');
  });

  test('a lot outside the coverage reads NOT DUG YET, with the spade and the coverage line', async ({ page }) => {
    await page.goto('/lot/no_such_lot');
    await expect(page.getByTestId('lc-ins-lead')).toHaveText('NOT DUG YET');
    await expect(page.getByTestId('lc-inscription').locator('img')).toBeVisible();
    await expect(page.getByTestId('lc-tag')).toHaveText('Not covered yet');
    await expect(page.getByTestId('lc-coverage')).toContainText('Covered so far');
    await page.screenshot({ path: `${OUT}/night-notdug.png` });
  });
});

test.describe('the reveal under reduced motion', () => {
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

  test('everything is in place at once: no animation on the sheet, the stamp or the rows, the divider in the middle', async ({ page }) => {
    await page.goto('/lot/5451729');
    await expect(page.getByTestId('lc-frame')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('lc-frame')).toHaveAttribute('data-sweep', 'done');
    await expect(page.getByTestId('lc-divider')).toHaveAttribute('aria-valuenow', '50');
    const running = await page.evaluate(() => document.getAnimations().map((a) => (a as CSSAnimation).animationName));
    expect(running).toEqual([]);
    await expect(page.getByTestId('lc-tag')).toHaveText('Past industrial use recorded');
    await expect(page.getByTestId('lc-ins-lead')).toHaveText('HERE STOOD');
  });
});
