/**
 * The drape placement check (spec 03 task 17.4, requirement 25.5, design.md "Drape placement check").
 *
 * The gate test measures debug markers drawn at fixed world positions; it never looks at the drape.
 * This test looks at the drape's own pixels. For each control point of each gate plate it sets the
 * camera straight above the ground position that the tile's corners give that pixel, takes a
 * screenshot of the canvas with the Shell's overlays hidden, builds the patch the tile itself predicts
 * for the canvas from the camera's reported view-projection, and correlates the two (normalised
 * cross-correlation) at every offset within 8 px. It passes when the peak is within 1 px of no offset
 * and at least 0.85.
 *
 * It deliberately uses the corner-mapped position of the pixel and not the control point's City
 * `reference`: the two differ by the alignment error, which spec 02 measures. This isolates the renderer.
 *
 * What it proves and does not prove: docs/gate/README.md. The results of each run go to
 * e2e/output/drape-ncc.json.
 *
 * The camera is set through the debug-only form of the Explorer (?debug=1), which sends
 * `debug/setCamera` over the one bridge. The default camera, 170 m above the point at 80 degrees,
 * gives about 0.25 m per canvas pixel at the Player's field of view.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expectedPatch, project as projectPoint, signedDistance, tileBoxForWindow, tileToWorld } from './support/drapeMath';
import type { Corners, Pt, TileGeometry } from './support/drapeMath';
import { bestOffset, luma, stdDev } from './support/ncc';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(WEB, '..', 'data');
const OUTPUT = join(WEB, 'e2e', 'output');

const FEATHER_M = 15; // DRAPE_FEATHER_M
// Design (session 018): skip a point less than the feather distance inside the boundary. DRAPE_MARGIN_M
// exists only to measure the skipped points for the session notes; the committed default is the design's.
const INSIDE_MARGIN_M = process.env.DRAPE_MARGIN_M !== undefined ? Number(process.env.DRAPE_MARGIN_M) : FEATHER_M;
const WINDOW = 64;
const SEARCH = 8;
const MIN_PEAK = 0.85;
const MAX_OFFSET_PX = 1;
const MIN_STD = 8;
const POSE_DISTANCE_M = 170;
const POSE_PITCH_DEG = 80;

type Sidecar = {
  source: string;
  image: string;
  width_px: number;
  height_px: number;
  corners: { top_left: Pt; top_right: Pt; bottom_right: Pt; bottom_left: Pt };
  crop_px: { x: number; y: number; width: number; height: number };
  map_area: { type: 'Polygon'; coordinates: Pt[][] };
};
type Control = { source: string; points: Array<{ id: string; pixel: [number, number]; reference: Pt }> };
type Camera = { viewProjection: number[]; canvas: { widthPx: number; heightPx: number } };

const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;
const project = readJson<{ origin: { easting: number; northing: number }; eras: Array<{ id: string; year_from: number; year_to: number }> }>('project.json');
const ORIGIN: Pt = [project.origin.easting, project.origin.northing];

/** Era indexes as the gauge shows them: year_to descending, then year_from descending (Today first). */
const eraIndex = (id: string): number => {
  const sorted = [...project.eras].sort((a, b) => b.year_to - a.year_to || b.year_from - a.year_from);
  const index = sorted.findIndex((e) => e.id === id);
  if (index < 0) throw new Error(`no era ${id}`);
  return index;
};

const PLATES = [
  { source: 'fip_v3_1911_229', era: '1911' },
  { source: 'fip_v3_1935_229', era: '1935' },
];

type PointResult = {
  plate: string;
  id: string;
  tilePx: [number, number];
  insideClipM: number;
  expectedStd: number;
  ncc: number;
  offsetPx: [number, number];
  nccAtZero: number;
};
type Skipped = { plate: string; id: string; reason: string };
const results: PointResult[] = [];
const skipped: Skipped[] = [];
const outside: Array<{ plate: string; point: [number, number]; outsideClipM: number; maxChannelDiff: number }> = [];

