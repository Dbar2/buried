/**
 * Session 029: the evidence card in the report column, the two-way sync between the depth gauge and
 * the core sample, the "Click a building..." hint, the 2D fallback and the list view.
 *
 * Run after `npm run build`: `npx playwright test e2e/cardsync.spec.ts`. Needs the Unity build in
 * web/public/unity/ for the Player tests. Screenshots go to web/e2e/output/card-bank.png,
 * fallback-2d.png, sync-1935.png and the narrow ones beside them.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { lotWithTheBuilding } from './support/lot';

const OUTPUT = join(fileURLToPath(new URL('..', import.meta.url)), 'e2e', 'output');
const BANK = 'bld_fip_v3_1911_229_0001';
const ERA_IDS = ['today', '1947', '1935', '1911'] as const;

test.beforeAll(() => mkdirSync(OUTPUT, { recursive: true }));

const placeUrl = (era: string): string => `/place?lot=${encodeURIComponent(lotWithTheBuilding())}&era=${era}`;

async function playerReady(page: Page): Promise<void> {
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 150_000 });
  await expect(page.getByTestId('view')).toHaveAttribute('data-eras-loaded', /1911/, { timeout: 150_000 });
}

/** The text boxes over the scene must not sit on each other: the stack's pieces, the gauge, the attribution bar. */
async function expectNoOverlap(page: Page, label: string): Promise<void> {
  const boxes = await page.evaluate(() => {
    const pick = (selector: string, name: string) =>
      [...document.querySelectorAll(selector)].flatMap((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || style.display === 'none') return [];
        return [{ name, x: r.x, y: r.y, w: r.width, h: r.height, text: (el.textContent ?? '').slice(0, 40) }];
      });
    return [
      ...pick('[data-testid="view-top"] > *', 'stack'),
      ...pick('[data-testid="view-top"] .feature-list-toggle', 'toggle'),
      ...pick('[data-testid="view-top"] .feature-list-panel', 'panel'),
      ...pick('[data-testid="depth-gauge"]', 'gauge'),
      ...pick('.attribution', 'attribution'),
      ...pick('.stage-message', 'message'),
    ];
  });
  expect(boxes.length, `${label}: something is measured`).toBeGreaterThan(1);
  const meet = (a: (typeof boxes)[number], b: (typeof boxes)[number]) =>
    a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
  // The toggle and the panel sit inside the list's own box.
  const nested = (a: (typeof boxes)[number], b: (typeof boxes)[number]) => (a.name === 'stack' && (b.name === 'toggle' || b.name === 'panel')) || (b.name === 'stack' && (a.name === 'toggle' || a.name === 'panel'));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (nested(a, b)) continue;
      expect(meet(a, b), `${label}: "${a.name}: ${a.text}" overlaps "${b.name}: ${b.text}"`).toBe(false);
    }
  }
}

async function activeBand(page: Page): Promise<string | null> {
  const eras = await page.locator('.band[aria-current="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-era')));
  expect(eras.length, 'at most one band is marked').toBeLessThanOrEqual(1);
  return eras[0] ?? null;
}

async function gaugeEra(page: Page): Promise<string> {
  const index = Number(await page.getByTestId('depth-gauge').getAttribute('aria-valuenow'));
  return ERA_IDS[index] as string;
}

