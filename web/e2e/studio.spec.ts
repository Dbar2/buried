/**
 * The Studio's first working slice, end to end (brief 019): pick a registered plate, extract, review
 * with the keys, state the reviewed area, publish as a test reviewer, and see the workspace
 * buildings rise in the Explorer. Plate fip_v3_1911_229 only; the held-out plate is never used here.
 *
 * Run with `npm run test:e2e:studio` (playwright.studio.config.ts starts the Service and the preview).
 * Screenshots go to web/e2e/output/studio-*.png.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const PLATE = 'fip_v3_1911_229';
const OUTPUT = new URL('./output/', import.meta.url).pathname;

type Crop = { id: string; x: number; y: number; width: number; height: number };

async function readCrops(page: Page): Promise<Crop[]> {
  return page.locator('.proposal-list button').evaluateAll((buttons) =>
    buttons.map((b) => {
      const [x, y, width, height] = (b.getAttribute('data-crop') ?? '0,0,0,0').split(',').map(Number) as [number, number, number, number];
      return { id: b.getAttribute('data-proposal-id') ?? '', x, y, width, height };
    }),
  );
}

const centre = (c: Crop) => ({ x: c.x + c.width / 2, y: c.y + c.height / 2 });
const intersects = (c: Crop, r: { x0: number; y0: number; x1: number; y1: number }) =>
  c.x < r.x1 && c.x + c.width > r.x0 && c.y < r.y1 && c.y + c.height > r.y0;

/**
 * Seven neighbouring proposals whose joint bounding box (grown by `margin` plate pixels) touches no
 * other proposal, so that a reviewed area drawn around them holds only decided buildings.
 */
function pickGroup(crops: Crop[], margin: number): { group: Crop[]; box: { x0: number; y0: number; x1: number; y1: number } } {
  for (const seed of crops) {
    const s = centre(seed);
    const group = [...crops]
      .sort((a, b) => Math.hypot(centre(a).x - s.x, centre(a).y - s.y) - Math.hypot(centre(b).x - s.x, centre(b).y - s.y))
      .slice(0, 7);
    const box = {
      x0: Math.min(...group.map((c) => c.x)),
      y0: Math.min(...group.map((c) => c.y)),
      x1: Math.max(...group.map((c) => c.x + c.width)),
      y1: Math.max(...group.map((c) => c.y + c.height)),
    };
    const grown = { x0: box.x0 - margin, y0: box.y0 - margin, x1: box.x1 + margin, y1: box.y1 + margin };
    const ids = new Set(group.map((c) => c.id));
    if (!crops.some((c) => !ids.has(c.id) && intersects(c, grown))) return { group, box };
  }
  throw new Error('No group of seven proposals stands apart from the others');
}

