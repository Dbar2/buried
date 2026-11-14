/**
 * The walk test (spec 07, session 049), in a Chromium that draws on the GPU (playwright.walk.config.ts), against the real
 * Player. Open /walk?debug=1, step inside, hold W, teleport beside the overall factory's plaque, read the exhibit, go back,
 * save four screenshots and measure the frame time at 1440 by 900. Run from web/ after `npm run build`:
 *   npx playwright test -c playwright.walk.config.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const OUTPUT = fileURLToPath(new URL('./output/', import.meta.url));

type Pose = { east: number; north: number; yaw: number; locked: boolean; near: string };

async function pose(page: Page): Promise<Pose> {
  const out = page.getByTestId('walk-pose');
  return {
    east: Number(await out.getAttribute('data-east')),
    north: Number(await out.getAttribute('data-north')),
    yaw: Number(await out.getAttribute('data-yaw')),
    locked: (await out.getAttribute('data-locked')) === 'true',
    near: (await out.getAttribute('data-near')) ?? '',
  };
}

/** The pointer is locked, so the page's controls are reached with a DOM click, not a mouse click. */
async function teleportTo(page: Page, east: number, north: number, yawDeg: number): Promise<void> {
  await page.getByTestId('walk-teleport-input').fill(`${east}, ${north}, ${yawDeg}`);
  await page.getByTestId('walk-teleport').evaluate((button) => (button as HTMLButtonElement).click());
}

/** Yaw (degrees clockwise from north) that looks from (fromE, fromN) towards (toE, toN). */
const yawTowards = (fromE: number, fromN: number, toE: number, toN: number): number => {
  const yaw = (Math.atan2(toE - fromE, toN - fromN) * 180) / Math.PI;
  return Math.round(((yaw % 360) + 360) % 360 * 10) / 10;
};

