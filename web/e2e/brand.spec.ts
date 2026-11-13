/**
 * The landing, the place page and the brand shell (session 024).
 *
 * Run after `npm run build`: `npx playwright test e2e/brand.spec.ts`. Needs the Unity build in
 * web/public/unity/ for the scene behind the landing and beside the report. Screenshots go to
 * web/e2e/output/brand-landing.png, brand-place-1911.png and brand-place-narrow.png; the Studio's is
 * written by e2e/studio-brand.spec.ts (it needs the Studio service).
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(WEB, '..', 'data');
const OUTPUT = join(WEB, 'e2e', 'output');
const ORIGIN = 'http://127.0.0.1:4173';

type Ring = number[][];
const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;

function inside(point: [number, number], ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The lot that contains the committed 1911 building `bld_fip_v3_1911_229_0001`: a lot with a building on it. */
function lotWithABuilding(): string {
  const evidence = readJson<{ features: Array<{ id: string; geometry: { coordinates: Ring[] } }> }>('evidence', 'fip_v3_1911_229.geojson');
  const building = evidence.features.find((f) => f.id === 'bld_fip_v3_1911_229_0001');
  if (!building) throw new Error('the committed building is missing');
  const ring = building.geometry.coordinates[0] as Ring;
  const centre: [number, number] = [ring.reduce((s, p) => s + (p[0] as number), 0) / ring.length, ring.reduce((s, p) => s + (p[1] as number), 0) / ring.length];
  const lots = readJson<{ features: Array<{ id: string; geometry: { type: string; coordinates: Ring[] | Ring[][] } }> }>('present', 'present_toronto_property_boundaries_2026.geojson');
  for (const lot of lots.features) {
    const polygons = (lot.geometry.type === 'MultiPolygon' ? lot.geometry.coordinates : [lot.geometry.coordinates]) as Ring[][];
    if (polygons.some((p) => inside(centre, p[0] as Ring))) return lot.id;
  }
  throw new Error('no lot contains the committed building');
}

const channel = (v: number): number => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: number[]): number => 0.2126 * channel(r as number) + 0.7152 * channel(g as number) + 0.0722 * channel(b as number);
const contrast = (a: number[], b: number[]): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
const rgbOf = (css: string): number[] => (/rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css) ?? []).slice(1, 4).map(Number);

/** The colour of an element's text and the first opaque background behind it. */
async function colours(page: Page, selector: string): Promise<{ text: number[]; background: number[] }> {
  const { text, background } = await page.locator(selector).first().evaluate((el) => {
    let node: Element | null = el;
    let background = 'rgba(0, 0, 0, 0)';
    while (node) {
      const value = getComputedStyle(node).backgroundColor;
      if (!/rgba\(\d+,\s*\d+,\s*\d+,\s*0\)/.test(value) && value !== 'transparent') {
        background = value;
        break;
      }
      node = node.parentElement;
    }
    return { text: getComputedStyle(el).color, background };
  });
  return { text: rgbOf(text), background: rgbOf(background) };
}

async function fontFamily(page: Page, selector: string): Promise<string> {
  return page.locator(selector).first().evaluate((el) => (getComputedStyle(el).fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim());
}

test.beforeAll(() => mkdirSync(OUTPUT, { recursive: true }));

test('the landing: the scene, the wordmark, one field and three real examples; nothing leaves the origin', async ({ page }) => {
  test.setTimeout(240_000);
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await page.goto('/');

  await expect(page.getByTestId('landing')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Buried');
  const field = page.getByRole('searchbox', { name: 'What was here?' });
  await expect(field).toBeEnabled({ timeout: 60_000 });
  await expect(field).toHaveAttribute('placeholder', 'What was here?');
  const examples = page.getByTestId('landing-examples').locator('a');
  await expect(examples).toHaveCount(3, { timeout: 60_000 });
  // Nothing else on the page: one field, three examples, no nav.
  await expect(page.locator('input:visible')).toHaveCount(1);
  await expect(page.locator('nav')).toHaveCount(0);

  // The dusk scene is behind it: give the Player time to start, then look.
  await expect(page.getByTestId('unity-canvas')).toBeAttached({ timeout: 150_000 });
  await page.waitForTimeout(6000);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUTPUT, 'brand-landing.png') });

  // Fonts: self-hosted, and the right families.
  expect(await fontFamily(page, '.landing-wordmark')).toBe('Libre Baskerville');
  expect(await fontFamily(page, '#landing-address')).toBe('Source Sans 3');
  expect(await page.evaluate(() => document.fonts.check('400 28px "Libre Baskerville"') && document.fonts.check('16px "Source Sans 3"'))).toBe(true);
  expect(requested.some((u) => /\.woff2?$/.test(u)), 'the fonts are served from the site').toBe(true);
  const foreign = requested.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('data:') && !u.startsWith('blob:'));
  expect(foreign).toEqual([]);

  // The keys reach the field and an address opens its place page.
  await field.focus();
  await page.keyboard.type('Eastern');
  await expect(field).toHaveValue('Eastern');
  await expect(page.getByTestId('landing-hits').locator('button').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/place\?lot=/);
});

test('an example address opens the place page for its lot', async ({ page }) => {
  await page.goto('/');
  const first = page.getByTestId('landing-examples').locator('a').first();
  await expect(first).toBeVisible({ timeout: 60_000 });
  const href = (await first.getAttribute('href')) as string;
  expect(href).toMatch(/^\/place\?lot=/);
  await first.click();
  await page.waitForURL(/\/place\?lot=/);
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
});