test('extract, review, publish to the workspace, see it in the Explorer', async ({ page }) => {
  test.setTimeout(420_000);
  await page.goto('/studio');
  const canonBefore = await (await page.request.get('/data/evidence/fip_v3_1911_229.geojson')).text();

  await page.getByTestId(`plate-${PLATE}`).click();
  await expect(page.getByTestId('region-readout')).toContainText('Region');
  await page.getByTestId('extract').click();
  const summary = page.locator('.proposal-list summary');
  await expect(summary).toContainText('All proposals');
  const total = Number(/\((\d+)\)/.exec((await summary.textContent()) ?? '')?.[1]);
  expect(total).toBeGreaterThan(20);
  await expect(page.getByTestId('plate-canvas')).toHaveAttribute('data-drawn', String(total), { timeout: 15_000 });

  // ---- Review: five accepted, two rejected, by the keys ----
  await summary.click();
  const crops = await readCrops(page);
  expect(crops).toHaveLength(total);
  const { group, box } = pickGroup(crops, 25);
  const row = (id: string) => page.locator(`.proposal-list button[data-proposal-id="${id}"]`);
  const decide = async (crop: Crop, key: 'a' | 'r') => {
    await row(crop.id).click();
    await expect(page.getByTestId('current-proposal')).toHaveAttribute('data-proposal-id', crop.id);
    await page.keyboard.press(key);
    await expect(row(crop.id)).toHaveAttribute('data-state', key === 'a' ? 'accept' : 'reject');
  };

  // Lettering typed into a field is kept for the accepted proposal; the keys do nothing while typing.
  await row(group[0]!.id).click();
  await page.getByTestId('field-storeys').fill('2');
  await page.getByTestId('field-use').fill('Stores');
  await page.getByTestId('field-use').press('Enter');
  await expect(row(group[0]!.id)).toHaveAttribute('data-state', 'undecided');

  for (const crop of group.slice(0, 5)) await decide(crop, 'a');
  for (const crop of group.slice(5)) await decide(crop, 'r');
  await expect(page.getByTestId('review-counts')).toContainText('Accepted 5');
  await expect(page.getByTestId('review-counts')).toContainText('Rejected 2');
  await expect(page.getByTestId('review-counts')).toContainText(`Undecided ${total - 7}`);

  // Undo takes the last decision back, and the key restores it by deciding again.
  await page.keyboard.press('u');
  await expect(page.getByTestId('review-counts')).toContainText('Rejected 1');
  await row(group[6]!.id).click();
  await page.keyboard.press('r');
  await expect(page.getByTestId('review-counts')).toContainText('Rejected 2');

  // Look at the group: fit the current proposal, then screenshot the Review.
  await row(group[1]!.id).click();
  await page.keyboard.press('f');
  await expect(page.getByTestId('current-tone')).toContainText('on the scan');
  await expect(page.getByTestId('current-tone')).not.toContainText(/material:|brick|wood|stone/i);
  // Fitting the current proposal zooms the plate in on it.
  await expect.poll(async () => JSON.parse((await page.getByTestId('plate-canvas').getAttribute('data-view')) as string).k).toBeGreaterThan(1);
  await page.locator('.studio-side').evaluate((el) => (el.scrollTop = 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUTPUT}studio-review.png` });

  // ---- Publish ----
  await page.getByTestId('step-publish').click();
  await page.getByTestId('reviewer').fill('Test reviewer');

  // Zoom the plate in over the group with the wheel, then draw the reviewed area around it.
  await page.getByRole('button', { name: 'Fit plate' }).click();
  const canvas = page.getByTestId('plate-canvas');
  const canvasBox = (await canvas.boundingBox())!;
  await expect.poll(async () => (await canvas.getAttribute('data-view')) ?? '').not.toBe('');
  const view0 = JSON.parse((await canvas.getAttribute('data-view')) as string) as { k: number; tx: number; ty: number };
  const mid = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  await page.mouse.move(canvasBox.x + mid.x * view0.k + view0.tx, canvasBox.y + mid.y * view0.k + view0.ty);
  await page.mouse.wheel(0, -700);
  await page.mouse.wheel(0, -700);
  await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-view')) as string).k).toBeGreaterThan(view0.k * 3);
  const view = JSON.parse((await canvas.getAttribute('data-view')) as string) as { k: number; tx: number; ty: number };
  const toPage = (x: number, y: number) => ({ x: canvasBox.x + x * view.k + view.tx, y: canvasBox.y + y * view.k + view.ty });
  const from = toPage(box.x0 - 3 / view.k, box.y0 - 3 / view.k);
  const to = toPage(box.x1 + 3 / view.k, box.y1 + 3 / view.k);

  // With undecided buildings in the area, publishing is blocked and they are listed.
  await page.getByTestId('area-region').click();
  await page.getByTestId('area-statement').check();
  await expect(page.getByTestId('blockers')).toContainText('undecided');
  await expect(page.getByTestId('publish')).toBeDisabled();
  await page.getByRole('button', { name: 'Clear' }).click();

  await page.getByTestId('area-draw').click();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('area-readout')).toContainText('Area');
  await expect(page.getByTestId('blockers')).toHaveCount(0);
  await page.getByTestId('area-statement').check();

  const ok = page.getByTestId('dry-run-ok');
  await expect(ok).toContainText('would be added', { timeout: 30_000 });
  const added = Number(/(\d+) building/.exec((await ok.textContent()) ?? '')?.[1]);
  expect(added).toBeGreaterThan(0);

  await page.getByTestId('publish').click();
  const published = page.getByTestId('published');
  await expect(published).toContainText("Published to your workspace on this device. It is not part of Buried's reviewed record.");

  // Canon is untouched: the committed evidence file is served exactly as it was.
  expect(await (await page.request.get('/data/evidence/fip_v3_1911_229.geojson')).text()).toBe(canonBefore);

  // ---- See it ----
  await page.getByTestId('open-explorer').click();
  const view$ = page.getByTestId('view');
  await expect(view$).toHaveAttribute('data-player-ready', 'true', { timeout: 120_000 });
  await expect(view$).toHaveAttribute('data-workspace-features', String(added));
  await expect(view$).toHaveAttribute('data-workspace-rose', String(added), { timeout: 60_000 });
  await page.waitForTimeout(2500); // the rise takes 900 ms once the era is shown
  await page.screenshot({ path: `${OUTPUT}studio-explorer-rise.png` });

  // A close look at the new ghosts: the workspace file's first building is the camera target.
  const target = await page.evaluate(
    () =>
      new Promise<[number, number]>((resolve, reject) => {
        const open = indexedDB.open('buried-workspace');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const get = open.result.transaction('files').objectStore('files').get('evidence/fip_v3_1911_229.geojson');
          get.onsuccess = () => {
            const file = JSON.parse(get.result.text) as { features: Array<{ geometry: { coordinates: number[][][] } }> };
            resolve(file.features[0]!.geometry.coordinates[0]![0] as [number, number]);
          };
          get.onerror = () => reject(get.error);
        };
      }),
  );
  await page.goto('/?era=1911&debug=1&markers=0');
  await expect(page.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 120_000 });
  await expect(page.getByTestId('view')).toHaveAttribute('data-workspace-features', String(added));
  await expect(page.getByTestId('debug-state')).toContainText('"running":true', { timeout: 120_000 });
  await page.getByTestId('debug-camera-input').fill(JSON.stringify({ target, distanceM: 120, pitchDeg: 55, headingDeg: 20 }));
  // The form is visually hidden (clipped), so a pointer click would not reach the button.
  await page.getByTestId('debug-camera-send').evaluate((button) => (button as HTMLButtonElement).click());
  await expect
    .poll(async () => {
      const state = JSON.parse((await page.getByTestId('debug-state').textContent()) as string) as {
        camera: { eye: { heightM: number } } | null;
      };
      return state.camera ? state.camera.eye.heightM > 60 && state.camera.eye.heightM < 120 : false;
    })
    .toBe(true); // the default pose is far higher; the pose sent puts the eye about 98 m up
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUTPUT}studio-explorer.png` });
});

test('the Studio says so in one sentence when the Service is unreachable', async ({ page }) => {
  await page.route('**/v1/**', (route) => route.abort());
  await page.goto('/studio');
  await expect(page.getByTestId('service-unavailable')).toContainText('The Studio service is not reachable');
  await expect(page.getByRole('button', { name: /extract/i })).toHaveCount(0);
});
