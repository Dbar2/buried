/**
 * The phone pass (session 031): 390 px wide, a touch screen. The landing, the place page (scene on
 * top, report below, the gauge under a thumb), the evidence card opened by a tap, and the 2D map
 * that stands in when WebGL is off. Nothing scrolls sideways.
 *
 * Run after `npm run build`: `npx playwright test e2e/phone.spec.ts`. Needs the Unity build in
 * web/public/unity/. Screenshots: web/e2e/output/phone-landing.png, phone-place.png,
 * phone-card.png and phone-fallback.png.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { lotWithTheBuilding } from './support/lot';

const OUTPUT = join(fileURLToPath(new URL('..', import.meta.url)), 'e2e', 'output');
const BANK = 'bld_fip_v3_1911_229_0001';
const placeUrl = (era: string): string => `/place?lot=${encodeURIComponent(lotWithTheBuilding())}&era=${era}`;

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
test.beforeAll(() => mkdirSync(OUTPUT, { recursive: true }));

/** Nothing is wider than the screen: not the page, and not the place page's own scroller. */
async function expectNoSidewaysScroll(page: Page, label: string): Promise<void> {
  const wide = await page.evaluate(() => {
    const over: string[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth) over.push(`html ${document.documentElement.scrollWidth}`);
    if (document.body.scrollWidth > window.innerWidth) over.push(`body ${document.body.scrollWidth}`);
    for (const el of document.querySelectorAll<HTMLElement>('.place, .landing, .page-scroll, .place-report')) {
      if (el.scrollWidth > el.clientWidth) {
        // Name the elements that stick out, widest first, so a failure says where to look.
        const wide = [...el.querySelectorAll<HTMLElement>('*')]
          .map((child) => ({ child, right: child.getBoundingClientRect().right }))
          .filter((c) => c.right > window.innerWidth + 1)
          .sort((a, b) => b.right - a.right)
          .slice(0, 4)
          .map((c) => `${c.child.tagName.toLowerCase()}.${String(c.child.className).slice(0, 40)}[${c.child.getAttribute('data-testid') ?? ''}] right=${Math.round(c.right)}`);
        over.push(`${el.className} ${el.scrollWidth} > ${el.clientWidth}: ${wide.join('; ')}`);
      }
    }
    return over;
  });
  expect(wide, `${label}: nothing scrolls sideways`).toEqual([]);
}

async function playerReady(page: Page): Promise<void> {
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 150_000 });
  await expect(page.getByTestId('view')).toHaveAttribute('data-eras-loaded', /1911/, { timeout: 150_000 });
}

test('the landing at 390: wordmark, field and examples fit, and a tap on an example opens its place', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/');
  const field = page.getByRole('searchbox', { name: 'What was here?' });
  await expect(field).toBeVisible();
  const examples = page.getByTestId('landing-examples').locator('a');
  await expect(examples).toHaveCount(3, { timeout: 60_000 });
  await expect(page.getByTestId('landing')).toHaveAttribute('data-scene', /ready|unavailable/, { timeout: 200_000 });
  await page.waitForTimeout(1200);
  await expectNoSidewaysScroll(page, 'landing');
  for (const box of [await field.boundingBox(), ...(await Promise.all((await examples.all()).map((a) => a.boundingBox())))]) {
    expect(box).not.toBeNull();
    expect((box as { x: number }).x).toBeGreaterThanOrEqual(0);
    expect((box as { x: number; width: number }).x + (box as { width: number }).width).toBeLessThanOrEqual(390);
  }
  // The examples are touch targets of at least 44 px.
  for (const a of await examples.all()) expect((await a.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: join(OUTPUT, 'phone-landing.png') });
  await examples.first().tap();
  await page.waitForURL(/\/place\?lot=/);
});

