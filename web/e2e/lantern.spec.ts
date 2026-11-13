/**
 * Session 028: the Lantern and Show Evidence in the real Player. Run after `npm run build` (the build copies
 * web/public/unity/ into dist/):
 *   npx playwright test e2e/lantern.spec.ts
 *
 * Pictures: e2e/output/lantern-today.png (the lens over the bank's lot, 1911 inside and Today outside) and
 * evidence-bank.png (Show Evidence on the bank), each also as <name>-<time>.png. Numbers: lantern-measures.json,
 * evidence-measures.json, lantern-frame-times.json.
 *
 * The lens is measured against two pictures of the same view taken with no lens: Today (A) and 1911 (C). With
 * the lens on, the picture B must be A outside the lens and C inside it, and must differ from both only at the
 * rim. That is "outside the lens no drape pixel is visible, inside it the plate is" in pixels.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expectedPatch, project as projectPoint, tileBoxForWindow } from './support/drapeMath';
import type { Corners, Pt, TileGeometry } from './support/drapeMath';
import { composeLens, mismatch, nearAnySegment, ringCoverage, whereIs } from './support/lens';
import type { Seg } from './support/lens';
import { bestOffset, luma, nccMasked, window as lumaWindow } from './support/ncc';
import { canvasPng, currentCamera, flyDebugCamera, freshPage, frameTimes, openScene, settleCamera, shoot } from './support/scene';
import type { Camera } from './support/scene';
import { lotWithTheBuilding } from './support/lot';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(WEB, '..', 'data');
const OUTPUT = join(WEB, 'e2e', 'output');

const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;
const project = readJson<{ origin: { easting: number; northing: number } }>('project.json');
const ORIGIN: Pt = [project.origin.easting, project.origin.northing];

const BANK = 'bld_fip_v3_1911_229_0001';
type Ring = number[][];
type Feature = { id: string; geometry: { type: string; coordinates: Ring[] }; properties: { attributes: { storeys?: number } } };
const bank = readJson<{ features: Feature[] }>('evidence', 'fip_v3_1911_229.geojson').features.find((f) => f.id === BANK) as Feature;
const bankRing = bank.geometry.coordinates[0] as Ring;
const bankCentre: [number, number] = [
  bankRing.slice(0, -1).reduce((s, p) => s + (p[0] as number), 0) / (bankRing.length - 1),
  bankRing.slice(0, -1).reduce((s, p) => s + (p[1] as number), 0) / (bankRing.length - 1),
];
const bankBox = {
  minE: Math.min(...bankRing.map((p) => p[0] as number)),
  maxE: Math.max(...bankRing.map((p) => p[0] as number)),
  minN: Math.min(...bankRing.map((p) => p[1] as number)),
  maxN: Math.max(...bankRing.map((p) => p[1] as number)),
};

const DIFF = 8; // channel difference that counts as a changed pixel
const BAND = 6; // pixels either side of the lens radius that belong to the rim
const LENS_RADIUS = 0.18; // of the canvas height

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (!existsSync(join(WEB, 'public', 'unity', 'Build'))) throw new Error('Unity build not found; run tools/unity.sh build');
  mkdirSync(OUTPUT, { recursive: true });
});

type Rgba = { width: number; height: number; data: Uint8Array };
const asRgba = (png: PNG): Rgba => ({ width: png.width, height: png.height, data: png.data });

async function showEra(page: Page, steps: number): Promise<void> {
  await page.getByTestId('depth-gauge').focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < steps; i++) await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(3500);
}

// ---------------------------------------------------------------------------------------------

test('the Lantern shows 1911 inside the lens and Today outside it, and goes out with Space, L or Escape', async ({ browser }) => {
  test.setTimeout(400_000);
  const { page, close } = await freshPage(browser);
  try {
    const lotId = lotWithTheBuilding();
    await openScene(page, `lot=${encodeURIComponent(lotId)}&lanternEra=1911&debug=1&markers=0`);
    const camera = await settleCamera(page);
    await page.waitForTimeout(2500); // the light pool and the sheet settle

    const canvasBox = (await page.getByTestId('unity-canvas').boundingBox()) as { x: number; y: number; width: number; height: number };
    const at = projectPoint(camera.viewProjection, camera.canvas, bankCentre[0] - ORIGIN[0], 0, bankCentre[1] - ORIGIN[1]) as [number, number];
    const radius = LENS_RADIUS * camera.canvas.heightPx;
    expect(at[0] - radius, 'the lens fits on the canvas (left)').toBeGreaterThan(0);
    expect(at[0] + radius, 'the lens fits on the canvas (right)').toBeLessThan(camera.canvas.widthPx);
    expect(at[1] - radius, 'the lens fits on the canvas (top)').toBeGreaterThan(0);
    expect(at[1] + radius, 'the lens fits on the canvas (bottom)').toBeLessThan(camera.canvas.heightPx);

    // A: Today, no lens.
    const today = await canvasPng(page);

    // B: Space held over the bank.
    await page.mouse.move(canvasBox.x + at[0], canvasBox.y + at[1]);
    await page.waitForTimeout(300);
    await page.keyboard.down('Space');
    await page.waitForTimeout(900);
    const lens = await canvasPng(page);
    await shoot(page, OUTPUT, 'lantern-today');
    await page.keyboard.up('Space');
    await page.waitForTimeout(700);
    const afterSpace = await canvasPng(page);

    // The toggle key, then Escape.
    await page.keyboard.press('l');
    await page.waitForTimeout(900);
    const toggled = await canvasPng(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(700);
    const afterEscape = await canvasPng(page);

    // The arrow keys move the lens while it is on (requirement 13.7).
    await page.keyboard.press('l');
    await page.waitForTimeout(500);
    for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(700);
    const moved = await canvasPng(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // C: 1911, no lens (the lens works at Today only; the camera does not move on a depth change).
    await showEra(page, 3);
    const era1911 = await canvasPng(page);
    expect((await currentCamera(page)).viewProjection, 'the camera did not move with the depth').toEqual(camera.viewProjection);

    const [a, b, c] = [asRgba(today), asRgba(lens), asRgba(era1911)];
    const where = (x: number, y: number) => whereIs(x, y, at[0], at[1], radius, BAND);
    const outsideBA = mismatch(b, a, (x, y) => where(x, y) === 'outside', DIFF);
    const insideBC = mismatch(b, c, (x, y) => where(x, y) === 'inside', DIFF);
    const insideCA = mismatch(c, a, (x, y) => where(x, y) === 'inside', DIFF);
    const outsideCA = mismatch(c, a, (x, y) => where(x, y) === 'outside', DIFF);
    const composed: Rgba = { width: b.width, height: b.height, data: Uint8Array.from(composeLens(a, c, at[0], at[1], radius, BAND)) };
    const rim = ringCoverage(b, composed, at[0], at[1], radius, 4, 180, 25);
    const afterSpaceVsToday = mismatch(asRgba(afterSpace), a, () => true, DIFF);
    const toggledInside = mismatch(asRgba(toggled), a, (x, y) => where(x, y) === 'inside', DIFF);
    const afterEscapeVsToday = mismatch(asRgba(afterEscape), a, () => true, DIFF);
    const movedRight = mismatch(asRgba(moved), asRgba(toggled), () => true, DIFF);

    const measures = {
      lens: { centre: at, radiusPx: radius, bandPx: BAND },
      outsideLens_lensVsToday: outsideBA,
      insideLens_lensVs1911: insideBC,
      insideLens_1911VsToday: insideCA,
      outsideLens_1911VsToday: outsideCA,
      rimCoverage: rim,
      afterSpaceUp_vsToday: afterSpaceVsToday,
      toggledOn_insideVsToday: toggledInside,
      afterEscape_vsToday: afterEscapeVsToday,
      afterArrowKeys_vsToggled: movedRight,
    };
    writeFileSync(join(OUTPUT, 'lantern-measures.json'), `${JSON.stringify(measures, null, 2)}\n`);
    console.log(
      `lens ${radius.toFixed(0)} px at ${at.map((v) => v.toFixed(0)).join(', ')}: outside differs from Today in ${outsideBA.count} of ${outsideBA.selected} px; ` +
        `inside differs from 1911 in ${insideBC.count} of ${insideBC.selected} px (and from Today in ${insideCA.share.toFixed(2)}); rim ${rim.toFixed(2)}; ` +
        `after Space up ${afterSpaceVsToday.share.toFixed(4)}, after Escape ${afterEscapeVsToday.share.toFixed(4)}`,
    );

    // Outside the lens, no drape pixel: the picture is Today's. (1911 would differ there: the plate is drawn.)
    expect(outsideBA.share, 'outside the lens the picture is Today').toBeLessThanOrEqual(0.002);
    expect(outsideCA.share, 'the 1911 plate is visible outside the lens in the 1911 picture').toBeGreaterThanOrEqual(0.1);
    // Inside the lens, the plate: the picture is the 1911 picture (but for Today's faint outlines, which are drawn in every era).
    expect(insideBC.share, 'inside the lens the picture is 1911').toBeLessThanOrEqual(0.03);
    expect(insideCA.share, 'inside the lens 1911 is not Today').toBeGreaterThanOrEqual(0.5);
    // The rim is a ring.
    expect(rim, 'share of the lens edge with a drawn rim').toBeGreaterThanOrEqual(0.8);
    // Space released, L and Escape.
    expect(afterSpaceVsToday.share, 'Space released: Today again').toBeLessThanOrEqual(0.002);
    expect(toggledInside.share, 'L turns the lens on').toBeGreaterThanOrEqual(0.5);
    expect(afterEscapeVsToday.share, 'Escape turns the lens off').toBeLessThanOrEqual(0.002);
    expect(movedRight.share, 'the arrow keys move the lens').toBeGreaterThan(0.01);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------------------------

test('the Lantern is not offered or drawn away from Today', async ({ browser }) => {
  test.setTimeout(300_000);
  const { page, close } = await freshPage(browser);
  try {
    await openScene(page, 'era=1911&lanternEra=1947&debug=1&markers=0');
    await page.waitForTimeout(3500);
    await expect(page.getByTestId('lantern-toggle')).toHaveCount(0);
    const before = await canvasPng(page);
    await page.mouse.move(640, 400);
    await page.keyboard.down('Space');
    await page.waitForTimeout(800);
    const during = await canvasPng(page);
    await page.keyboard.up('Space');
    expect(mismatch(asRgba(during), asRgba(before), () => true, DIFF).share, 'Space at 1911 changes nothing').toBeLessThanOrEqual(0.002);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------------------------

type FrameStats = { frames: number; meanFps: number; p50Ms: number; p95Ms: number; worstMs: number };

async function lensFrameTimes(browser: Browser, label: string): Promise<Record<string, FrameStats>> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, baseURL: 'http://127.0.0.1:4173' });
  const page = await context.newPage();
  try {
    await openScene(page, `lot=${encodeURIComponent(lotWithTheBuilding())}&lanternEra=1911&debug=1&markers=0`);
    await settleCamera(page);
    await page.waitForTimeout(2500);
    const results: Record<string, FrameStats> = {};
    const cdp = await context.newCDPSession(page);
    for (const rate of [1, 4]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      await page.mouse.move(640, 400);
      await page.waitForTimeout(1000);
      results[`today_throttle_${rate}x`] = await frameTimes(page, 4000);
      await page.keyboard.down('Space');
      await page.waitForTimeout(1000);
      // The pointer keeps moving while the lens is held, as it does in use: a circle of 100 px.
      const moving = (async () => {
        for (let i = 0; i < 60; i++) {
          await page.mouse.move(640 + 100 * Math.cos(i / 6), 400 + 100 * Math.sin(i / 6));
          await page.waitForTimeout(60);
        }
      })();
      results[`lens_on_throttle_${rate}x`] = await frameTimes(page, 3500);
      await moving;
      await page.keyboard.up('Space');
      await page.waitForTimeout(500);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(`${label}: ${Object.entries(results).map(([k, v]) => `${k} ${v.meanFps.toFixed(1)} fps (p95 ${v.p95Ms.toFixed(1)} ms)`).join('; ')}`);
    return results;
  } finally {
    await context.close();
  }
}

test('frame times with the lens on', async ({ browser }) => {
  test.setTimeout(600_000);
  const software = await lensFrameTimes(browser, 'software GL');
  let gpu: Record<string, FrameStats> | null = null;
  let gpuProblem = '';
  const hardware = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
  try {
    gpu = await lensFrameTimes(hardware, 'GPU');
  } catch (error) {
    gpuProblem = error instanceof Error ? error.message.split('\n')[0] ?? 'failed' : String(error);
  } finally {
    await hardware.close();
  }
  writeFileSync(join(OUTPUT, 'lantern-frame-times.json'), `${JSON.stringify({ software, gpu, gpuProblem }, null, 2)}\n`);
  expect(gpu, `the GPU run: ${gpuProblem}`).not.toBeNull();
  const results = gpu as Record<string, FrameStats>;
  expect((results.lens_on_throttle_1x as FrameStats).meanFps, 'fps with the lens on').toBeGreaterThanOrEqual(60);
  expect((results.lens_on_throttle_4x as FrameStats).meanFps, 'fps with the lens on under 4x CPU throttling').toBeGreaterThanOrEqual(30);
});

// ---------------------------------------------------------------------------------------------

const WINDOW = 128;
const SEARCH = 4;
const MIN_NCC = 0.9;
const EVIDENCE_MARGIN_M = 4;
const LINE_PX = 7; // the ghost's line is 2.5 px with a 1.5 px casing each side, at most about 3 px from its centre

type Sidecar = {
  source: string;
  image: string;
  width_px: number;
  height_px: number;
  corners: { top_left: Pt; top_right: Pt; bottom_right: Pt; bottom_left: Pt };
};

function lumaImage(png: PNG): { width: number; height: number; data: Float64Array } {
  const data = new Float64Array(png.width * png.height);
  for (let i = 0; i < data.length; i++) data[i] = luma(png.data[i * 4] as number, png.data[i * 4 + 1] as number, png.data[i * 4 + 2] as number);
  return { width: png.width, height: png.height, data };
}

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

const wcag = (c: readonly number[]): number => {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0] as number) + 0.7152 * lin(c[1] as number) + 0.0722 * lin(c[2] as number);
};

/** Every line the ghost draws over its footprint, in canvas pixels: base ring, floor lines, roof ring and the corners. */
function ghostSegments(camera: Camera, storeys: number): Seg[] {
  const at = (p: number[], y: number): [number, number] =>
    projectPoint(camera.viewProjection, camera.canvas, (p[0] as number) - ORIGIN[0], y, (p[1] as number) - ORIGIN[1]) as [number, number];
  const roof = storeys * 3.5;
  const segments: Seg[] = [];
  for (let i = 0; i < bankRing.length - 1; i++) {
    const p = bankRing[i] as number[];
    const q = bankRing[i + 1] as number[];
    for (let k = 0; k <= storeys; k++) segments.push([at(p, k * 3.5), at(q, k * 3.5)]);
    segments.push([at(p, 0), at(p, roof)]);
  }
  return segments;
}