async function debugState(page: Page): Promise<{ ready: boolean; running: boolean; eraLoaded: string[]; cameraSeq: number }> {
  return JSON.parse((await page.getByTestId('debug-state').textContent()) ?? '{}');
}

async function currentCamera(page: Page): Promise<Camera | null> {
  const text = await page.getByTestId('view').getAttribute('data-camera');
  return text ? (JSON.parse(text) as Camera) : null;
}

async function open(page: Page): Promise<void> {
  await page.goto('/?debug=1&markers=0');
  await expect
    .poll(
      async () => {
        const s = await debugState(page);
        return s.ready && s.running && ['today', '1947', '1935', '1911'].every((id) => s.eraLoaded.includes(id));
      },
      { message: 'waiting for the Player to be ready with every era loaded', timeout: 150_000, intervals: [500, 1000] },
    )
    .toBe(true);
  // Hide the Shell's overlays so the canvas shows only the scene.
  await page.addStyleTag({ content: '.attribution, .view-hint, .view-notes { visibility: hidden !important; } .depth-gauge { opacity: 0 !important; }' });
}

async function showEra(page: Page, era: string): Promise<void> {
  const gauge = page.getByTestId('depth-gauge');
  await gauge.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < eraIndex(era); i++) await page.keyboard.press('ArrowDown');
  await expect(page.getByTestId('era-announcement')).not.toHaveText('Now showing Today', { timeout: 10_000 }).catch(() => {});
}

/** Sends the camera over the bridge through the debug form and waits until the target is at the canvas centre. */
async function aim(page: Page, e: number, n: number): Promise<Camera> {
  const pose = { target: [e, n], distanceM: POSE_DISTANCE_M, pitchDeg: POSE_PITCH_DEG, headingDeg: 0 };
  await page.getByTestId('debug-camera-input').fill(JSON.stringify(pose));
  // The form is visually hidden (clipped), so a pointer click would not reach the button; click it from the page.
  await page.getByTestId('debug-camera-send').evaluate((button) => (button as HTMLButtonElement).click());
  let camera: Camera | null = null;
  await expect
    .poll(
      async () => {
        camera = await currentCamera(page);
        if (!camera) return false;
        const px = projectPoint(camera.viewProjection, camera.canvas, e - ORIGIN[0], 0, n - ORIGIN[1]);
        return !!px && Math.abs(px[0] - camera.canvas.widthPx / 2) < 0.6 && Math.abs(px[1] - camera.canvas.heightPx / 2) < 0.6;
      },
      { message: 'waiting for the camera to reach the pose', timeout: 30_000, intervals: [100, 250, 500] },
    )
    .toBe(true);
  // Two frames and a moment for the Player to draw them.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await page.waitForTimeout(500);
  return (await currentCamera(page)) as Camera;
}

async function screenshot(page: Page): Promise<PNG> {
  return PNG.sync.read(await page.getByTestId('unity-canvas').screenshot());
}

/** The luminance of a rectangle of the tile image, decoded by the browser, row by row. */
async function tileRegion(page: Page, image: string, box: { x: number; y: number; width: number; height: number }): Promise<number[]> {
  return page.evaluate(
    async ({ url, box }) => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = box.width;
      canvas.height = box.height;
      const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
      context.drawImage(bitmap, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
      const pixels = context.getImageData(0, 0, box.width, box.height).data;
      const out: number[] = [];
      for (let i = 0; i < pixels.length; i += 4) out.push(0.2126 * (pixels[i] as number) + 0.7152 * (pixels[i + 1] as number) + 0.0722 * (pixels[i + 2] as number));
      return out;
    },
    { url: `/data/tiles/${image}`, box },
  );
}

function lumaImage(png: PNG): { width: number; height: number; data: Float64Array } {
  const data = new Float64Array(png.width * png.height);
  for (let i = 0; i < data.length; i++) data[i] = luma(png.data[i * 4] as number, png.data[i * 4 + 1] as number, png.data[i * 4 + 2] as number);
  return { width: png.width, height: png.height, data };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (!existsSync(join(WEB, 'public', 'unity', 'Build'))) throw new Error('Unity build not found; run the Unity build command');
  mkdirSync(OUTPUT, { recursive: true });
});