test('the place page at 390: scene on top, report starts below it, the gauge digs by tap, a tap on the scene opens the card', async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto(placeUrl('1911'));
  await playerReady(page);
  await expectNoSidewaysScroll(page, 'place page');

  // The scene is about half the screen, and the first lines of the report show under it.
  const scene = (await page.locator('.place-scene').boundingBox())!;
  const report = (await page.locator('.place-report').boundingBox())!;
  expect(scene.height).toBeGreaterThan(300);
  expect(scene.height).toBeLessThan(600);
  expect(report.y).toBeGreaterThanOrEqual(scene.y + scene.height - 1);
  expect(report.y, 'the report starts on the first screen').toBeLessThan(844 - 100);
  await expect(page.getByTestId('screens-line')).toBeInViewport();

  // The gauge is inside the scene, narrow, and each stop is a touch target of 44 px.
  const gauge = (await page.getByTestId('depth-gauge').boundingBox())!;
  expect(gauge.x).toBeGreaterThanOrEqual(0);
  expect(gauge.x + gauge.width).toBeLessThan(200);
  expect(gauge.y).toBeGreaterThanOrEqual(scene.y);
  expect(gauge.y + gauge.height).toBeLessThanOrEqual(scene.y + scene.height + 1);
  for (const era of ['today', '1947', '1935', '1911']) {
    expect((await page.getByTestId(`era-${era}`).boundingBox())!.height, `${era} stop`).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: join(OUTPUT, 'phone-place.png') });

  // Digging up and down by tap.
  await page.getByTestId('era-1935').tap();
  await expect(page.getByTestId('era-announcement')).toHaveText('Now showing 1935', { timeout: 30_000 });
  await page.getByTestId('era-today').tap();
  await expect(page.getByTestId('era-announcement')).toHaveText('Now showing Today', { timeout: 30_000 });
  await page.getByTestId('era-1911').tap();
  await expect(page.getByTestId('era-announcement')).toHaveText('Now showing 1911 (revised to 1914)', { timeout: 30_000 });
  await expect(page.getByTestId('view')).toHaveAttribute('data-eras-loaded', /1911/);
  await page.waitForTimeout(2000);

  // A tap on a ghost opens its card. The camera frames the lot, so the building is near the middle of
  // the canvas. Find a point that opens a card with the mouse (the desktop path), close the card, then
  // tap that same point with a finger: the two must do the same thing.
  const hint = await page.getByTestId('view-hint').textContent();
  expect(hint).toMatch(/^Tap a building/);
  const canvas = (await page.getByTestId('unity-canvas').boundingBox())!;
  const heading = page.getByTestId('card-heading');
  const points: Array<[number, number]> = [];
  for (let fy = 0.3; fy <= 0.75; fy += 0.075) for (let fx = 0.25; fx <= 0.75; fx += 0.0625) points.push([canvas.x + canvas.width * fx, canvas.y + canvas.height * fy]);
  let found: [number, number] | null = null;
  for (const [x, y] of points) {
    await page.mouse.click(x, y);
    try {
      await heading.waitFor({ state: 'visible', timeout: 1500 });
      found = [x, y];
      break;
    } catch {
      // Nothing under that point; try the next.
    }
  }
  expect(found, 'a mouse click on the scene opened a card at some point').not.toBeNull();
  await page.keyboard.press('Escape');
  await expect(heading).toHaveCount(0);
  await page.evaluate(() => document.querySelector('.place')?.scrollTo(0, 0));
  await page.touchscreen.tap(found![0], found![1]);
  await expect(heading, 'a tap at the same point opens the same card').toBeVisible({ timeout: 8000 });
  // The card is in the report column, below the scene: it is on screen, not off below the fold.
  await expect(heading).toBeInViewport();
  await expectNoSidewaysScroll(page, 'place page with a card');
  await page.screenshot({ path: join(OUTPUT, 'phone-card.png') });
  expect(BANK).toBeTruthy();
});

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

test('the fallback at 390: the 2D map, the list by tap, the card, nothing sideways', async ({ page }) => {
  test.setTimeout(240_000);
  await withoutWebGL(page);
  await page.goto(placeUrl('1911'));
  await expect(page.getByTestId('fallback-2d')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expectNoSidewaysScroll(page, 'fallback');
  await page.getByTestId('feature-list-toggle').tap();
  await expectNoSidewaysScroll(page, 'fallback, list open');
  await page.screenshot({ path: join(OUTPUT, 'phone-fallback.png') });
  await page.getByTestId(`feature-row-${BANK}`).tap();
  await expect(page.getByTestId('card-heading')).toBeInViewport();
  await expectNoSidewaysScroll(page, 'fallback, card open');
});