test('the card opens in the report column, with the scan, the record and "View original scan"', async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto(placeUrl('1911'));
  await playerReady(page);

  // The hint is there until the first click.
  const hint = page.getByTestId('view-hint');
  await expect(hint).toHaveText('Click a building in the 3D view to see the evidence behind it.');
  await expectNoOverlap(page, 'place page at 1280, before a click');

  // The list is the keyboard path to what a click on a ghost does.
  const toggle = page.getByTestId('feature-list-toggle');
  await expect(toggle).toHaveText(/^List the features \(\d+\)$/);
  await toggle.focus();
  await page.keyboard.press('Enter');
  const row = page.getByTestId(`feature-row-${BANK}`);
  await expect(row).toBeVisible();
  await expectNoOverlap(page, 'place page at 1280, list open');
  await row.focus();
  const lit = PNG.sync.read(await page.getByTestId('unity-canvas').screenshot());
  await page.keyboard.press('Enter');

  const card = page.getByTestId('evidence-card');
  await expect(card).toBeVisible();
  // It is part of the report column, not an overlay on the scene.
  expect(await card.evaluate((el) => !!el.closest('.place-report'))).toBe(true);
  expect(await card.evaluate((el) => !!el.closest('.view'))).toBe(false);
  await expect(page.getByTestId('place-report-body')).toBeHidden();
  await expect(page.getByTestId('card-heading')).toBeFocused();
  await expect(hint).toHaveCount(0);

  await expect(page.getByTestId('card-heading')).toHaveText(/^Bank of Nova Scotia; offices on 2nd/);
  await expect(page.getByTestId('card-use')).toHaveText(/^Bank of Nova Scotia; offices on 2nd/);
  await expect(page.getByTestId('card-confidence')).toContainText(/^(Documented|Estimated|Unknown)\. /);
  await expect(page.getByTestId('card-position')).toHaveText(/^Positioned within about \d+(\.\d)? m$/);
  await expect(page.getByTestId('card-confirmed')).toHaveText('Confirmed by: Buried maintainers (gate draft, unreviewed), 2026-11-12.');
  await expect(page.getByTestId('card-source')).toContainText('Digitized and georeferenced by the University of Toronto Map & Data Library.');
  const text = (await card.innerText()).replace(/\s+/g, ' ');
  expect(text).not.toMatch(/checked by a person/i);
  expect(text).not.toMatch(/\b(reviewed|verified|checked|confirmed) by\b(?!:)/i);

  // The crop is cut from the untouched scan and has the outline on it.
  const crop = page.getByTestId('card-crop');
  await expect(crop).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  const tones = await crop.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 61) seen.add(((data[i] as number) >> 4) * 256 + (((data[i + 1] as number) >> 4) << 4) + ((data[i + 2] as number) >> 4));
    return seen.size;
  });
  expect(tones, 'the crop holds a picture').toBeGreaterThan(3);

  // Keys: Tab reaches the buttons of the card; "View original scan" switches the scene's drapes.
  const original = page.getByTestId('view-original');
  await expect(original).toHaveText('View original scan');
  await expect(original).toHaveAttribute('aria-pressed', 'false');
  await original.focus();
  await page.keyboard.press('Enter');
  await expect(original).toHaveAttribute('aria-pressed', 'true');
  await expect(original).toHaveText('Back to the lit map');
  await page.waitForTimeout(3000);
  const plain = PNG.sync.read(await page.getByTestId('unity-canvas').screenshot());
  expect(plain.width).toBe(lit.width);
  let changed = 0;
  for (let i = 0; i < plain.data.length; i += 4) {
    const d = Math.abs((plain.data[i] as number) - (lit.data[i] as number)) + Math.abs((plain.data[i + 1] as number) - (lit.data[i + 1] as number)) + Math.abs((plain.data[i + 2] as number) - (lit.data[i + 2] as number));
    if (d > 24) changed++;
  }
  expect(changed / (plain.width * plain.height), 'the scene shows the untouched scan').toBeGreaterThan(0.005);
  await page.screenshot({ path: join(OUTPUT, 'card-bank.png') });

  // Escape closes the card: the report comes back, the scene is lit again, focus returns to the row.
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);
  await expect(page.getByTestId('place-report-body')).toBeVisible();
  await expect(row).toBeFocused();
  await expect(hint).toHaveCount(0); // after a first choice the hint does not come back
});

