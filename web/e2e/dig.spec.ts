/**
 * Dig (spec 03 task 3.7, requirements 10 and 16.5; session 018). Against `vite preview` with the real
 * Unity build in web/public/unity/, at 1280 x 800, with ?debug=1 so the test can read the depth the
 * Shell holds from the debug element.
 *
 *  - The gauge keys, a click, the plain wheel and a drag all change the depth; each lands on an era
 *    and the era is announced when it is reached (not before).
 *  - A transition takes 600 to 900 ms, passes through fractions, and the gauge marker follows it.
 *  - The camera does not move across depth changes; Ctrl + wheel zooms and leaves the depth alone.
 *  - 1947 has no imagery yet and says so in one plain line.
 *  - Five frames across one Today to 1911 dig are saved as web/e2e/output/dig-1.png .. dig-5.png: the
 *    gauge is dragged to depths 0, 0.75, 1.5, 2.25 and 3 and held there, so each frame is a fixed point
 *    of the transition. This stands in for a screen recording.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(HERE, 'output');

const ERA_LABELS = ['Today', '1947', '1935', '1911 (revised to 1914)'];
const ERA_IDS = ['today', '1947', '1935', '1911'];

type DebugState = { depth: number; ready: boolean; running: boolean; eraLoaded: string[]; cameraSeq: number };
type Camera = { viewProjection: number[]; canvas: { widthPx: number; heightPx: number } };

let page: Page;

async function debugState(): Promise<DebugState> {
  return JSON.parse((await page.getByTestId('debug-state').textContent()) ?? '{}') as DebugState;
}

async function currentCamera(): Promise<Camera> {
  const text = await page.getByTestId('view').getAttribute('data-camera');
  if (!text) throw new Error('the Player has not reported its camera');
  return JSON.parse(text) as Camera;
}

async function announced(text: string): Promise<void> {
  await expect
    .poll(async () => ((await page.getByTestId('era-announcement').textContent()) ?? '').trim(), { timeout: 8_000, intervals: [50, 100, 200] })
    .toBe(text);
}

async function atEra(index: number): Promise<void> {
  await announced(`Now showing ${ERA_LABELS[index]}`);
  await expect(page.getByTestId('depth-gauge')).toHaveAttribute('aria-valuenow', String(index));
  await expect.poll(async () => (await debugState()).depth).toBe(index);
}

async function settleFrames(): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await page.waitForTimeout(400);
}

async function canvas(): Promise<PNG> {
  return PNG.sync.read(await page.getByTestId('unity-canvas').screenshot());
}

/** Mean absolute difference per channel (0 to 255) between two canvases of the same size. */
function meanDifference(a: PNG, b: PNG): number {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    sum += Math.abs((a.data[i] as number) - (b.data[i] as number));
    sum += Math.abs((a.data[i + 1] as number) - (b.data[i + 1] as number));
    sum += Math.abs((a.data[i + 2] as number) - (b.data[i + 2] as number));
  }
  return sum / ((a.data.length / 4) * 3);
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUTPUT, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  await page.goto('/?debug=1&markers=0');
  await expect
    .poll(
      async () => {
        const s = await debugState();
        return s.ready && s.running && ERA_IDS.every((id) => s.eraLoaded.includes(id));
      },
      { message: 'waiting for the Player with every era loaded', timeout: 150_000, intervals: [500, 1000] },
    )
    .toBe(true);
  await expect(page.getByTestId('view')).toHaveAttribute('data-camera', /viewProjection/);
  await page.evaluate(() => document.fonts.ready);
  await settleFrames();
});

test.afterAll(async () => {
  await page.context().close();
});

