/**
 * Session 034: the Lantern and Show Evidence where people will find them, on the place page. Run after
 * `npm run build` (the build copies web/public/unity/ into dist/):
 *   npx playwright test -c playwright.isolated.config.ts e2e/placecontrols.spec.ts
 *
 * Pictures: e2e/output/place-lantern.png (the lens held over the scene at Today, with the control by the gauge) and
 * place-evidence-toggle.png (the card with its two scan buttons, Show the scan under this building pressed).
 *
 * The scene is judged in pixels: with a control on, the canvas must differ from the canvas with it off, and with it
 * off again, or with the card closed, it must be the same picture as before.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { mismatch } from './support/lens';
import { sceneOnlyPng as canvasPng, shoot } from './support/scene';
import { lotWithTheBuilding } from './support/lot';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const OUTPUT = join(WEB, 'e2e', 'output');
const BANK = 'bld_fip_v3_1911_229_0001';
const DIFF = 8;

test.beforeAll(() => {
  if (!existsSync(join(WEB, 'public', 'unity', 'Build'))) throw new Error('Unity build not found; run tools/unity.sh build');
  mkdirSync(OUTPUT, { recursive: true });
});

const placeUrl = (era: string): string => `/place?lot=${encodeURIComponent(lotWithTheBuilding())}&era=${era}`;

async function playerReady(page: Page): Promise<void> {
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 150_000 });
  await expect(page.getByTestId('view')).toHaveAttribute('data-eras-loaded', /1911/, { timeout: 150_000 });
  // The camera flies to the lot and the sheet settles.
  await page.waitForTimeout(6000);
}

async function newPage(browser: Browser, options: { width?: number; height?: number; touch?: boolean } = {}) {
  const context = await browser.newContext({
    viewport: { width: options.width ?? 1280, height: options.height ?? 800 },
    deviceScaleFactor: 1,
    hasTouch: options.touch ?? false,
  });
  const page = await context.newPage();
  return { page, context, close: () => context.close() };
}

type Box = { name: string; x: number; y: number; w: number; h: number };

async function boxes(page: Page, selectors: Record<string, string>): Promise<Box[]> {
  return page.evaluate((entries) => {
    return Object.entries(entries).flatMap(([name, selector]) =>
      [...document.querySelectorAll(selector)].flatMap((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') return [];
        return [{ name, x: r.x, y: r.y, w: r.width, h: r.height }];
      }),
    );
  }, selectors);
}

const meet = (a: Box, b: Box): boolean => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;

/** The Lantern control is in the gauge's column and meets nothing else over the scene. */
async function expectLanternByGauge(page: Page, label: string): Promise<void> {
  const found = await boxes(page, {
    toggle: '[data-testid="lantern-toggle"]',
    gauge: '[data-testid="depth-gauge"]',
    stack: '[data-testid="view-top"] > *',
    attribution: '.attribution',
  });
  const toggle = found.find((b) => b.name === 'toggle');
  const gauge = found.find((b) => b.name === 'gauge');
  expect(toggle, `${label}: the Lantern control is on screen`).toBeDefined();
  expect(gauge, `${label}: the gauge is on screen`).toBeDefined();
  expect(Math.abs(toggle!.x - gauge!.x), `${label}: the control shares the gauge's left edge`).toBeLessThanOrEqual(24);
  expect(toggle!.y + toggle!.h, `${label}: the control is above the gauge`).toBeLessThanOrEqual(gauge!.y);
  for (const other of found.filter((b) => b.name !== 'toggle')) {
    expect(meet(toggle!, other), `${label}: the control overlaps ${other.name}`).toBe(false);
  }
}

test('the Lantern control sits by the gauge, names the plan, helps once, and works with Space, L, the button and a long press', async ({ browser }) => {
  test.setTimeout(480_000);
  const { page, close } = await newPage(browser, { touch: true });
  try {
    await page.goto(placeUrl('today'));
    await playerReady(page);

    const toggle = page.getByTestId('lantern-toggle');
    await expect(toggle).toHaveText('Lantern: 1931-35 plan');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    const help = page.getByTestId('lantern-help');
    await expect(help).toHaveText('Hold Space or press L (on a touch screen, press and hold) to see the 1931-35 plan inside a circle.');
    await expectLanternByGauge(page, 'place page at 1280');

    const canvas = page.getByTestId('unity-canvas');
    const box = (await canvas.boundingBox())!;
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const sameCanvas = async (before: Awaited<ReturnType<typeof canvasPng>>, label: string) => {
      const now = await canvasPng(page);
      const m = mismatch(now, before, () => true, DIFF);
      expect(m.share, label).toBeLessThanOrEqual(0.003);
    };
    const differs = async (before: Awaited<ReturnType<typeof canvasPng>>, label: string) => {
      const now = await canvasPng(page);
      const m = mismatch(now, before, () => true, DIFF);
      expect(m.share, label).toBeGreaterThanOrEqual(0.03);
    };

    const today = await canvasPng(page);

    // The button.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(centre.x, centre.y);
    await page.waitForTimeout(1200);
    await differs(today, 'the button turns the lens on');
    await shoot(page, OUTPUT, 'place-lantern');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.mouse.move(centre.x, centre.y);
    await page.waitForTimeout(900);
    await sameCanvas(today, 'the button turns the lens off');
    // The help is for the first time only: the lens has been used, so the line is gone.
    await expect(help).toHaveCount(0);

    // Space held, with the pointer over the scene.
    await page.keyboard.down('Space');
    await page.waitForTimeout(900);
    await differs(today, 'Space held turns the lens on');
    await page.keyboard.up('Space');
    await page.waitForTimeout(700);
    await sameCanvas(today, 'Space released turns it off');

    // L toggles, Escape ends.
    await page.keyboard.press('l');
    await page.waitForTimeout(900);
    await differs(today, 'L turns the lens on');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(700);
    await sameCanvas(today, 'Escape turns it off');

    // A long press on touch: held 700 ms without moving (the Player takes 500 ms), then let go.
    const touch = await page.context().newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: centre.x, y: centre.y }] });
    await page.waitForTimeout(1200);
    await differs(today, 'a long press turns the lens on');
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(700);
    await sameCanvas(today, 'letting go of the long press turns it off');

    // The help does not come back in this browser.
    await page.reload();
    await playerReady(page);
    await expect(page.getByTestId('lantern-toggle')).toBeVisible();
    await expect(page.getByTestId('lantern-help')).toHaveCount(0);
  } finally {
    await close();
  }
});

