/**
 * Page helpers shared by the Lantern and Show Evidence checks (session 028): open the Explorer with the Player
 * running, read the camera the Player reported, fly the debug camera, take canvas pictures. Copied in shape from
 * art.spec.ts, which keeps its own.
 */
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { PNG } from 'pngjs';

export type Camera = { viewProjection: number[]; canvas: { widthPx: number; heightPx: number } };
type DebugCamera = { target: { easting: number; northing: number } } | null;

export async function openScene(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 150_000 });
  await expect(page.getByTestId('debug-state')).toContainText('"running":true', { timeout: 120_000 });
}

async function debugCamera(page: Page): Promise<DebugCamera> {
  const state = JSON.parse((await page.getByTestId('debug-state').textContent()) as string) as { camera: DebugCamera };
  return state.camera;
}

export async function currentCamera(page: Page): Promise<Camera> {
  return JSON.parse((await page.getByTestId('view').getAttribute('data-camera')) as string) as Camera;
}

/** Waits until the camera has stopped: the same view-projection twice, a second apart. */
export async function settleCamera(page: Page): Promise<Camera> {
  let previous = '';
  await expect
    .poll(
      async () => {
        const now = (await page.getByTestId('view').getAttribute('data-camera')) ?? '';
        const same = now !== '' && now === previous;
        previous = now;
        return same;
      },
      { timeout: 30_000, intervals: [1000] },
    )
    .toBe(true);
  return currentCamera(page);
}

export async function flyDebugCamera(
  page: Page,
  pose: { target: [number, number]; distanceM: number; pitchDeg: number; headingDeg: number },
): Promise<Camera> {
  await page.getByTestId('debug-camera-input').fill(JSON.stringify(pose));
  await page.getByTestId('debug-camera-send').evaluate((button) => (button as HTMLButtonElement).click());
  await expect
    .poll(async () => {
      const camera = await debugCamera(page);
      return camera ? Math.hypot(camera.target.easting - pose.target[0], camera.target.northing - pose.target[1]) : 1e9;
    })
    .toBeLessThan(1);
  await page.waitForTimeout(3000); // the era rises over 900 ms and the drape fades in
  return currentCamera(page);
}

/** A whole-page picture as e2e/output/<name>.png and a copy named <name>-<time>.png (older copies removed). */
export async function shoot(page: Page, output: string, name: string): Promise<void> {
  await page.screenshot({ path: join(output, `${name}.png`) });
  for (const file of readdirSync(output)) {
    if (file.startsWith(`${name}-`) && /-\d{6}\.png$/.test(file)) rmSync(join(output, file));
  }
  const now = new Date();
  const stamp = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');
  await page.screenshot({ path: join(output, `${name}-${stamp}.png`) });
}

export async function canvasPng(page: Page): Promise<PNG> {
  return PNG.sync.read(await page.getByTestId('unity-canvas').screenshot());
}

export async function freshPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

/** Frame times from requestAnimationFrame over `ms`, the first five frames dropped. */
export async function frameTimes(page: Page, ms: number): Promise<{ frames: number; meanFps: number; p50Ms: number; p95Ms: number; worstMs: number }> {
  const deltas = await page.evaluate(
    (duration) =>
      new Promise<number[]>((done) => {
        const out: number[] = [];
        let last = performance.now();
        const end = last + duration;
        const tick = (t: number): void => {
          out.push(t - last);
          last = t;
          if (t < end) requestAnimationFrame(tick);
          else done(out);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
  const frames = deltas.slice(5).sort((a, b) => a - b);
  const mean = frames.reduce((s, v) => s + v, 0) / frames.length;
  return {
    frames: frames.length,
    meanFps: 1000 / mean,
    p50Ms: frames[Math.floor(frames.length * 0.5)] as number,
    p95Ms: frames[Math.floor(frames.length * 0.95)] as number,
    worstMs: frames[frames.length - 1] as number,
  };
}
