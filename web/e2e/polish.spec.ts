/**
 * Screenshots for session 027: the landing, the place page and the Sources page, plus the checks that
 * the page says what the polish brief asks. The place page and the landing show the Unity scene when
 * the build is in web/public/unity/; without it the screenshot shows the report beside an empty scene.
 *
 * Run after `npm run build`: `npx playwright test e2e/polish.spec.ts`. Output goes to
 * web/e2e/output/polish-landing.png, polish-place.png and polish-sources.png.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { lotWithTheBuilding } from './support/lot';

const OUTPUT = join(fileURLToPath(new URL('..', import.meta.url)), 'e2e', 'output');

test.beforeAll(() => mkdirSync(OUTPUT, { recursive: true }));

test('the landing: wordmark, tagline, field, "Try" and the coverage line', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buried');
  await expect(page.getByTestId('landing-tagline')).toHaveText('Forgotten maps, rebuilt with proof.');
  const examples = page.getByTestId('landing-examples').locator('a');
  await expect(examples).toHaveCount(3, { timeout: 60_000 });
  await expect(page.locator('#landing-try-label')).toHaveText('Try');
  await expect(page.getByTestId('landing-coverage')).toContainText('Buried holds the 1911 plan and the 1931-35 plan');
  await expect(page.getByTestId('landing-coverage')).toContainText('Coverage today is one block of Toronto.');
  await page.waitForTimeout(4000);
  await page.screenshot({ path: join(OUTPUT, 'polish-landing.png') });

  // Enter on an exact match goes straight to that address's place page.
  const first = (await examples.first().textContent()) as string;
  await page.getByRole('searchbox', { name: 'What was here?' }).fill(first);
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/place\?lot=/);
});

test('the place page: the address as the heading, a summary, and the record\'s own Confirmed by line', async ({ page }) => {
  test.setTimeout(240_000);
  const lot = lotWithTheBuilding();
  await page.goto(`/place?lot=${encodeURIComponent(lot)}&era=1911`);
  const report = page.getByTestId('report');
  await expect(report).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.report h1')).not.toHaveText(/documented history/i);
  await expect(page.getByTestId('report-subtitle')).toHaveText('The documented history of this place.');
  await expect(page.getByTestId('report-summary')).toContainText('fire insurance plans cover this lot');
  await expect(report).toContainText('Confirmed by: Buried maintainers (gate draft, unreviewed), 2026-11-12.');
  await expect(report).not.toContainText(/checked by a person/i);
  await expect(report).not.toContainText('Address:');
  await expect(report).toContainText("lettered on the 1911 plan as 'Bank of Nova Scotia; offices on 2nd'");
  await expect(report).toContainText('Coverage today is one block of Toronto.');
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(OUTPUT, 'polish-place.png') });
});

test('the Sources page: credit, rights and the whole photograph of each plate', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page.goto('/sources');
  await expect(page.getByRole('heading', { level: 1, name: 'Sources' })).toBeVisible({ timeout: 30_000 });
  const photo = page.getByTestId('source-photo-fip_v3_1911_229').locator('img');
  await photo.scrollIntoViewIfNeeded();
  await expect(photo).toHaveAttribute('loading', 'lazy');
  await expect(photo).toHaveAttribute('width', '1714');
  await expect(photo).toHaveAttribute('height', '2048');
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const other = page.getByTestId('source-photo-fip_v3_1935_229').locator('img');
  await other.scrollIntoViewIfNeeded();
  await expect.poll(() => other.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByTestId('source-fip_v3_1935_229')).toContainText('Library and Archives Canada');
  await page.locator('.page-scroll').evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: join(OUTPUT, 'polish-sources.png') });
});