test('at 390 px the Lantern control is by the gauge and meets nothing', async ({ browser }) => {
  test.setTimeout(300_000);
  const { page, close } = await newPage(browser, { width: 390, height: 844, touch: true });
  try {
    await page.goto(placeUrl('today'));
    await playerReady(page);
    await expect(page.getByTestId('lantern-toggle')).toHaveText('Lantern: 1931-35 plan');
    await expectLanternByGauge(page, 'place page at 390');
    const toggle = (await boxes(page, { toggle: '[data-testid="lantern-toggle"]' }))[0]!;
    expect(toggle.h, 'a touch target of at least 44 px').toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: join(OUTPUT, 'place-lantern-narrow.png') });
  } finally {
    await close();
  }
});

test('the card has "Show the scan under this building" beside "View original scan", and both reset when it closes', async ({ browser }) => {
  test.setTimeout(480_000);
  const { page, close } = await newPage(browser);
  try {
    await page.goto(placeUrl('1911'));
    await playerReady(page);
    const base = await canvasPng(page);

    await page.getByTestId('feature-list-toggle').click();
    await page.getByTestId(`feature-row-${BANK}`).click();
    const card = page.getByTestId('evidence-card');
    await expect(card).toBeVisible();
    // Opening the card does not change the scene.
    await page.waitForTimeout(1500);
    const withCard = await canvasPng(page);
    expect(mismatch(withCard, base, () => true, DIFF).share, 'opening the card leaves the scene as it was').toBeLessThanOrEqual(0.003);

    const evidence = page.getByTestId('show-evidence');
    const original = page.getByTestId('view-original');
    await expect(evidence).toHaveText('Show the scan under this building');
    await expect(evidence).toHaveAttribute('aria-pressed', 'false');
    await expect(original).toHaveText('View original scan');
    // Side by side: same row, evidence first.
    const [e, o] = await Promise.all([evidence.boundingBox(), original.boundingBox()]);
    expect(Math.abs(e!.y - o!.y), 'the two buttons share a row').toBeLessThanOrEqual(4);
    expect(e!.x, 'the evidence toggle comes first').toBeLessThan(o!.x);

    // On: the scan appears beneath the building.
    await evidence.focus();
    await page.keyboard.press('Enter');
    await expect(evidence).toHaveAttribute('aria-pressed', 'true');
    await expect(evidence).toHaveText('Hide the scan under this building');
    await page.waitForTimeout(2500);
    const shown = await canvasPng(page);
    const on = mismatch(shown, base, () => true, DIFF);
    expect(on.share, 'the scan is drawn under the building').toBeGreaterThanOrEqual(0.003);
    await card.scrollIntoViewIfNeeded();
    await shoot(page, OUTPUT, 'place-evidence-toggle');

    // Off again with the same button.
    await page.keyboard.press('Enter');
    await expect(evidence).toHaveAttribute('aria-pressed', 'false');
    await page.waitForTimeout(2500);
    expect(mismatch(await canvasPng(page), base, () => true, DIFF).share, 'the toggle puts the scene back').toBeLessThanOrEqual(0.003);

    // Both on, then the card closes: both are off, in the scene and on reopening.
    await page.keyboard.press('Enter');
    await original.click();
    await expect(original).toHaveAttribute('aria-pressed', 'true');
    await expect(evidence).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(2500);
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
    await page.waitForTimeout(3000);
    expect(mismatch(await canvasPng(page), base, () => true, DIFF).share, 'closing the card ends both').toBeLessThanOrEqual(0.003);
    await page.getByTestId(`feature-row-${BANK}`).click();
    await expect(page.getByTestId('show-evidence')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('view-original')).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await close();
  }
});

test('without WebGL the card offers neither scan button', async ({ browser }) => {
  test.setTimeout(240_000);
  const { page, close } = await newPage(browser);
  try {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (original as (...args: unknown[]) => unknown).call(this, type, ...rest) as never;
      } as typeof original;
    });
    await page.goto(placeUrl('1911'));
    await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('fallback-2d')).toBeVisible();
    await page.getByTestId('feature-list-toggle').click();
    await page.getByTestId(`feature-row-${BANK}`).click();
    await expect(page.getByTestId('evidence-card')).toBeVisible();
    await expect(page.getByTestId('show-evidence')).toHaveCount(0);
    await expect(page.getByTestId('view-original')).toHaveCount(0);
  } finally {
    await close();
  }
});
