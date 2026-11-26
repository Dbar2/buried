/**
 * Photographs and imagined views on the Result (session 055). 2A Percy St opens with the 1911 plan against today's
 * aerial photograph; the Then side can be the 1931-35 plan, the 1939 photograph or an imagined view, the Now side the
 * photograph or the outlines. Screenshots: e2e/output/photos-*.png. Run after `npm run build`:
 * `npx playwright test -c playwright.lotcheck.config.ts photos`. No sleeps: each step waits for a data attribute.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const OUT = 'e2e/output';
mkdirSync(OUT, { recursive: true });

const PERCY_LOT = '5451729';
/** 481 Queen St E and 68 Sumach St: industrial use is lettered next to it, not on it. */
const NEXT_DOOR_LOT = '10645253';
/** 153 Old Foundry Rd: the plans do not cover it. */
const NOT_COVERED_LOT = '10627008';

test.use({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });

const then = (page: Page) => page.getByRole('radiogroup', { name: 'Then' });
const now = (page: Page) => page.getByRole('radiogroup', { name: 'Now' });
const frame = (page: Page) => page.getByTestId('lc-frame');
const caption = (page: Page) => page.getByTestId('lc-caption');

/** Everything the record says: the tag, the inscription, the sentences, the rows. It must not change with the layers. */
async function record(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [
      '[data-testid="lc-tag"]',
      '[data-testid="lc-ins-lead"]',
      '[data-testid="lc-ins-name"]',
      '[data-testid="lc-ins-foot"]',
      '[data-testid="lc-sentence"]',
      '[data-testid="lc-row"]',
      '[data-testid="lc-provenance"]',
    ].flatMap((s) => [...document.querySelectorAll(s)].map((e) => (e.textContent ?? '').trim())),
  );
}

async function open(page: Page, lot = PERCY_LOT) {
  await page.goto(`/lot/${lot}`);
  await expect(frame(page)).toHaveAttribute('data-ready', 'true');
}

test('the plan against today\'s photograph is what a visitor sees first', async ({ page }) => {
  await open(page);
  await expect(frame(page)).toHaveAttribute('data-then', 'fip_v3_1911_229');
  await expect(frame(page)).toHaveAttribute('data-now', 'photo');
  await expect(then(page).getByRole('radio', { name: '1911 plan' })).toBeChecked();
  await expect(now(page).getByRole('radio', { name: 'Today, photo' })).toBeChecked();
  await expect(caption(page)).toHaveText('Left: the 1911 plan, as digitized. Right: 2025 aerial photograph, City of Toronto.');
  await expect(page.getByTestId('lc-now-image')).toHaveAttribute('href', '/lotcheck/aerial/today-2025.jpg');
  // The lot is outlined on both sides, over the picture.
  await expect(page.getByTestId('lc-outline-plan')).toBeVisible();
  await expect(page.getByTestId('lc-outline-today')).toBeVisible();
  // Nothing imagined is the default.
  await expect(page.getByTestId('lc-then-image')).toHaveCount(0);
});

