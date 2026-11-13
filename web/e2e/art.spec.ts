/**
 * Session 023, scene art direction. Extends the look check (look.spec.ts) with the pictures and
 * measures of the art pass. Each test opens its own page, so one can run alone:
 *   npx playwright test e2e/art.spec.ts -g "estimated"
 * after `npm run build` (the build copies web/public/unity/ into dist/).
 *
 * Screenshots go to e2e/output/art-*.png for the maintainer.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(WEB, '..', 'data');
export const OUTPUT = join(WEB, 'e2e', 'output');

export type Camera = { viewProjection: number[]; canvas: { widthPx: number; heightPx: number } };
export type Point = { x: number; y: number };

const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;
const project = readJson<{ origin: { easting: number; northing: number } }>('project.json');

type EvidenceFeature = {
  id: string;
  geometry: { type: string; coordinates: number[][][] };
  properties: { confidence: string; attributes: { storeys?: number } };
};
const evidence1911 = readJson<{ features: EvidenceFeature[] }>('evidence', 'fip_v3_1911_229.geojson');

export function centroidOf(ring: readonly number[][]): [number, number] {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i] as [number, number];
    const [x1, y1] = ring[i + 1] as [number, number];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  return [cx / (3 * area), cy / (3 * area)];
}

/** EPSG:26917 position and height to canvas pixels, from the view-projection the Player reported. */
export function projectToPixels(camera: Camera, e: number, n: number, h: number): Point & { w: number } {
  const x = e - project.origin.easting;
  const z = n - project.origin.northing;
  const m = camera.viewProjection;
  const clip = [0, 1, 2, 3].map((r) => (m[r] as number) * x + (m[4 + r] as number) * h + (m[8 + r] as number) * z + (m[12 + r] as number));
  const w = clip[3] as number;
  return {
    x: ((clip[0] as number) / w * 0.5 + 0.5) * camera.canvas.widthPx,
    y: (1 - ((clip[1] as number) / w * 0.5 + 0.5)) * camera.canvas.heightPx,
    w,
  };
}

export async function openScene(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 150_000 });
  await expect(page.getByTestId('debug-state')).toContainText('"running":true', { timeout: 120_000 });
}

export async function flyDebugCamera(
  page: Page,
  pose: { target: [number, number]; distanceM: number; pitchDeg: number; headingDeg: number },
): Promise<Camera> {
  await page.getByTestId('debug-camera-input').fill(JSON.stringify(pose));
  await page.getByTestId('debug-camera-send').evaluate((button) => (button as HTMLButtonElement).click());
  await expect
    .poll(async () => {
      const state = JSON.parse((await page.getByTestId('debug-state').textContent()) as string) as {
        camera: { target: { easting: number; northing: number } } | null;
      };
      return state.camera ? Math.hypot(state.camera.target.easting - pose.target[0], state.camera.target.northing - pose.target[1]) : 1e9;
    })
    .toBeLessThan(1);
  await page.waitForTimeout(3000); // the era rises over 900 ms and the drape fades in
  return JSON.parse((await page.getByTestId('view').getAttribute('data-camera')) as string) as Camera;
}

export async function canvasPng(page: Page): Promise<PNG> {
  return PNG.sync.read(await page.getByTestId('unity-canvas').screenshot());
}

/**
 * Save a whole-page screenshot as e2e/output/<name>.png, and a copy named <name>-<time>.png (the
 * previous copies of the same picture are removed). The copy has a file name that has not been
 * seen before, so a reviewer who opens pictures one run after another is never shown a cached one.
 */
export async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(OUTPUT, `${name}.png`) });
  for (const file of readdirSync(OUTPUT)) {
    if (file.startsWith(`${name}-`) && /-\d{6}\.png$/.test(file)) rmSync(join(OUTPUT, file));
  }
  const now = new Date();
  const stamp = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');
  await page.screenshot({ path: join(OUTPUT, `${name}-${stamp}.png`) });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  mkdirSync(OUTPUT, { recursive: true });
});

test('art: a close view of mixed estimated and documented ghosts', async ({ browser }) => {
  test.setTimeout(300_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await openScene(page, 'era=1911&debug=1&markers=0');
    // The documented building (the one with recorded storeys) and its neighbours.
    const documented = evidence1911.features.find((f) => f.properties.confidence === 'documented');
    expect(documented, 'a documented building on the 1911 plate').toBeDefined();
    const ring = ((documented as EvidenceFeature).geometry.coordinates as number[][][])[0] as number[][];
    const centre = centroidOf(ring);
    await flyDebugCamera(page, { target: centre, distanceM: 110, pitchDeg: 42, headingDeg: 20 });
    await shoot(page, 'art-estimated-close');
  } finally {
    await context.close();
  }
});