/** Share of points along the roof ring whose pixels, within 4 px across it, span a WCAG contrast of at least 2.4. */
function roofLineShare(png: PNG, camera: Camera, roofM: number): { share: number; samples: number } {
  let on = 0;
  let samples = 0;
  for (let i = 0; i < bankRing.length - 1; i++) {
    const p0 = bankRing[i] as number[];
    const p1 = bankRing[i + 1] as number[];
    const a = projectPoint(camera.viewProjection, camera.canvas, (p0[0] as number) - ORIGIN[0], roofM, (p0[1] as number) - ORIGIN[1]);
    const b = projectPoint(camera.viewProjection, camera.canvas, (p1[0] as number) - ORIGIN[0], roofM, (p1[1] as number) - ORIGIN[1]);
    if (!a || !b) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 20) continue;
    const d = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    const n = [-(d[1] as number), d[0] as number];
    for (let s = 3; s < length - 3; s += 2) {
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = -4; k <= 4; k++) {
        const x = Math.round(a[0] + (d[0] as number) * s + (n[0] as number) * k);
        const y = Math.round(a[1] + (d[1] as number) * s + (n[1] as number) * k);
        const j = (png.width * y + x) * 4;
        const l = wcag([png.data[j] as number, png.data[j + 1] as number, png.data[j + 2] as number]);
        lo = Math.min(lo, l);
        hi = Math.max(hi, l);
      }
      samples++;
      if ((hi + 0.05) / (lo + 0.05) >= 2.4) on++;
    }
  }
  return { share: samples === 0 ? NaN : on / samples, samples };
}