test.afterAll(() => {
  writeFileSync(join(OUTPUT, 'drape-ncc.json'), `${JSON.stringify({ results, skipped, outside }, null, 2)}\n`);
  for (const r of results) {
    console.log(
      `${r.plate} ${r.id}: ncc ${r.ncc.toFixed(4)} at offset (${r.offsetPx[0]}, ${r.offsetPx[1]}) px, ncc at zero ${r.nccAtZero.toFixed(4)}, patch sd ${r.expectedStd.toFixed(1)}, ${r.insideClipM.toFixed(1)} m inside the clip`,
    );
  }
  for (const s of skipped) console.log(`${s.plate} ${s.id}: skipped, ${s.reason}`);
  for (const o of outside) console.log(`${o.plate} outside the map area at ${o.point.join(', ')} (${o.outsideClipM.toFixed(1)} m outside): largest channel difference ${o.maxChannelDiff}`);
});

for (const plate of PLATES) {
  test(`the ${plate.era} drape of ${plate.source} is drawn where its corners put each control point`, async ({ page }) => {
    const sidecar = readJson<Sidecar>('tiles', `${plate.source}.json`);
    const control = readJson<Control>('control', `${plate.source}.json`);
    const clip = sidecar.map_area.coordinates[0] as Pt[];
    const tile: TileGeometry = { corners: sidecar.corners as Corners, widthPx: sidecar.width_px, heightPx: sidecar.height_px, origin: ORIGIN };

    // Which points can be tested: inside the tile, and well inside the clip (past the fade).
    const testable: Array<{ id: string; tilePx: [number, number]; world: [number, number]; inside: number }> = [];
    for (const point of control.points) {
      const tx = ((point.pixel[0] - sidecar.crop_px.x) * sidecar.width_px) / sidecar.crop_px.width;
      const ty = ((point.pixel[1] - sidecar.crop_px.y) * sidecar.height_px) / sidecar.crop_px.height;
      if (tx < 0 || tx > sidecar.width_px || ty < 0 || ty > sidecar.height_px) {
        skipped.push({ plate: plate.source, id: point.id, reason: 'outside the tile' });
        continue;
      }
      const world = tileToWorld(tile.corners, tile.widthPx, tile.heightPx, tx, ty);
      const inside = signedDistance(clip, world[0], world[1]);
      if (inside < INSIDE_MARGIN_M) {
        skipped.push({ plate: plate.source, id: point.id, reason: `${inside.toFixed(1)} m inside the map area, under ${INSIDE_MARGIN_M} m` });
        continue;
      }
      testable.push({ id: point.id, tilePx: [tx, ty], world, inside });
    }
    expect(testable.length, `${plate.source}: control points far enough inside the map area to test (skipped: ${JSON.stringify(skipped.filter((s) => s.plate === plate.source))})`).toBeGreaterThanOrEqual(3);

    await open(page);
    console.log(`${plate.source}: opened`);
    await showEra(page, plate.era);
    console.log(`${plate.source}: era shown`);

    for (const point of testable) {
      console.log(`${plate.source} ${point.id}: aiming at ${point.world.map((v) => v.toFixed(2)).join(', ')}`);
      const camera = await aim(page, point.world[0], point.world[1]);
      console.log(`${plate.source} ${point.id}: camera reached`);
      const png = await screenshot(page);
      expect([png.width, png.height]).toEqual([camera.canvas.widthPx, camera.canvas.heightPx]);

      const centre = projectPoint(camera.viewProjection, camera.canvas, point.world[0] - ORIGIN[0], 0, point.world[1] - ORIGIN[1]) as [number, number];
      const x0 = Math.floor(centre[0]) - WINDOW / 2;
      const y0 = Math.floor(centre[1]) - WINDOW / 2;
      const box = tileBoxForWindow(camera.viewProjection, camera.canvas, tile, x0, y0, WINDOW);
      const region = await tileRegion(page, sidecar.image, box);
      const patch = expectedPatch(camera.viewProjection, camera.canvas, tile, box, region, x0, y0, WINDOW);

      const sd = stdDev(patch);
      const peak = bestOffset(patch, lumaImage(png), x0, y0, WINDOW, SEARCH);
      results.push({
        plate: plate.source,
        id: point.id,
        tilePx: [Math.round(point.tilePx[0] * 10) / 10, Math.round(point.tilePx[1] * 10) / 10],
        insideClipM: point.inside,
        expectedStd: sd,
        ncc: peak.value,
        offsetPx: [peak.dx, peak.dy],
        nccAtZero: peak.atZero,
      });
      await page.screenshot({ path: join(OUTPUT, `drape-${plate.source}-${point.id}.png`) });

      expect.soft(sd, `${plate.source} ${point.id}: the expected patch is too flat to test (standard deviation ${sd.toFixed(1)} of 255)`).toBeGreaterThanOrEqual(MIN_STD);
      expect.soft(Math.abs(peak.dx), `${plate.source} ${point.id}: peak offset x`).toBeLessThanOrEqual(MAX_OFFSET_PX);
      expect.soft(Math.abs(peak.dy), `${plate.source} ${point.id}: peak offset y`).toBeLessThanOrEqual(MAX_OFFSET_PX);
      expect.soft(peak.value, `${plate.source} ${point.id}: correlation peak`).toBeGreaterThanOrEqual(MIN_PEAK);
    }
  });

  test(`a point inside the ${plate.era} tile but outside its map area renders as ground`, async ({ page }) => {
    const sidecar = readJson<Sidecar>('tiles', `${plate.source}.json`);
    const clip = sidecar.map_area.coordinates[0] as Pt[];
    const corners = sidecar.corners as Corners;

    // The point of the tile farthest outside the clip, on a 60 x 60 grid.
    let best: { world: [number, number]; d: number } | null = null;
    for (let j = 0; j <= 60; j++) {
      for (let i = 0; i <= 60; i++) {
        const world = tileToWorld(corners, 1, 1, i / 60, j / 60);
        const d = signedDistance(clip, world[0], world[1]);
        if (!best || d < best.d) best = { world, d };
      }
    }
    const far = best as { world: [number, number]; d: number };
    // A 64 px window at about 0.25 m per pixel is 16 m across, 11.4 m to its corner; 5 m more is the rule's margin.
    expect(far.d, `${plate.source}: a point of the tile at least 17 m outside the map area`).toBeLessThanOrEqual(-17);

    await open(page);
    await showEra(page, plate.era);
    const camera = await aim(page, far.world[0], far.world[1]);
    const withDrape = await screenshot(page);
    await showEra(page, '1947'); // no drape and no feature; Today's outlines are the same faint outline as in every other era
    await aim(page, far.world[0], far.world[1]);
    const without = await screenshot(page);

    const centre = projectPoint(camera.viewProjection, camera.canvas, far.world[0] - ORIGIN[0], 0, far.world[1] - ORIGIN[1]) as [number, number];
    const x0 = Math.floor(centre[0]) - WINDOW / 2;
    const y0 = Math.floor(centre[1]) - WINDOW / 2;
    let maxDiff = 0;
    for (let y = y0; y < y0 + WINDOW; y++) {
      for (let x = x0; x < x0 + WINDOW; x++) {
        for (let c = 0; c < 3; c++) {
          const i = (withDrape.width * y + x) * 4 + c;
          maxDiff = Math.max(maxDiff, Math.abs((withDrape.data[i] as number) - (without.data[i] as number)));
        }
      }
    }
    outside.push({ plate: plate.source, point: [Math.round(far.world[0] * 10) / 10, Math.round(far.world[1] * 10) / 10], outsideClipM: -far.d, maxChannelDiff: maxDiff });
    expect(maxDiff, `${plate.source}: the drape shows ${(-far.d).toFixed(1)} m outside its map area`).toBeLessThanOrEqual(3);
  });
}
