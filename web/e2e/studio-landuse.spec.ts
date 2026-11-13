/**
 * Land-use areas, end to end (session 032): trace the yard lettered "COAL & WOOD YARD" near Sumach St
 * on `fip_v3_1911_229`, type the use as lettered, set the crop it was read from, publish as a test
 * reviewer with a reviewed area, then open the place page of the lot it lies on and check the land-use
 * sentence and the crop of the lettering in the evidence card. Plate 232 (1935) is never used.
 *
 * Run after `npm run build`: `npx playwright test -c playwright.landuse.config.ts` (the config starts
 * the Studio service on port 8766 and `vite preview` on 4184, and never reuses a server).
 * Screenshots: web/e2e/output/landuse-studio.png, landuse-place.png (no Player) and scene-area.png (the Player draws the area,
 * session 034; with scene-area.json and scene-area-frame-times-*.json).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { centroid, measureArea } from './support/areaPixels';
import type { P } from './support/areaPixels';
import { project as projectPoint } from './support/drapeMath';
import { flyDebugCamera, frameTimes, sceneOnlyPng, settleCamera } from './support/scene';

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
  test.setTimeout(900_000);
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
  const rows = page.locator('[data-testid^="feature-row-use_"]');
  // The committed coal yard and the area just traced are both listed. A person can tell them apart in the row itself:
  // only the workspace area says "From your workspace".
  const row = rows.filter({ has: page.getByTestId('feature-origin') });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('From your workspace');
  await expect(row).toContainText(USE);
  const committed = rows.filter({ hasNot: page.getByTestId('feature-origin') });
  expect(await committed.count(), 'the committed areas are listed without the workspace line').toBeGreaterThanOrEqual(1);
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

  // ---- The place page with the Player: the area is drawn on the ground (bridge 0.7.0, session 034) ----
  // The picture with the area is compared with the picture of the same view without it (`?areas=0`): inside the
  // area the difference is the hatching, read here in greyscale, and outside it there is none.
  const scene = await page.context().newPage();
  // The workspace with its one area, kept for the frame-rate run below and for looking at the scene again by hand.
  const workspaceState = await page.context().storageState({ indexedDB: true });
  writeFileSync(join(OUTPUT, 'landuse-workspace-state.json'), JSON.stringify(workspaceState));
  writeFileSync(join(OUTPUT, 'landuse-lot.txt'), lot);
  const sceneUrl = `/place?lot=${encodeURIComponent(lot)}&era=1911&debug=1&markers=0`;
  const sidecar = readJson<Sidecar>('tiles', `${PLATE}.json`);
  const origin = readJson<{ origin: { easting: number; northing: number } }>('project.json').origin;
  const yardWorld = YARD.map(([x, y]) => plateToWorld(sidecar, x, y));
  const yardCentre: [number, number] = [yardWorld.reduce((s, p) => s + p[0], 0) / yardWorld.length, yardWorld.reduce((s, p) => s + p[1], 0) / yardWorld.length];

  // The camera is flown over the yard, so it fills enough of the canvas to measure (the debug camera; `debug=1`).
  async function openScene(target: string, on: Page = scene) {
    await on.goto(target);
    await expect(on.getByTestId('report')).toBeVisible({ timeout: 60_000 });
    await expect(on.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 150_000 });
    await expect(on.getByTestId('view')).toHaveAttribute('data-eras-loaded', /1911/, { timeout: 150_000 });
    await settleCamera(on);
    return flyDebugCamera(on, { target: yardCentre, distanceM: 70, pitchDeg: 55, headingDeg: 20 });
  }

  const camera = await openScene(sceneUrl);
  await expect(scene.getByTestId('view')).toHaveAttribute('data-workspace-features', '1');
  const ring: P[] = yardWorld.map(([e, n]) => projectPoint(camera.viewProjection, camera.canvas, e - origin.easting, 0, n - origin.northing) as P);
  const withArea = await sceneOnlyPng(scene);
  await scene.screenshot({ path: join(OUTPUT, 'scene-area.png') });

  // The same view without the workspace area: a browser with an empty workspace. (`?areas=0` leaves out every area,
  // the committed coal yard on the same ground included, so it would measure that yard as well.)
  const bare = await page.context().browser()!.newContext({ viewport: page.viewportSize() ?? { width: 1280, height: 800 }, baseURL: baseUrlOf(page) });
  let withoutArea: Awaited<ReturnType<typeof sceneOnlyPng>>;
  try {
    const bareScene = await bare.newPage();
    const cameraWithout = await openScene(sceneUrl, bareScene);
    await expect(bareScene.getByTestId('view')).toHaveAttribute('data-workspace-features', '0');
    expect(cameraWithout.viewProjection, 'the same view with and without the area').toEqual(camera.viewProjection);
    withoutArea = await sceneOnlyPng(bareScene);
  } finally {
    await bare.close();
  }
  // The same view with no area at all (`?areas=0`): inside the ring the difference is the hatching.
  const cameraNone = await openScene(`${sceneUrl}&areas=0`);
  expect(cameraNone.viewProjection, 'the same view with and without the areas').toEqual(camera.viewProjection);
  const withoutAreas = await sceneOnlyPng(scene);

  const measure = measureArea(withArea, withoutAreas, ring, { shrink: 0.6, margin: 40, threshold: 8, amplitude: 12, minRowPixels: 24 });
  // The workspace area on its own: against a browser whose workspace is empty, so the committed coal yard that the
  // Player also draws on this ground is in both pictures and only the workspace area differs.
  const own = measureArea(withArea, withoutArea, ring, { shrink: 0.6, margin: 40, threshold: 8, amplitude: 12, minRowPixels: 24 });
  writeFileSync(join(OUTPUT, 'scene-area.json'), `${JSON.stringify({ ring, ...measure, workspaceAreaOnly: own }, null, 2)}\n`);
  console.log(
    `areas on the ground: ${measure.insidePixels} px inside, ${(100 * measure.insideChanged).toFixed(1)}% changed, ${measure.swingsPerRow.toFixed(1)} stripe edges per row (${measure.rows} rows); ` +
      `workspace area alone: ${(100 * own.insideChanged).toFixed(1)}% changed inside, ${(100 * own.outsideChanged).toFixed(2)}% of ${own.outsidePixels} px away from it`,
  );
  expect(measure.insidePixels, 'the area is on the canvas and big enough to measure').toBeGreaterThan(2000);
  expect(measure.insideChanged, 'the hatching changes the picture inside the area').toBeGreaterThanOrEqual(0.15);
  expect(measure.swingsPerRow, 'stripes: the greyscale difference swings along a row (measured 2.9: about one stripe period across the inner region of a row)').toBeGreaterThanOrEqual(2.5);
  expect(own.insideChanged, 'the workspace area changes the picture where it lies').toBeGreaterThanOrEqual(0.15);
  expect(own.outsideChanged, 'nothing else changes').toBeLessThanOrEqual(0.002);

  // It can be clicked: the card opens on the area, and Show Evidence works on it.
  await openScene(sceneUrl);
  const centre = centroid(ring);
  const canvasBox = (await scene.getByTestId('unity-canvas').boundingBox())!;
  await scene.mouse.click(canvasBox.x + centre[0], canvasBox.y + centre[1]);
  await expect(scene.getByTestId('evidence-card')).toBeVisible({ timeout: 20_000 });
  await expect(scene.getByTestId('card-heading')).toHaveText(USE);
  await expect(scene.getByTestId('card-confidence')).toContainText('traced from the 1911 plan');
  await expect(scene.getByTestId('card-confidence')).not.toContainText(PLATE);
  await scene.waitForTimeout(1500);
  const beforeEvidence = await sceneOnlyPng(scene);
  await scene.getByTestId('show-evidence').click();
  await scene.waitForTimeout(2500);
  const evidence = measureArea(await sceneOnlyPng(scene), beforeEvidence, ring, { shrink: 0.6, margin: 40, threshold: 8, amplitude: 12, minRowPixels: 24 });
  expect(evidence.insideChanged, 'Show Evidence changes the picture under the area').toBeGreaterThanOrEqual(0.1);
  await scene.getByTestId('show-evidence').click();
  await scene.keyboard.press('Escape');
  await expect(scene.getByTestId('evidence-card')).toHaveCount(0);
  await scene.close();

  // ---- Frame rate: a GPU Chromium, with the area in the scene (the workspace travels as storage state) ----
  const storage = workspaceState;
  const hardware = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  try {
    for (const rate of [1, 4]) {
      const context = await hardware.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, baseURL: baseUrlOf(page), storageState: storage });
      const gpu = await context.newPage();
      try {
        await gpu.goto(sceneUrl);
        await expect(gpu.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 150_000 });
        await expect(gpu.getByTestId('view')).toHaveAttribute('data-eras-loaded', /1911/, { timeout: 150_000 });
        await expect(gpu.getByTestId('view')).toHaveAttribute('data-workspace-features', '1');
        await settleCamera(gpu);
        const cdp = await context.newCDPSession(gpu);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        await gpu.waitForTimeout(1500);
        const stats = await frameTimes(gpu, 4000);
        console.log(`GPU, ${rate}x throttle, area on screen: ${stats.meanFps.toFixed(1)} fps mean, p95 ${stats.p95Ms.toFixed(1)} ms (${stats.frames} frames)`);
        writeFileSync(join(OUTPUT, `scene-area-frame-times-${rate}x.json`), `${JSON.stringify(stats, null, 2)}\n`);
        expect(stats.meanFps, `fps with the area on screen, ${rate}x throttle`).toBeGreaterThanOrEqual(rate === 1 ? 60 : 30);
      } finally {
        await context.close();
      }
    }
  } finally {
    await hardware.close();
  }
});

function baseUrlOf(page: Page): string {
  return new URL(page.url()).origin;
}