test('a key press is a transition of 600 to 900 ms through fractions, and the gauge marker follows it', async () => {
  const gauge = page.getByTestId('depth-gauge');
  await gauge.focus();
  await atEra(0);

  const sampling = page.evaluate(
    () =>
      new Promise<{ samples: Array<{ t: number; depth: number; thumbY: number }>; restY: number }>((resolve) => {
        const read = (): { depth: number; thumbY: number } => {
          const depth = (JSON.parse(document.querySelector('[data-testid="debug-state"]')?.textContent ?? '{}') as { depth: number }).depth;
          const transform = (document.querySelector('[data-testid="depth-thumb"]') as HTMLElement).style.transform;
          const match = /translateY\((-?[\d.]+)px\)/.exec(transform);
          return { depth, thumbY: match ? Number(match[1]) : Number.NaN };
        };
        const start = read();
        const samples: Array<{ t: number; depth: number; thumbY: number }> = [];
        let t0 = -1;
        const tick = (now: number): void => {
          const r = read();
          if (r.depth !== start.depth) {
            if (t0 < 0) t0 = now;
            samples.push({ t: now - t0, ...r });
          }
          const done = r.depth !== start.depth && Number.isInteger(r.depth);
          if (done || (t0 >= 0 ? now - t0 : 0) > 4000 || now > 60_000_000) resolve({ samples, restY: start.thumbY });
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  await page.keyboard.press('ArrowDown');
  const { samples, restY } = await sampling;

  expect(samples.length).toBeGreaterThan(2);
  const last = samples[samples.length - 1] as { t: number; depth: number; thumbY: number };
  expect(last.depth, 'ends exactly on the next era').toBe(1);
  expect(last.t, 'the transition lasts about 750 ms').toBeGreaterThan(550);
  expect(last.t).toBeLessThan(1300);
  const depths = samples.map((s) => s.depth);
  expect(depths.some((d) => d > 0 && d < 1), 'passes through fractions').toBe(true);
  for (let i = 1; i < depths.length; i++) expect(depths[i] as number).toBeGreaterThanOrEqual(depths[i - 1] as number);
  const between = samples.filter((s) => s.depth > 0.05 && s.depth < 0.95);
  expect(between.length).toBeGreaterThan(0);
  for (const s of between) {
    expect(s.thumbY, 'the marker is between the two stops while the depth is').toBeGreaterThan(restY);
    expect(s.thumbY).toBeLessThan(last.thumbY);
  }
  await atEra(1);
  await expect(page.getByTestId('era-note')).toHaveText('No 1947 imagery loaded yet');
});

test('Down and Up on the gauge, Home and End, and a click reach every era and announce it', async () => {
  const gauge = page.getByTestId('depth-gauge');
  await gauge.focus();
  const before = await currentCamera();

  await page.keyboard.press('ArrowDown');
  await atEra(2);
  await expect(page.getByTestId('era-note')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await atEra(3);
  await page.keyboard.press('Home');
  await atEra(0);
  await page.keyboard.press('End');
  await atEra(3);
  await page.getByTestId('era-1947').click();
  await atEra(1);
  await page.keyboard.press('ArrowUp');
  await atEra(0);

  expect((await currentCamera()).viewProjection, 'the camera did not move across depth changes (requirement 10.9)').toEqual(before.viewProjection);
});

test('the plain wheel over the 3D view digs and does not zoom; Ctrl + wheel zooms and does not dig', async () => {
  const before = await currentCamera();
  const seq = (await debugState()).cameraSeq;
  await page.mouse.move(560, 400);

  await page.mouse.wheel(0, 100);
  await atEra(1);
  await page.mouse.wheel(0, 100);
  await atEra(2);
  await page.mouse.wheel(0, -100);
  await atEra(1);
  await page.mouse.wheel(0, -100);
  await atEra(0);
  await page.mouse.wheel(0, -100); // at the top: stays on Today
  await settleFrames();
  await atEra(0);
  expect((await currentCamera()).viewProjection, 'the plain wheel did not zoom').toEqual(before.viewProjection);
  // Report cameras came only from landing on eras, not from movement.
  expect((await debugState()).cameraSeq).toBeGreaterThanOrEqual(seq);

  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await expect
    .poll(async () => JSON.stringify((await currentCamera()).viewProjection) !== JSON.stringify(before.viewProjection), { timeout: 10_000 })
    .toBe(true);
  await page.keyboard.up('Control');
  await atEra(0);
  await expect(page.getByTestId('depth-gauge')).toHaveAttribute('aria-valuenow', '0');
});

test('the + and - keys zoom once the 3D view has been pressed, and leave the depth alone', async () => {
  await page.mouse.click(640, 120); // press the view: it takes focus, as in use
  await settleFrames();
  const before = JSON.stringify((await currentCamera()).viewProjection);
  await page.keyboard.down('Equal');
  await page.waitForTimeout(800);
  await page.keyboard.up('Equal');
  await expect.poll(async () => JSON.stringify((await currentCamera()).viewProjection) !== before, { timeout: 10_000 }).toBe(true);
  const zoomedIn = JSON.stringify((await currentCamera()).viewProjection);
  await page.keyboard.down('Minus');
  await page.waitForTimeout(800);
  await page.keyboard.up('Minus');
  await expect.poll(async () => JSON.stringify((await currentCamera()).viewProjection) !== zoomedIn, { timeout: 10_000 }).toBe(true);
  await atEra(0);
});

test('dragging the gauge makes the depth follow the pointer, and a release lands on the nearest era', async () => {
  const top = await page.getByTestId('era-today').boundingBox();
  const bottom = await page.getByTestId('era-1911').boundingBox();
  if (!top || !bottom) throw new Error('the gauge stops are not on screen');
  const x = top.x + 12;
  const y0 = top.y + top.height / 2;
  const y3 = bottom.y + bottom.height / 2;

  await page.mouse.move(x, y0);
  await page.mouse.down();
  await page.mouse.move(x, y0 + ((y3 - y0) * 1.4) / 3, { steps: 8 });
  await expect.poll(async () => (await debugState()).depth, { timeout: 5_000 }).toBeCloseTo(1.4, 1);
  await expect(page.getByTestId('depth-gauge')).toHaveAttribute('aria-valuenow', '1');
  await page.mouse.up();
  await atEra(1);
  // Back to Today for the next test.
  await page.getByTestId('depth-gauge').focus();
  await page.keyboard.press('Home');
  await atEra(0);
});

test('five frames across one Today to 1911 dig are saved as dig-1.png to dig-5.png', async () => {
  const top = await page.getByTestId('era-today').boundingBox();
  const bottom = await page.getByTestId('era-1911').boundingBox();
  if (!top || !bottom) throw new Error('the gauge stops are not on screen');
  const x = top.x + 12;
  const y0 = top.y + top.height / 2;
  const y3 = bottom.y + bottom.height / 2;
  const depths = [0, 0.75, 1.5, 2.25, 3];

  await page.mouse.move(x, y0);
  await page.mouse.down();
  const frames: PNG[] = [];
  for (let i = 0; i < depths.length; i++) {
    const d = depths[i] as number;
    await page.mouse.move(x, y0 + ((y3 - y0) * d) / 3, { steps: i === 0 ? 1 : 6 });
    if (d > 0) await expect.poll(async () => (await debugState()).depth, { timeout: 5_000 }).toBeCloseTo(d, 1);
    await settleFrames();
    writeFileSync(join(OUTPUT, `dig-${i + 1}.png`), await page.screenshot());
    frames.push(await canvas());
  }
  await page.mouse.up();
  await atEra(3);

  // The dig is visible: every frame differs from the one before it.
  for (let i = 1; i < frames.length; i++) {
    expect(meanDifference(frames[i - 1] as PNG, frames[i] as PNG), `frame ${i} to ${i + 1} changed`).toBeGreaterThan(0.2);
  }
  await page.getByTestId('depth-gauge').focus();
  await page.keyboard.press('Home');
  await atEra(0);
});
