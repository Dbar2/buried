/**
 * First load of the landing (session 031): the wordmark, field and examples show on a still dusk
 * backdrop, the Player starts after the first paint, and the scene cross-fades in when it reports a
 * first frame (no fade under reduced motion).
 *
 * Run after `npm run build`: `npx playwright test e2e/firstload.spec.ts`. Needs the Unity build in
 * web/public/unity/. It measures, on the built site served by `vite preview`, in a fresh browser
 * context each time (cold cache), with and without 4x CPU throttling:
 *   - field:    the search field is on screen (time from navigation start, in ms)
 *   - examples: the three example addresses are on screen (the address list has loaded)
 *   - scene:    the scene has faded in (the landing-scene layer carries `landing-scene--shown`)
 * and writes them to web/e2e/output/firstload.json. Headless Chromium draws WebGL with SwiftShader
 * in software, so the scene time is slower here than on a machine with a GPU.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Browser } from '@playwright/test';

const OUTPUT = join(fileURLToPath(new URL('..', import.meta.url)), 'e2e', 'output');

type Times = { field: number | null; examples: number | null; scene: number | null; sceneState: string | null };

/** Records `performance.now()` (ms since navigation start) when each landmark first appears. */
const RECORDER = `
  (() => {
    const times = { field: null, examples: null, scene: null };
    window.__firstLoad = times;
    const look = () => {
      const now = performance.now();
      if (times.field === null && document.querySelector('#landing-address')) times.field = now;
      if (times.examples === null && document.querySelector('[data-testid="landing-examples"] a')) times.examples = now;
      if (times.scene === null && document.querySelector('.landing-scene--shown')) times.scene = now;
    };
    new MutationObserver(look).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    look();
  })();
`;

async function measure(browser: Browser, throttle: number): Promise<Times> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  try {
    await page.addInitScript(RECORDER);
    if (throttle > 1) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    }
    await page.goto('/place');
    await expect(page.getByTestId('landing')).not.toHaveAttribute('data-scene', /^(loading|waiting)$/, { timeout: 280_000 });
    const sceneState = await page.getByTestId('landing').getAttribute('data-scene');
    // The fade is a class on the layer; give the recorder its mutation.
    await page.waitForFunction(() => (window as unknown as { __firstLoad: { scene: number | null } }).__firstLoad.scene !== null, undefined, { timeout: 30_000 }).catch(() => {});
    const times = await page.evaluate(() => (window as unknown as { __firstLoad: Omit<Times, 'sceneState'> }).__firstLoad);
    return { ...times, sceneState };
  } finally {
    await context.close();
  }
}

test.beforeAll(() => mkdirSync(OUTPUT, { recursive: true }));

test('the field and the examples are on screen before the scene, with and without 4x CPU throttling', async ({ browser }) => {
  test.setTimeout(600_000);
  const results: Record<string, Times> = {};
  for (const [name, rate] of [['unthrottled', 1], ['cpu_4x', 4]] as const) {
    results[name] = await measure(browser, rate);
  }
  writeFileSync(join(OUTPUT, 'firstload.json'), `${JSON.stringify(results, null, 2)}\n`);
  for (const [name, t] of Object.entries(results)) {
    expect(t.sceneState, `${name}: the scene came in`).toBe('ready');
    expect(t.field, `${name}: field`).not.toBeNull();
    expect(t.examples, `${name}: examples`).not.toBeNull();
    expect(t.scene, `${name}: scene`).not.toBeNull();
    expect(t.field as number, `${name}: the field is on screen before the scene`).toBeLessThan(t.scene as number);
    expect(t.examples as number, `${name}: the examples are on screen before the scene`).toBeLessThan(t.scene as number);
  }
});

test('the landing is usable on the still backdrop: the field takes keys before the scene is in', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/place');
  const field = page.getByTestId('landing-address');
  await expect(field).toBeVisible();
  await field.focus();
  await page.keyboard.type('East');
  await expect(field).toHaveValue('East');
  await expect(page.getByTestId('landing-hits').locator('button').first()).toBeVisible({ timeout: 60_000 });
});

test('the scene is a layer that fades in, and with reduced motion it does not fade', async ({ browser }) => {
  test.setTimeout(120_000);
  const fade = async (reducedMotion: 'reduce' | 'no-preference'): Promise<string> => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion });
    try {
      const page = await context.newPage();
      await page.goto('/place');
      await expect(page.getByTestId('landing-scene')).toBeAttached();
      return await page.getByTestId('landing-scene').evaluate((el) => getComputedStyle(el).transitionDuration);
    } finally {
      await context.close();
    }
  };
  expect(await fade('no-preference')).toBe('0.9s');
  expect(await fade('reduce')).toBe('0s');
});
