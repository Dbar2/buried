/**
 * Land-use areas, end to end (session 032): trace the yard lettered "COAL & WOOD YARD" near Sumach St
 * on `fip_v3_1911_229`, type the use as lettered, set the crop it was read from, publish as a test
 * reviewer with a reviewed area, then open the place page of the lot it lies on and check the land-use
 * sentence and the crop of the lettering in the evidence card. Plate 232 (1935) is never used.
 *
 * Run after `npm run build`: `npx playwright test -c playwright.landuse.config.ts` (the config starts
 * the Studio service on port 8766 and `vite preview` on 4184, and never reuses a server).
 * Screenshots: web/e2e/output/landuse-studio.png and landuse-place.png.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

const PLATE = 'fip_v3_1911_229';
const WEB = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(WEB, '..', 'data');
const OUTPUT = join(WEB, 'e2e', 'output');
const USE = 'COAL & WOOD YARD';

// The yard on the plate, in full-resolution plate pixels (read off the tile; checked by the screenshot).
const YARD: Array<[number, number]> = [
  [831, 3858],
  [1242, 3858],
  [1242, 4084],
  [831, 4084],
];
// The lettering "COAL & WOOD YARD" inside it.
const LETTERING = { x: 785, y: 3885, width: 445, height: 95 };
// A reviewed area that holds the yard and no building the plate draws.
const REVIEWED = { x0: 800, y0: 3830, x1: 1270, y1: 4110 };

type View = { k: number; tx: number; ty: number };
type Sidecar = {
  width_px: number;
  height_px: number;
  corners: { top_left: number[]; top_right: number[]; bottom_left: number[] };
  crop_px: { x: number; y: number; width: number; height: number };
};
type Ring = number[][];

const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;

/** Plate pixels to EPSG:26917 through the tile's own corners. */
function plateToWorld(s: Sidecar, x: number, y: number): [number, number] {
  const u = ((x - s.crop_px.x) * s.width_px) / s.crop_px.width;
  const v = ((y - s.crop_px.y) * s.height_px) / s.crop_px.height;
  const [tlx, tly] = s.corners.top_left as [number, number];
  const [trx, try_] = s.corners.top_right as [number, number];
  const [blx, bly] = s.corners.bottom_left as [number, number];
  return [tlx + (u * (trx - tlx)) / s.width_px + (v * (blx - tlx)) / s.height_px, tly + (u * (try_ - tly)) / s.width_px + (v * (bly - tly)) / s.height_px];
}