test('the place page dug to 1911: scene left, report right, four bands in order, keys reach everything', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const lot = lotWithABuilding();
  await page.goto(`/place?lot=${encodeURIComponent(lot)}&era=1911`);
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 150_000 });
  await expect(page.getByTestId('era-announcement')).toHaveText('Now showing 1911 (revised to 1914)', { timeout: 60_000 });
  await expect(page.getByTestId('header-address')).toBeVisible();

  // Layout: about 58 / 42, the gauge on the scene's left edge.
  const scene = (await page.locator('.place-scene').boundingBox())!;
  const report = (await page.locator('.place-report').boundingBox())!;
  const share = scene.width / (scene.width + report.width);
  expect(share).toBeGreaterThan(0.54);
  expect(share).toBeLessThan(0.62);
  const gauge = (await page.getByTestId('depth-gauge').boundingBox())!;
  expect(gauge.x - scene.x).toBeLessThan(scene.width * 0.2);

  // The core sample: four bands in order, Today first, each with its picture or its plain line.
  const eras = await page.locator('.band').evaluateAll((els) => els.map((e) => e.getAttribute('data-era')));
  expect(eras).toEqual(['today', '1947', '1935', '1911']);
  await expect(page.getByTestId('crop-none-1947')).toHaveText('No 1947 photograph loaded yet');
  for (const era of ['today', '1935', '1911']) {
    await expect(page.getByTestId(`crop-canvas-${era}`)).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  }
  // Each drawn crop holds a picture (more than one tone) and the lot's ink outline.
  for (const era of ['today', '1935', '1911']) {
    const tones = await page.getByTestId(`crop-canvas-${era}`).evaluate((canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext('2d')!;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4 * 97) seen.add(((data[i] as number) >> 4) * 256 + (((data[i + 1] as number) >> 4) << 4) + ((data[i + 2] as number) >> 4));
      return seen.size;
    });
    expect(tones, `${era} crop has content`).toBeGreaterThan(3);
  }
  // A crop cut from a source nobody has reviewed at this lot says so; a reviewed one has no flag.
  const flags = await page.locator('[data-testid^="crop-flag-"]').allTextContents();
  for (const flag of flags) expect(flag).toBe('From the plate, not yet reviewed');
  // Plain words: no plate number or id in the sentences beside the crops.
  const bandText = (await page.locator('.band-text p').allTextContents()).filter((t) => !t.startsWith('Uses recorded'));
  expect(bandText.length).toBeGreaterThan(0);
  for (const text of bandText) expect(text).not.toMatch(/fip_|aerial_|\bplate\b/);

  // Fonts and contrast.
  expect(await fontFamily(page, '.report h1')).toBe('Libre Baskerville');
  expect(await fontFamily(page, '.band-text p')).toBe('Source Sans 3');
  expect(await fontFamily(page, '[data-era="1911"] .band-label')).toBe('IBM Plex Mono');
  const dark = await colours(page, '[data-testid="header-address"]');
  expect(contrast(dark.text, dark.background), 'text on the dark theme').toBeGreaterThanOrEqual(4.5);
  const hint = await colours(page, '.view-hint');
  expect(contrast(hint.text, hint.background), 'hint text on fog').toBeGreaterThanOrEqual(4.5);
  const paper = await colours(page, '.band-text p');
  expect(contrast(paper.text, paper.background), 'text on paper').toBeGreaterThanOrEqual(4.5);
  const soft = await colours(page, '.report .small');
  expect(contrast(soft.text, soft.background), 'secondary text on paper').toBeGreaterThanOrEqual(4.5);

  await page.screenshot({ path: join(OUTPUT, 'brand-place-1911.png') });

  // Keys: Tab reaches the gauge, each crop and the PDF action.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const wanted = new Set(['depth-gauge', 'crop-today', 'crop-1935', 'crop-1911', 'print']);
  const reached = new Set<string>();
  for (let i = 0; i < 160 && reached.size < wanted.size; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    if (wanted.has(id)) reached.add(id);
  }
  expect([...reached].sort()).toEqual([...wanted].sort());

  // A crop opens larger on Enter, with its attribution, and Escape closes it.
  await page.getByTestId('crop-1911').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByTestId('crop-dialog-1911');
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId('crop-large-1911')).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await expect(dialog).toContainText('University of Toronto Map & Data Library');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('crop-1911')).toBeFocused();
});

test('the place page on a narrow screen: the report sits below the scene', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const lot = lotWithABuilding();
  await page.goto(`/place?lot=${encodeURIComponent(lot)}&era=1911`);
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 150_000 });
  const scene = (await page.locator('.place-scene').boundingBox())!;
  const report = (await page.locator('.place-report').boundingBox())!;
  expect(report.y).toBeGreaterThanOrEqual(scene.y + scene.height - 1);
  expect(report.width).toBeGreaterThan(300);
  // Nothing pushes the page wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.body.scrollWidth <= window.innerWidth)).toBe(true);
  const nav = (await page.getByTestId('nav-sources').boundingBox())!;
  expect(nav.x + nav.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: join(OUTPUT, 'brand-place-narrow.png') });
});

test('the Report route stays the print and share target and uses the same bands', async ({ page }) => {
  const lot = lotWithABuilding();
  await page.goto(`/report?lot=${encodeURIComponent(lot)}&era=1911`);
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
  const eras = await page.locator('.band').evaluateAll((els) => els.map((e) => e.getAttribute('data-era')));
  expect(eras).toEqual(['today', '1947', '1935', '1911']);
  await expect(page.getByTestId('live-link')).toHaveAttribute('href', /\/place\?lot=/);
});
