/**
 * The build folder as a static host serves it (session 027). `vite preview` serves `dist/` the way
 * Cloudflare Pages does for the checks that matter here: every page route answers 200 with the app
 * when it is the first request (a person pasting a share link), and `_headers` is in the folder to
 * deploy with no `_redirects` and no `404.html`.
 *
 * Run after `npm run build`: `npx playwright test e2e/hosting.spec.ts`. The Unity build is not
 * needed: the place page is checked through its report, and the scene is allowed to be absent.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { lotWithTheBuilding } from './support/lot';

const DIST = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');

test('the folder to deploy holds the host files', () => {
  expect(existsSync(join(DIST, '_headers'))).toBe(true);
  // Session 031: no rewrite rules and no 404.html; Pages serves index.html for unknown paths itself.
  expect(existsSync(join(DIST, '_redirects'))).toBe(false);
  expect(existsSync(join(DIST, '404.html'))).toBe(false);
  expect(readFileSync(join(DIST, '_headers'), 'utf8')).toContain('Content-Encoding: br');
  expect(existsSync(join(DIST, 'index.html'))).toBe(true);
  expect(existsSync(join(DIST, 'data', 'index.json'))).toBe(true);
});

test('a place page link loads directly, as the first request, with its report', async ({ page }) => {
  test.setTimeout(120_000);
  const lot = lotWithTheBuilding();
  const response = await page.goto(`/place?lot=${encodeURIComponent(lot)}&era=1911`);
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('place')).toBeVisible();
  const report = page.getByTestId('report');
  await expect(report).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('screens-line')).toHaveText("Buried screens; it doesn't certify.");
  // The address is the heading; the lot id is in the sources block only.
  await expect(page.locator('.report h1')).not.toHaveText(/documented history/i);
  await expect(page.getByTestId('report-lot')).toContainText(lot);
  await expect(page.getByTestId('report-summary')).toContainText('fire insurance plan');
});

test('each route sets its title and description; the static page carries the Open Graph tags', async ({ page }) => {
  test.setTimeout(120_000);
  const lot = lotWithTheBuilding();

  await page.goto('/');
  await expect(page).toHaveTitle('Buried · What was here?');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://buried.pages.dev/social-card.png');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Forgotten maps, rebuilt with proof\./);

  await page.goto(`/place?lot=${encodeURIComponent(lot)}&era=1911`);
  await expect(page).toHaveTitle(/ · Buried$/, { timeout: 60_000 });
  await expect(page).not.toHaveTitle('The place · Buried');
  const title = await page.title();
  await expect(page.getByTestId('header-address')).toHaveText(title.replace(/ · Buried$/, ''));
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /^The documented history of .+\. Buried screens; it doesn't certify\.$/);

  await page.goto('/sources');
  await expect(page).toHaveTitle('Sources · Buried');
  await page.goto('/studio');
  await expect(page).toHaveTitle('Studio · Buried');

  // The card is served, at the size the tags say.
  const card = await page.request.get('/social-card.png');
  expect(card.status()).toBe(200);
  expect(card.headers()['content-type']).toBe('image/png');
});

test('the other page routes load directly too', async ({ page }) => {
  test.setTimeout(120_000);
  const lot = lotWithTheBuilding();

  const report = await page.goto(`/report?lot=${encodeURIComponent(lot)}`);
  expect(report?.status()).toBe(200);
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });

  const sources = await page.goto('/sources');
  expect(sources?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1, name: 'Sources' })).toBeVisible({ timeout: 30_000 });

  const studio = await page.goto('/studio');
  expect(studio?.status()).toBe(200);
  await expect(page.locator('.studio, main').first()).toBeVisible({ timeout: 30_000 });
});