function inside(point: [number, number], ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The lot in the committed City layer that contains the middle of the traced yard. */
function lotUnderTheYard(): string {
  const sidecar = readJson<Sidecar>('tiles', `${PLATE}.json`);
  const cx = YARD.reduce((s, p) => s + p[0], 0) / YARD.length;
  const cy = YARD.reduce((s, p) => s + p[1], 0) / YARD.length;
  const centre = plateToWorld(sidecar, cx, cy);
  const lots = readJson<{ features: Array<{ id: string; geometry: { type: string; coordinates: Ring[] | Ring[][] } }> }>('present', 'present_toronto_property_boundaries_2026.geojson');
  for (const lot of lots.features) {
    const polygons = (lot.geometry.type === 'MultiPolygon' ? lot.geometry.coordinates : [lot.geometry.coordinates]) as Ring[][];
    if (polygons.some((p) => inside(centre, p[0] as Ring))) return lot.id;
  }
  throw new Error(`no City lot contains the middle of the yard at ${centre.join(', ')}`);
}

const viewOf = async (canvas: Locator): Promise<View> => JSON.parse((await canvas.getAttribute('data-view')) as string) as View;

async function mouseOnPlate(page: Page, canvas: Locator, [x, y]: [number, number]) {
  const box = (await canvas.boundingBox())!;
  const v = await viewOf(canvas);
  return { x: box.x + x * v.k + v.tx, y: box.y + y * v.k + v.ty };
}

test('trace a land-use area, publish it, and read it on the place page', async ({ page }) => {
  test.setTimeout(420_000);
  mkdirSync(OUTPUT, { recursive: true });
  const lot = lotUnderTheYard();

  await page.goto('/studio');
  await page.getByTestId(`plate-${PLATE}`).click();
  await page.getByTestId('extract').click();
  await expect(page.locator('.proposal-list summary')).toContainText('All proposals');

  // ---- Trace ----
  const canvas = page.getByTestId('plate-canvas');
  const ready = Number(await canvas.getAttribute('data-drawn'));
  expect(ready).toBeGreaterThanOrEqual(0);

  // Zoom in over the yard with the wheel, then pan it to the middle of the pane.
  const yardMiddle: [number, number] = [1036, 3971];
  const at = await mouseOnPlate(page, canvas, yardMiddle);
  const k0 = (await viewOf(canvas)).k;
  await page.mouse.move(at.x, at.y);
  await page.mouse.wheel(0, -700);
  await page.mouse.wheel(0, -700);
  await expect.poll(async () => (await viewOf(canvas)).k).toBeGreaterThan(k0 * 5);
  const box = (await canvas.boundingBox())!;
  const from = await mouseOnPlate(page, canvas, yardMiddle);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + box.x + box.width / 2) / 2, (from.y + box.y + box.height / 2) / 2, { steps: 5 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.abs((await mouseOnPlate(page, canvas, yardMiddle)).x - (box.x + box.width / 2))).toBeLessThan(3);

  await expect(page.getByTestId('no-areas')).toBeVisible();
  await page.getByTestId('trace-area').click();
  await expect(page.getByTestId('trace-panel')).toBeVisible();

  // Four corners by clicking, then a fifth that Backspace takes away again.
  for (const corner of YARD) {
    const p = await mouseOnPlate(page, canvas, corner);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByTestId('corner-count')).toHaveText('4 corners, open');
  const extra = await mouseOnPlate(page, canvas, [1100, 3900]);
  await page.mouse.click(extra.x, extra.y);
  await expect(page.getByTestId('corner-count')).toHaveText('5 corners, open');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('corner-count')).toHaveText('4 corners, open');

  // A corner can be dragged before the outline is saved.
  const xBefore = Number(await page.getByTestId('corner-x-2').inputValue());
  const corner2 = await mouseOnPlate(page, canvas, YARD[2]!);
  await page.mouse.move(corner2.x, corner2.y);
  await page.mouse.down();
  await page.mouse.move(corner2.x + 6, corner2.y, { steps: 3 });
  await page.mouse.move(corner2.x + 12, corner2.y, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.getByTestId('corner-x-2').inputValue())).toBeGreaterThan(xBefore);
  await expect(page.getByTestId('corner-count')).toHaveText('4 corners, open');

  // Enter closes the outline. Nothing can be saved without the lettering and its crop.
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('corner-count')).toHaveText('4 corners, closed');
  await expect(page.getByTestId('area-save')).toBeDisabled();
  await expect(page.getByTestId('area-problems')).toContainText('Type the use as it is lettered on the plate.');
  await expect(page.getByTestId('area-problems')).toContainText('Drag a crop around the lettering');

  // Lettering with a banned word warns and does not block; the plate's own words follow.
  await page.getByTestId('area-use').fill('Clean works');
  await expect(page.getByTestId('banned-warning')).toContainText('Report will name the source and show the crop');
  await page.getByTestId('area-use').fill(USE);
  await expect(page.getByTestId('banned-warning')).toHaveCount(0);

  // The crop the lettering was read from: dragged on the plate.
  await page.getByTestId('read-draw').click();
  const c0 = await mouseOnPlate(page, canvas, [LETTERING.x, LETTERING.y]);
  const c1 = await mouseOnPlate(page, canvas, [LETTERING.x + LETTERING.width, LETTERING.y + LETTERING.height]);
  await page.mouse.move(c0.x, c0.y);
  await page.mouse.down();
  await page.mouse.move((c0.x + c1.x) / 2, (c0.y + c1.y) / 2, { steps: 4 });
  await page.mouse.move(c1.x, c1.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('read-crop-preview')).toBeVisible();
  await expect.poll(async () => Math.abs(Number(await page.getByTestId('read-x').inputValue()) - LETTERING.x)).toBeLessThan(10);
  await expect(page.getByTestId('area-problems')).toHaveCount(0);
  await expect(page.getByTestId('area-save')).toBeEnabled();

  await page.getByTestId('area-save').click();
  await expect(page.getByTestId('area-item-use')).toHaveText(USE);
  await expect(page.getByTestId('plate-area-label')).toHaveText(USE);
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUTPUT, 'landuse-studio.png') });

  // ---- Publish ----
  await page.getByTestId('step-publish').click();
  await page.getByTestId('reviewer').fill('Test reviewer');
  await expect(page.getByTestId('publish-areas')).toContainText(USE);
  await page.getByTestId('area-draw').click();
  const r0 = await mouseOnPlate(page, canvas, [REVIEWED.x0, REVIEWED.y0]);
  const r1 = await mouseOnPlate(page, canvas, [REVIEWED.x1, REVIEWED.y1]);
  await page.mouse.move(r0.x, r0.y);
  await page.mouse.down();
  await page.mouse.move((r0.x + r1.x) / 2, (r0.y + r1.y) / 2, { steps: 4 });
  await page.mouse.move(r1.x, r1.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('area-readout')).toContainText('Area');
  await expect(page.getByTestId('blockers')).toHaveCount(0);
  await page.getByTestId('area-statement').check();
  await expect(page.getByTestId('dry-run-ok')).toContainText('1 land-use area would be added', { timeout: 30_000 });
  await page.getByTestId('publish').click();
  await expect(page.getByTestId('published')).toContainText('1 land-use area stored.');

  // The bundle for review holds the area as a `use_` feature.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-bundle').click()]);
  const bundle = readFileSync((await download.path()) as string).toString('latin1');
  expect(bundle).toMatch(new RegExp(`use_${PLATE}_\\d{4}`));
  expect(bundle).toContain('"kind": "land_use"');
  expect(bundle).toContain(USE);

  // ---- The place page, without the Player: the 2D map, the list and the card ----
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
      return (original as (...args: unknown[]) => unknown).call(this, type, ...rest) as never;
    } as typeof original;
  });
  await page.goto(`/place?lot=${encodeURIComponent(lot)}&era=1911`);
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
  const workspace = page.getByTestId('workspace-section');
  await expect(workspace).toContainText(`lettered on the 1911 plan as '${USE}'`);
  await expect(workspace).toContainText('Documented');
  await expect(workspace).toContainText('Positioned within about');

  const map = page.getByTestId('fallback-2d');
  await expect(map).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await page.getByTestId('feature-list-toggle').click();
  const row = page.locator('[data-testid^="feature-row-use_"]').first();
  await expect(row).toBeVisible();
  await row.click();

  const card = page.getByTestId('evidence-card');
  await expect(card).toBeVisible();
  await expect(page.getByTestId('card-heading')).toHaveText(USE);
  await expect(page.getByTestId('card-use')).toHaveText(USE);
  await expect(page.getByTestId('card-origin')).toContainText('From your workspace');
  const crop = page.getByTestId('card-crop');
  await expect(crop).toHaveAttribute('data-state', 'done', { timeout: 30_000 });

  // The crop of the lettering, cut from the untouched scan: it holds ink and paper.
  const reading = page.getByTestId('card-reading-crop');
  await expect(reading).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await expect(page.getByTestId('card-reading-caption')).toContainText('The crop the use was read from');
  const tones = await reading.evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    let light = 0;
    for (let i = 0; i < data.length; i += 4) {
      const l = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      if (l < 90) dark++;
      else if (l > 180) light++;
    }
    return { dark, light, width: c.width, height: c.height };
  });
  expect(tones.width).toBeGreaterThan(100);
  expect(tones.dark, 'the crop holds printed lettering').toBeGreaterThan(50);
  expect(tones.light, 'the crop holds paper').toBeGreaterThan(50);
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUTPUT, 'landuse-place.png') });
});