test('Show Evidence puts the untouched scan beneath the bank and leaves the rest of the sheet lit', async ({ browser }) => {
  test.setTimeout(400_000);
  const pose = { target: bankCentre, distanceM: 100, pitchDeg: 80, headingDeg: 0 };

  // The same view with Show Evidence off: the lit sheet.
  const off = await freshPage(browser);
  let litPng: PNG;
  try {
    await openScene(off.page, 'era=1911&debug=1&markers=0');
    await flyDebugCamera(off.page, pose);
    await off.page.waitForTimeout(1500);
    litPng = await canvasPng(off.page);
  } finally {
    await off.close();
  }

  const { page, close } = await freshPage(browser);
  try {
    await openScene(page, `era=1911&showEvidence=${BANK}&debug=1&markers=0`);
    const camera = await flyDebugCamera(page, pose);
    await page.waitForTimeout(2500);
    await shoot(page, OUTPUT, 'evidence-bank');
    const evidencePng = await canvasPng(page);

    // The patch the Player drew: the footprint's box grown by the margin, as canvas pixels.
    const corners = [
      [bankBox.minE - EVIDENCE_MARGIN_M, bankBox.minN - EVIDENCE_MARGIN_M],
      [bankBox.maxE + EVIDENCE_MARGIN_M, bankBox.minN - EVIDENCE_MARGIN_M],
      [bankBox.maxE + EVIDENCE_MARGIN_M, bankBox.maxN + EVIDENCE_MARGIN_M],
      [bankBox.minE - EVIDENCE_MARGIN_M, bankBox.maxN + EVIDENCE_MARGIN_M],
    ].map(([e, n]) => projectPoint(camera.viewProjection, camera.canvas, (e as number) - ORIGIN[0], 0, (n as number) - ORIGIN[1]) as [number, number]);
    const patchBox = {
      left: Math.min(...corners.map((p) => p[0])),
      right: Math.max(...corners.map((p) => p[0])),
      top: Math.min(...corners.map((p) => p[1])),
      bottom: Math.max(...corners.map((p) => p[1])),
    };
    const GUARD = 24; // px: walls lean out of the footprint, and the patch edge is hard
    const nearPatch = (x: number, y: number): boolean =>
      x >= patchBox.left - GUARD && x <= patchBox.right + GUARD && y >= patchBox.top - GUARD && y <= patchBox.bottom + GUARD;
    const inPatch = (x: number, y: number): boolean => x >= patchBox.left + 4 && x <= patchBox.right - 4 && y >= patchBox.top + 4 && y <= patchBox.bottom - 4;

    const rest = mismatch(asRgba(evidencePng), asRgba(litPng), (x, y) => !nearPatch(x, y), DIFF);
    const patch = mismatch(asRgba(evidencePng), asRgba(litPng), inPatch, DIFF);

    // The patch under the ghost is the tile's own pixels: correlate a window in the middle of the footprint.
    const sidecar = readJson<Sidecar>('tiles', 'fip_v3_1911_229.json');
    const tile: TileGeometry = { corners: sidecar.corners as Corners, widthPx: sidecar.width_px, heightPx: sidecar.height_px, origin: ORIGIN };
    const centre = projectPoint(camera.viewProjection, camera.canvas, bankCentre[0] - ORIGIN[0], 0, bankCentre[1] - ORIGIN[1]) as [number, number];
    const x0 = Math.floor(centre[0]) - WINDOW / 2;
    const y0 = Math.floor(centre[1]) - WINDOW / 2;
    const box = tileBoxForWindow(camera.viewProjection, camera.canvas, tile, x0, y0, WINDOW);
    const region = await tileRegion(page, sidecar.image, box);
    const expected = expectedPatch(camera.viewProjection, camera.canvas, tile, box, region, x0, y0, WINDOW);
    const peak = bestOffset(expected, lumaImage(evidencePng), x0, y0, WINDOW, SEARCH);
    const lit = bestOffset(expected, lumaImage(litPng), x0, y0, WINDOW, SEARCH);

    // The ghost keeps its outline, drawn over the scan; the comparison is about the scan, so the pixels within
    // LINE_PX of a drawn line (roof ring, floor line, base ring, corners) are left out of the correlation.
    const storeys = bank.properties.attributes.storeys ?? 1;
    const segments = ghostSegments(camera, storeys);
    const keep: boolean[] = [];
    for (let j = 0; j < WINDOW; j++) for (let i = 0; i < WINDOW; i++) keep.push(!nearAnySegment(x0 + i, y0 + j, segments, LINE_PX));
    const kept = keep.filter(Boolean).length;
    const maskedNcc = nccMasked(expected, lumaWindow(lumaImage(evidencePng), x0, y0, WINDOW), keep);
    const maskedLit = nccMasked(expected, lumaWindow(lumaImage(litPng), x0, y0, WINDOW), keep);
    expect(x0, 'the correlation window is inside the patch (left)').toBeGreaterThanOrEqual(patchBox.left);
    expect(x0 + WINDOW, 'the correlation window is inside the patch (right)').toBeLessThanOrEqual(patchBox.right);
    expect(y0, 'the correlation window is inside the patch (top)').toBeGreaterThanOrEqual(patchBox.top);
    expect(y0 + WINDOW, 'the correlation window is inside the patch (bottom)').toBeLessThanOrEqual(patchBox.bottom);

    // Its outline is kept.
    const line = roofLineShare(evidencePng, camera, storeys * 3.5);

    const measures = {
      patchBoxPx: patchBox,
      restOfSheet_evidenceVsLit: rest,
      insidePatch_evidenceVsLit: patch,
      window: { x0, y0, size: WINDOW, keptPx: kept, linePx: LINE_PX },
      nccMasked: maskedNcc,
      nccMaskedOfTheLitSheet: maskedLit,
      nccUnmasked: peak,
      nccUnmaskedOfTheLitSheet: lit,
      roofLine: line,
    };
    writeFileSync(join(OUTPUT, 'evidence-measures.json'), `${JSON.stringify(measures, null, 2)}\n`);
    console.log(
      `evidence: patch ncc ${maskedNcc.toFixed(3)} over ${kept} of ${WINDOW * WINDOW} px away from the ghost's lines (the lit sheet ${maskedLit.toFixed(3)}; with the lines ${peak.atZero.toFixed(3)}); ` +
        `rest of the sheet differs from lit in ${rest.count} of ${rest.selected} px; inside the patch ${patch.share.toFixed(2)}; roof line ${line.share.toFixed(2)} of ${line.samples}`,
    );

    expect(rest.share, 'the rest of the sheet keeps its lit look').toBeLessThanOrEqual(0.002);
    expect(patch.share, 'the patch is not the lit sheet').toBeGreaterThanOrEqual(0.3);
    expect(kept, 'pixels left to correlate').toBeGreaterThanOrEqual(WINDOW * WINDOW * 0.5);
    expect(maskedNcc, 'the patch under the ghost matches the untouched tile (normalised cross-correlation)').toBeGreaterThanOrEqual(MIN_NCC);
    expect(maskedLit, 'the lit sheet is not the untouched tile').toBeLessThan(maskedNcc);
    expect(line.samples, 'points measured along the outline').toBeGreaterThanOrEqual(30);
    expect(line.share, 'the ghost keeps its outline').toBeGreaterThanOrEqual(0.8);
  } finally {
    await close();
  }
});