test('the hint goes after a click on the scene, and no scene text overlaps at 390 px', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(placeUrl('1911'));
  await playerReady(page);
  const hint = page.getByTestId('view-hint');
  await expect(hint).toBeVisible();
  await expectNoOverlap(page, 'place page at 390');
  await page.getByTestId('feature-list-toggle').click();
  await expectNoOverlap(page, 'place page at 390, list open');
  await page.screenshot({ path: join(OUTPUT, 'card-narrow.png') });
  await page.getByTestId('feature-list-toggle').click();

  // A click on the scene (empty ground is enough) counts as the first click.
  const box = (await page.getByTestId('unity-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await expect(hint).toHaveCount(0);
  await expectNoOverlap(page, 'place page at 390, after a click');
});

test('the gauge and the core sample follow each other, in both directions', async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto(placeUrl('1911'));
  await playerReady(page);
  const settled = async (era: string, label: string) => {
    await expect(page.getByTestId('era-announcement')).toHaveText(`Now showing ${label}`, { timeout: 20_000 });
    await expect.poll(() => gaugeEra(page)).toBe(era);
    await expect.poll(() => activeBand(page)).toBe(era);
    await expect(page.getByTestId(`band-now-${era}`)).toHaveText('Showing');
    await expect(page.getByTestId('header-era')).toHaveText(label);
    // The marked band is inside the visible part of the report column.
    const inView = await page.getByTestId(`band-${era}`).evaluate((band) => {
      const column = band.closest('.report-scroll') as HTMLElement;
      const b = band.getBoundingClientRect();
      const c = column.getBoundingClientRect();
      return b.top >= c.top - 1 && b.bottom <= c.bottom + 1;
    });
    expect(inView, `the ${era} band is in view`).toBe(true);
  };

  await settled('1911', '1911 (revised to 1914)');

  // Gauge to core sample: the keys.
  await page.getByTestId('depth-gauge').focus();
  await page.keyboard.press('ArrowUp');
  await settled('1935', '1935');
  await page.screenshot({ path: join(OUTPUT, 'sync-1935.png') });
  await page.keyboard.press('Home');
  await settled('today', 'Today');

  // Core sample to gauge: choosing a band moves the scene, and choosing it again after digging away works.
  await page.getByTestId('band-select-1947').click();
  await settled('1947', '1947');
  await page.getByTestId('depth-gauge').focus();
  await page.keyboard.press('End');
  await settled('1911', '1911 (revised to 1914)');
  await page.getByTestId('band-select-1947').click();
  await settled('1947', '1947');
  await page.getByTestId('depth-gauge').focus();
  await page.keyboard.press('Home');
  await settled('today', 'Today');
  await page.getByTestId('band-select-1947').click();
  await settled('1947', '1947');

  // Gauge to core sample: the wheel over the scene digs, and the band follows.
  const box = (await page.getByTestId('unity-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => gaugeEra(page), { timeout: 20_000 }).not.toBe('1947');
  const era = await gaugeEra(page);
  await expect.poll(() => activeBand(page)).toBe(era);
});

test('the share link follows the era on screen', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto(placeUrl('1911'));
  await playerReady(page);
  await page.getByTestId('depth-gauge').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page).toHaveURL(/era=1935/);
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

async function listedCount(page: Page): Promise<number> {
  const label = (await page.getByTestId('feature-list-toggle').textContent()) ?? '';
  return Number(/\((\d+)\)/.exec(label)?.[1]);
}

test('without WebGL the 2D map stands in for the scene, with the same records as the list', async ({ page }) => {
  test.setTimeout(240_000);
  await withoutWebGL(page);
  await page.goto(placeUrl('1935'));
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });

  const reason = page.getByTestId('fallback-reason');
  await expect(reason).toContainText('WebGL 2 is not available');
  await expect(reason).toContainText('The map below shows the same records.');
  const map = page.getByTestId('fallback-2d');
  await expect(map).toBeVisible();
  await expect(map).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await expect(page.getByTestId('view-hint')).toHaveCount(0);
  await expect(page.locator('#unity-canvas')).toHaveCount(0);

  // The 1935 tile is drawn untouched under the footprints.
  await expect(map).toHaveAttribute('data-tiles-loaded', /^[1-9]/, { timeout: 30_000 });
  await expect.poll(() => gaugeEra(page)).toBe('1935');
  await expect(map).toHaveAttribute('data-era', '1935');
  const tones = await map.evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const seen = new Set<number>();
    for (let i = 0; i < data.length; i += 4 * 211) seen.add(((data[i] as number) >> 4) * 256 + (((data[i + 1] as number) >> 4) << 4) + ((data[i + 2] as number) >> 4));
    return seen.size;
  });
  expect(tones, 'the map holds a picture').toBeGreaterThan(3);

  // The same footprint count as the era list, in every era; the gauge works and the report follows.
  for (const era of ['1935', '1911', '1947', 'today'] as const) {
    await page.getByTestId('depth-gauge').focus();
    if (era === '1911') await page.keyboard.press('End');
    if (era === '1947') await page.keyboard.press('Home');
    if (era === '1947') await page.keyboard.press('ArrowDown');
    if (era === 'today') await page.keyboard.press('Home');
    await expect(map).toHaveAttribute('data-era', era, { timeout: 20_000 });
    await expect.poll(() => activeBand(page)).toBe(era);
    const drawn = Number(await map.getAttribute('data-feature-count'));
    expect(await listedCount(page), `${era}: the list and the map agree`).toBe(drawn);
    await page.getByTestId('feature-list-toggle').click();
    expect(await page.locator('[data-testid^="feature-row-"]').count(), `${era}: one row per footprint`).toBe(drawn);
    await expectNoOverlap(page, `fallback at 1280, ${era}`);
    await page.getByTestId('feature-list-toggle').click();
  }

  await page.getByTestId('depth-gauge').focus();
  await page.keyboard.press('End');
  await expect(map).toHaveAttribute('data-era', '1911', { timeout: 20_000 });
  await expect(page.getByTestId('fallback-2d')).toHaveAttribute('data-state', 'done');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUTPUT, 'fallback-2d.png') });

  // A building chosen from the list opens its card, with no "View original scan" (the map shows the scan as it is).
  await page.getByTestId('feature-list-toggle').click();
  await page.getByTestId(`feature-row-${BANK}`).click();
  await expect(page.getByTestId('card-heading')).toHaveText(/^Bank of Nova Scotia; offices on 2nd/);
  await expect(page.getByTestId('view-original')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('evidence-card')).toHaveCount(0);
});

test('when the Player cannot load, the 2D map stands in and says why', async ({ page }) => {
  test.setTimeout(240_000);
  await page.route('**/unity/**', (route) => route.abort());
  await page.goto(placeUrl('1911'));
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
  const reason = page.getByTestId('fallback-reason');
  await expect(reason).toContainText('The 3D view did not load', { timeout: 120_000 });
  await expect(page.getByTestId('fallback-2d')).toBeVisible();
  await expect(page.getByTestId('report')).toBeVisible();
  await expectNoOverlap(page, 'Player failed, 1280');
});

test('narrow, without WebGL: the map, the reason, the gauge and the list do not overlap', async ({ page }) => {
  test.setTimeout(240_000);
  await withoutWebGL(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(placeUrl('1911'));
  await expect(page.getByTestId('fallback-2d')).toHaveAttribute('data-state', 'done', { timeout: 60_000 });
  await expectNoOverlap(page, 'fallback at 390');
  await page.getByTestId('feature-list-toggle').click();
  await expectNoOverlap(page, 'fallback at 390, list open');
  await page.screenshot({ path: join(OUTPUT, 'fallback-narrow.png') });
});