test('every layer pair: the picture and the caption change, the record does not', async ({ page }) => {
  await open(page);
  const before = await record(page);
  expect(before.length).toBeGreaterThan(5);
  const thens = [
    { label: '1911 plan', key: 'fip_v3_1911_229', caption: /^Left: the 1911 plan, as digitized\./, slug: 'plan-1911' },
    { label: '1931-35 plan', key: 'fip_v3_1935_229', caption: /^Left: the 1931-35 plan, as digitized\./, slug: 'plan-1935' },
    { label: '1939 photo', key: 'photo:aerial-1939', caption: /^Left: 1939 aerial photograph, City of Toronto, placed approximately\./, slug: 'photo-1939' },
    { label: 'Imagined, about 1911', key: 'imagined:coal-yard', caption: /^Left: Imagined from the 1911 plan\. Not a photograph\./, slug: 'imagined-1911' },
  ];
  const nows = [
    { label: 'Today, photo', attr: 'photo', caption: /Right: 2025 aerial photograph, City of Toronto\.$/, slug: 'photo' },
    { label: 'Today, outlines', attr: 'outlines', caption: /Right: today's building outlines and lot lines, City of Toronto\.$/, slug: 'outlines' },
  ];
  const seenImages = new Set<string>();
  for (const n of nows) {
    await now(page).getByRole('radio', { name: n.label }).check();
    await expect(frame(page)).toHaveAttribute('data-now', n.attr);
    for (const t of thens) {
      await then(page).getByRole('radio', { name: t.label }).check();
      await expect(frame(page)).toHaveAttribute('data-then', t.key);
      await expect(frame(page)).toHaveAttribute('data-then-ready', 'true');
      await expect(caption(page)).toHaveText(t.caption);
      await expect(caption(page)).toHaveText(n.caption);
      if (t.key.startsWith('imagined') || t.key.startsWith('photo')) {
        const href = (await page.getByTestId('lc-then-image').getAttribute('href')) ?? '';
        seenImages.add(href);
      }
      expect(await record(page), `${t.label} with ${n.label}`).toEqual(before);
      await page.getByTestId('lc-compare').screenshot({ path: `${OUT}/photos-${t.slug}-${n.slug}-desktop.png` });
    }
  }
  expect([...seenImages].sort()).toEqual(['/lotcheck/aerial/aerial-1939.jpg', '/lotcheck/imagined/coal-yard-topdown.jpg']);
  // The 1939 photograph carries the City's caveat on the frame, beside the lot outline.
  await then(page).getByRole('radio', { name: '1939 photo' }).check();
  await expect(page.getByTestId('lc-approximate')).toHaveText('The 1939 photograph is placed approximately.');
  // The polite live region announces each change.
  await then(page).getByRole('radio', { name: 'Imagined, about 1911' }).check();
  await expect(page.getByTestId('lc-announce')).toHaveText('Now showing a view imagined from the 1911 plan. Not a photograph.');
  await expect(page.getByTestId('lc-divider')).toHaveAttribute('aria-label', 'Divider between the imagined view and today');
  await now(page).getByRole('radio', { name: 'Today, photo' }).check();
  await expect(frame(page)).toHaveAttribute('data-now', 'photo');
  await expect(page.getByTestId('lc-announce')).toHaveText('Now showing the 2025 aerial photograph on the right');
  await now(page).getByRole('radio', { name: 'Today, outlines' }).check();
  await expect(page.getByTestId('lc-announce')).toHaveText("Now showing today's outlines on the right");
});

test('an imagined view is shown whole: its four corners are inside the frame, and its mark is not covered', async ({ page }) => {
  await open(page);
  await then(page).getByRole('radio', { name: 'Imagined, about 1911' }).check();
  await expect(frame(page)).toHaveAttribute('data-then-ready', 'true');
  const image = page.getByTestId('lc-then-image');
  const box = await image.boundingBox();
  const f = await frame(page).boundingBox();
  expect(box).not.toBeNull();
  expect(f).not.toBeNull();
  const b = box as { x: number; y: number; width: number; height: number };
  const fb = f as { x: number; y: number; width: number; height: number };
  // The picture is turned with the plan tile, so its bounding box is the largest it can be: it is still inside the frame.
  expect(b.x).toBeGreaterThanOrEqual(fb.x - 1);
  expect(b.y).toBeGreaterThanOrEqual(fb.y - 1);
  expect(b.x + b.width).toBeLessThanOrEqual(fb.x + fb.width + 1);
  expect(b.y + b.height).toBeLessThanOrEqual(fb.y + fb.height + 1);
  // Under the divider's default 50 per cent the picture's south-west corner (where "IMAGINED" is set) is left of the divider and is not under a chip.
  const chip = (await page.getByTestId('lc-chip-left').boundingBox()) as { x: number; y: number; width: number; height: number };
  expect(chip.y + chip.height).toBeLessThan(fb.y + fb.height / 2);
});

test('photographs are not asked for before the plan tile, and the Landing never asks for them', async ({ page }) => {
  const seen: Array<{ url: string; t: number }> = [];
  const t0 = Date.now();
  page.on('request', (r) => seen.push({ url: r.url(), t: Date.now() - t0 }));
  await page.goto('/');
  await expect(page.getByTestId('lc-fact')).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(seen.filter((r) => /\/lotcheck\/(aerial|imagined)\//.test(r.url)), 'the Landing asks for no picture, no index').toEqual([]);
  seen.length = 0;
  await open(page);
  await expect(frame(page)).toHaveAttribute('data-now', 'photo');
  const firstTile = seen.find((r) => /\/data\/tiles\/[^/]+\.jpg$/.test(r.url));
  const firstPhoto = seen.find((r) => /\/lotcheck\/(aerial|imagined)\/[^/]+\.jpg$/.test(r.url));
  expect(firstTile).toBeDefined();
  expect(firstPhoto).toBeDefined();
  expect((firstPhoto as { t: number }).t).toBeGreaterThanOrEqual((firstTile as { t: number }).t);
  // Only the picture the visitor can see is asked for: not the 1939 photograph, not an imagined view.
  expect(seen.filter((r) => /aerial-1939|imagined\/.*\.jpg/.test(r.url))).toEqual([]);
});

test('a lot with industrial use only next to it has no imagined view, and a lot the plans do not cover has no imagined view', async ({ page }) => {
  await open(page, NEXT_DOOR_LOT);
  await expect(page.getByTestId('lc-tag')).toHaveText('Industrial use recorded next to this lot');
  await expect(then(page).getByRole('radio', { name: /Imagined/ })).toHaveCount(0);
  await expect(then(page).getByRole('radio', { name: '1939 photo' })).toBeVisible();
  await expect(page.getByTestId('lc-imagined')).toHaveCount(0);
  await page.goto(`/lot/${NOT_COVERED_LOT}`);
  await expect(page.getByTestId('lc-tag')).toHaveText('Not covered yet');
  await expect(page.getByRole('radio', { name: /Imagined/ })).toHaveCount(0);
  await expect(page.getByTestId('lc-imagined')).toHaveCount(0);
});

test('the layer controls work by keyboard', async ({ page }) => {
  await open(page);
  const first = then(page).getByRole('radio', { name: '1911 plan' });
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(frame(page)).toHaveAttribute('data-then', 'fip_v3_1935_229');
  await expect(page.getByTestId('lc-announce')).toHaveText('Now showing the 1931-35 plan');
  await page.keyboard.press('ArrowDown');
  await expect(frame(page)).toHaveAttribute('data-then', 'photo:aerial-1939');
});

test.describe('the sweep and the fade, with motion', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('after the divider has swept, today\'s side fades from the outlines to the photograph', async ({ page }) => {
    await page.goto(`/lot/${PERCY_LOT}`);
    await expect(frame(page)).toHaveAttribute('data-ready', 'true');
    // Until the sweep is over the Now side shows the outlines.
    await expect(frame(page)).toHaveAttribute('data-now', 'outlines');
    await expect(frame(page)).toHaveAttribute('data-sweep', 'done', { timeout: 8000 });
    await expect(frame(page)).toHaveAttribute('data-now', 'photo');
    const t = await page.evaluate(() => {
      const el = document.querySelector('.lc-now-photo');
      return el ? getComputedStyle(el).transitionDuration : null;
    });
    expect(t).toBe('0.6s');
  });
});

test('phone: the layers wrap, every control is 44 px, nothing scrolls sideways', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 2000 }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await open(page);
  await expect(frame(page)).toHaveAttribute('data-now', 'photo');
  const sizes = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.lc-radio span')].map((e) => e.getBoundingClientRect().height));
  expect(sizes.length).toBe(6);
  for (const h of sizes) expect(h).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  await page.screenshot({ path: `${OUT}/photos-phone-result.png` });
  await then(page).getByRole('radio', { name: 'Imagined, about 1911' }).check();
  await expect(frame(page)).toHaveAttribute('data-then-ready', 'true');
  await page.getByTestId('lc-compare').screenshot({ path: `${OUT}/photos-phone-imagined.png` });
  writeFileSync(`${OUT}/photos-phone-sizes.json`, `${JSON.stringify(sizes)}\n`);
  await context.close();
});