test('walk: step inside, walk, read the overall factory, go back', async ({ page }) => {
  mkdirSync(OUTPUT, { recursive: true });
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
    if (message.text().includes('[walk]')) console.log('player:', message.text().slice(0, 300));
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/walk?debug=1');

  // The intro: kicker, title, line, and the one button, which reads "Lighting the lamp" until the Player is ready.
  const intro = page.getByTestId('walk-intro');
  await expect(intro).toContainText('Queen Street East at River Street');
  await expect(intro.getByRole('heading', { name: '1911' })).toBeVisible();
  await expect(intro).toContainText('Rebuilt from a fire-insurance plan. Walk it.');
  const button = page.getByTestId('walk-step-inside');
  await expect(button).toHaveText('Step inside', { timeout: 180_000 });

  await button.click();
  await expect(page.getByTestId('walk')).toHaveAttribute('data-phase', /walking|paused/, { timeout: 180_000 });
  await expect(page.getByTestId('walk-pose')).toHaveAttribute('data-east', /\d/, { timeout: 30_000 });
  const entered = await pose(page);
  console.log('walk: entered', JSON.stringify(entered), 'phase', await page.getByTestId('walk').getAttribute('data-phase'));
  await page.waitForTimeout(1500);
  console.log(
    'walk: canvas',
    JSON.stringify(
      await page.evaluate(() => {
        const c = document.querySelector('canvas') as HTMLCanvasElement;
        const r = c.getBoundingClientRect();
        return { width: c.width, height: c.height, client: [c.clientWidth, c.clientHeight], rect: [r.width, r.height], style: c.style.cssText, inner: [innerWidth, innerHeight], dpr: devicePixelRatio };
      }),
    ),
  );
  await page.screenshot({ path: join(OUTPUT, 'walk-start.png') });
  expect(entered.east).toBeCloseTo(-18.75, 0);
  expect(entered.north).toBeCloseTo(120, 0);

  // Hold W for three seconds: at 2.4 m/s that is about 7 m; the brief asks for more than 4 m.
  await expect(page.getByTestId('walk')).toHaveAttribute('data-phase', 'walking', { timeout: 10_000 });
  const before = await pose(page);
  await page.keyboard.down('w');
  await page.waitForTimeout(3000);
  await page.keyboard.up('w');
  await page.waitForTimeout(600);
  const after = await pose(page);
  const moved = Math.hypot(after.east - before.east, after.north - before.north);
  console.log('walk: held W for 3 s, moved', moved.toFixed(2), 'm');
  expect(moved).toBeGreaterThan(4);

  // The factory wall, the corner, then the plaque.
  const factoryEye = { east: -2, north: 124 };
  await teleportTo(page, factoryEye.east, factoryEye.north, yawTowards(factoryEye.east, factoryEye.north, -6, 112.6));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUTPUT, 'walk-factory.png') });

  const cornerEye = { east: 21, north: 123 };
  await teleportTo(page, cornerEye.east, cornerEye.north, yawTowards(cornerEye.east, cornerEye.north, 13.8, 117.2));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUTPUT, 'walk-corner.png') });

  // Beside the overall factory's plaque (-7.562, 114.5) facing (-0.298, 0.955), looking at it.
  const plaque = { east: -7.562, north: 114.5 };
  const stand = { east: plaque.east - 0.298 * 1.6, north: plaque.north + 0.9545 * 1.6 };
  await teleportTo(page, stand.east, stand.north, yawTowards(stand.east, stand.north, plaque.east, plaque.north));
  await expect(page.getByTestId('walk-pose')).toHaveAttribute('data-near', 'overall-factory', { timeout: 15_000 });
  await expect(page.getByTestId('walk-prompt')).toHaveText('Read the plaque: click or E');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUTPUT, 'walk-plaque.png') });

  await page.keyboard.press('e');
  const panel = page.getByTestId('walk-exhibit');
  await expect(panel).toBeVisible({ timeout: 15_000 });
  await expect(panel).toContainText('Glove & Overall Factory');
  await expect(panel).toContainText('EXHIBIT. LETTERED ON THE 1911 PLAN');
  await expect(panel).toContainText('Imagined: the brick, the windows, the sign paint.');
  await expect(panel).toContainText('From the plan: the outline');

  await page.getByTestId('walk-back').click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('walk')).toHaveAttribute('data-phase', 'walking', { timeout: 8_000 });
  console.log('walk: back on the street, phase', await page.getByTestId('walk').getAttribute('data-phase'));
  expect(problems.filter((p) => !/favicon|GPU stall|WebGL: INVALID/.test(p))).toEqual([]);
});

test('walk: frame time at 1440 by 900', async ({ page }) => {
  mkdirSync(OUTPUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/walk?debug=1');
  await expect(page.getByTestId('walk-step-inside')).toHaveText('Step inside', { timeout: 180_000 });
  await page.getByTestId('walk-step-inside').click();
  await expect(page.getByTestId('walk-pose')).toHaveAttribute('data-east', /\d/, { timeout: 180_000 });
  await page.waitForTimeout(2000);

  // Five seconds of frames while walking forward.
  await page.keyboard.down('w');
  const stats = await page.evaluate(
    () =>
      new Promise<{ frames: number; seconds: number; fps: number; p95Ms: number; worstMs: number }>((resolve) => {
        const times: number[] = [];
        const start = performance.now();
        let last = start;
        const tick = (now: number) => {
          times.push(now - last);
          last = now;
          if (now - start < 5000) requestAnimationFrame(tick);
          else {
            const sorted = [...times].sort((a, b) => a - b);
            const seconds = (now - start) / 1000;
            resolve({
              frames: times.length,
              seconds,
              fps: times.length / seconds,
              p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
              worstMs: sorted[sorted.length - 1] ?? 0,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.keyboard.up('w');
  writeFileSync(join(OUTPUT, 'walk-frame-times.json'), `${JSON.stringify(stats, null, 2)}\n`);
  console.log('walk: frame times at 1440 by 900', JSON.stringify(stats));
  // Under 50 fps is a finding on this first pass, not a failure.
  if (stats.fps < 50) console.log(`walk: FINDING, ${stats.fps.toFixed(1)} fps is under 50`);
  expect(stats.frames).toBeGreaterThan(10);
});
