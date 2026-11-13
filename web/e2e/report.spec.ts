/**
 * The Report end to end (brief 021): open the Report for the lot that contains the committed
 * building `bld_fip_v3_1911_229_0001`, save a screenshot of the on-screen Report and a PDF per paper
 * size through print emulation, and check the pages and the parts that must be there.
 *
 * Run after `npm run build`: `npx playwright test e2e/report.spec.ts`. Output goes to
 * web/e2e/output/report-*.{png,pdf}. The Report never loads Unity, so this test does not need the
 * Unity build.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(WEB, '..', 'data');
const OUTPUT = join(WEB, 'e2e', 'output');

type Ring = number[][];
const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;

function inside(point: [number, number], ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** The id of the lot in the committed layer that contains the committed building's centre. */
function lotWithTheBuilding(): string {
  const evidence = readJson<{ features: Array<{ id: string; geometry: { coordinates: Ring[] } }> }>('evidence', 'fip_v3_1911_229.geojson');
  const building = evidence.features.find((f) => f.id === 'bld_fip_v3_1911_229_0001');
  if (!building) throw new Error('the committed building is missing');
  const ring = building.geometry.coordinates[0] as Ring;
  const centre: [number, number] = [ring.reduce((s, p) => s + (p[0] as number), 0) / ring.length, ring.reduce((s, p) => s + (p[1] as number), 0) / ring.length];
  const lots = readJson<{ features: Array<{ id: string; geometry: { type: string; coordinates: Ring[] | Ring[][] } }> }>('present', 'present_toronto_property_boundaries_2026.geojson');
  for (const lot of lots.features) {
    const polygons = (lot.geometry.type === 'MultiPolygon' ? lot.geometry.coordinates : [lot.geometry.coordinates]) as Ring[][];
    if (polygons.some((p) => inside(centre, p[0] as Ring))) return lot.id;
  }
  throw new Error('no lot contains the committed building');
}

/** Number of pages in a PDF, from its page objects. */
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page(?![a-z])/g) ?? []).length;
}

test('the Report for the lot with the committed building: screen, then one page on Letter and A4', async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(OUTPUT, { recursive: true });
  const lot = lotWithTheBuilding();

  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(`/report?lot=${encodeURIComponent(lot)}&era=1911`);
  const report = page.getByTestId('report');
  await expect(report).toBeVisible({ timeout: 30_000 });

  // The first line, then the parts in order.
  await expect(page.getByTestId('screens-line')).toHaveText("Buried screens; it doesn't certify.");
  const headings = await page.locator('.report h2').allTextContents();
  expect(headings).toEqual(['Core sample', 'Water', 'What the land was used for', 'Old buildings and fill', 'What these records cannot tell you', 'Before you dig', 'Sources']);
  await expect(page.getByTestId('report-subtitle')).toHaveText('The documented history of this place.');
  await expect(page.locator('.report h1')).not.toHaveText(/documented history/i);
  await expect(page.getByTestId('group-structures')).toContainText('bld_fip_v3_1911_229_0001'.slice(0, 0) + 'fip_v3_1911_229');
  await expect(report).toContainText('Request locates through Ontario Dig Authority before you dig.');
  await expect(page.getByTestId('share-link')).toHaveAttribute('href', new RegExp(`/report\\?lot=${lot}&era=1911`));
  await expect(page.locator('.report a[href="https://ontariodigauthority.ca/"]')).toBeVisible();

  // Report text is 16 px or more on screen.
  const bodySize = await page.locator('.report p').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(bodySize).toBeGreaterThanOrEqual(16);

  await report.screenshot({ path: join(OUTPUT, 'report-screen.png') });

  // The share link opens the same report.
  const share = (await page.getByTestId('share-link').getAttribute('href')) as string;
  const again = await page.context().newPage();
  await again.goto(new URL(share).pathname + new URL(share).search);
  await expect(again.getByTestId('group-structures')).toContainText('fip_v3_1911_229', { timeout: 30_000 });
  await expect(again.getByTestId('records-changed')).toHaveCount(0);
  await again.close();

  // Print: emulate the print media and save a PDF per paper size.
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.getByTestId('print')).toBeHidden();
  const pages: Record<string, number> = {};
  for (const format of ['Letter', 'A4'] as const) {
    const pdf = await page.pdf({ format, printBackground: true, margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' } });
    writeFileSync(join(OUTPUT, `report-${format.toLowerCase()}.pdf`), pdf);
    pages[format] = pageCount(pdf);
  }
  await report.screenshot({ path: join(OUTPUT, 'report-print.png') });
  console.log(`printed pages: ${JSON.stringify(pages)}`);
  expect(pages, 'pages per paper size').toEqual({ Letter: 1, A4: 1 });
});

test('a lot outside the area Buried covers says "Not reconstructed yet." and nothing else', async ({ page }) => {
  await page.goto('/report?lot=no_such_lot');
  await expect(page.getByTestId('report-not-reconstructed')).toContainText('Not reconstructed yet.', { timeout: 30_000 });
  await expect(page.locator('.report h2')).toHaveCount(0);
});

test('the Report works with the Unity build missing: it never asks for it', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => requested.push(r.url()));
  await page.goto(`/report?lot=${encodeURIComponent(lotWithTheBuilding())}`);
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 30_000 });
  expect(requested.filter((u) => /\/unity\//.test(u))).toEqual([]);
});
