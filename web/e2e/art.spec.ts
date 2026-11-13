/**
 * Session 023, scene art direction. Extends the look check (look.spec.ts) with the pictures and
 * measures of the art pass. Each test opens its own page, so one can run alone:
 *   npx playwright test e2e/art.spec.ts -g "pinned"
 * after `npm run build` (the build copies web/public/unity/ into dist/).
 *
 * Pictures go to e2e/output/art-*.png for the maintainer (each also as art-*-<time>.png, a name that
 * has not been seen before). Numbers go to e2e/output/art-*.json.
 *
 * Two things the tests do that the data alone cannot: the committed evidence has no feature of
 * unknown confidence, so the confidence-class test serves the 1911 file with two buildings changed to
 * unknown (a network route inside the test; nothing is written to data/). And the "view" it
 * measures is a script's proxy for a person looking, as in look.spec.ts.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { PNG } from 'pngjs';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(WEB, '..', 'data');
const OUTPUT = join(WEB, 'e2e', 'output');

type Camera = { viewProjection: number[]; canvas: { widthPx: number; heightPx: number } };
type Pixel = { x: number; y: number };
type Ring = number[][];

const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;
const project = readJson<{ origin: { easting: number; northing: number } }>('project.json');

// Palette tokens as RGB, read from tokens.css so the test has no second copy of them.
const tokens = (() => {
  const css = readFileSync(join(WEB, 'src', 'styles', 'tokens.css'), 'utf8');
  const out: Record<string, [number, number, number]> = {};
  for (const m of css.matchAll(/--([a-z-]+):\s*#([0-9a-fA-F]{6})\s*;/g)) {
    const hex = m[2] as string;
    out[m[1] as string] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return out as Record<'soot' | 'haze' | 'parchment' | 'lantern' | 'water', [number, number, number]>;
})();

type EvidenceFeature = {
  id: string;
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  properties: { confidence: string; attributes: { storeys?: number } };
};
type EvidenceFile = { features: EvidenceFeature[] };
const evidence1911 = readJson<EvidenceFile>('evidence', 'fip_v3_1911_229.geojson');

// ---- Geometry helpers (EPSG:26917 metres) ----

function exteriorOf(feature: { geometry: { type: string; coordinates: unknown } }): Ring {
  const g = feature.geometry;
  const polygon = (g.type === 'MultiPolygon' ? (g.coordinates as number[][][][])[0] : g.coordinates) as number[][][];
  return polygon[0] as Ring;
}

function ringsOf(feature: { geometry: { type: string; coordinates: unknown } }): Ring[] {
  const g = feature.geometry;
  const polygons = (g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates]) as number[][][][];
  return polygons.flat();
}

function centroidOf(ring: Ring): [number, number] {
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

function areaOf(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += (ring[i] as number[])[0]! * (ring[i + 1] as number[])[1]! - (ring[i + 1] as number[])[0]! * (ring[i] as number[])[1]!;
  }
  return Math.abs(a / 2);
}

function contains(ring: Ring, [px, py]: [number, number]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i] as [number, number];
    const [xj, yj] = ring[j] as [number, number];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** EPSG:26917 position and height to canvas pixels, from the view-projection the Player reported. */
function projectToPixels(camera: Camera, e: number, n: number, h: number): Pixel & { w: number } {
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

// ---- Pixel helpers ----

function pixel(png: PNG, x: number, y: number): [number, number, number] {
  const cx = Math.min(png.width - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(png.height - 1, Math.max(0, Math.round(y)));
  const i = (png.width * cy + cx) * 4;
  return [png.data[i] as number, png.data[i + 1] as number, png.data[i + 2] as number];
}

function wcagLuminance(c: readonly number[]): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0] as number) + 0.7152 * lin(c[1] as number) + 0.0722 * lin(c[2] as number);
}

const isNear = (p: readonly number[], target: readonly number[], tolerance: number): boolean =>
  Math.abs((p[0] as number) - (target[0] as number)) <= tolerance &&
  Math.abs((p[1] as number) - (target[1] as number)) <= tolerance &&
  Math.abs((p[2] as number) - (target[2] as number)) <= tolerance;

const LANTERN_TOLERANCE = 14;

function lanternPixels(png: PNG): Pixel[] {
  const found: Pixel[] = [];
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (isNear(pixel(png, x, y), tokens.lantern, LANTERN_TOLERANCE)) found.push({ x, y });
    }
  }
  return found;
}

function distanceToSegment(p: Pixel, a: Pixel, b: Pixel): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** The canvas is under the header's overlays at its top, the depth gauge on the right and the attribution at the bottom. */
const underOverlay = (png: PNG, p: Pixel): boolean => p.y < 110 || p.y > png.height - 70 || p.x > png.width - 190 || p.x < 8;

// ---- Page helpers ----

async function openScene(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.getByTestId('view')).toHaveAttribute('data-player-ready', 'true', { timeout: 150_000 });
  await expect(page.getByTestId('debug-state')).toContainText('"running":true', { timeout: 120_000 });
}

type DebugCamera = { target: { easting: number; northing: number }; eye: { heightM: number } } | null;

async function debugCamera(page: Page): Promise<DebugCamera> {
  const state = JSON.parse((await page.getByTestId('debug-state').textContent()) as string) as { camera: DebugCamera };
  return state.camera;
}

async function currentCamera(page: Page): Promise<Camera> {
  return JSON.parse((await page.getByTestId('view').getAttribute('data-camera')) as string) as Camera;
}

async function flyDebugCamera(
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

/**
 * Save a whole-page screenshot as e2e/output/<name>.png, and a copy named <name>-<time>.png (the
 * previous copies of the same picture are removed). The copy has a file name that has not been
 * seen before, so a reviewer who opens pictures one run after another is never shown a cached one.
 */
async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(OUTPUT, `${name}.png`) });
  for (const file of readdirSync(OUTPUT)) {
    if (file.startsWith(`${name}-`) && /-\d{6}\.png$/.test(file)) rmSync(join(OUTPUT, file));
  }
  const now = new Date();
  const stamp = [now.getHours(), now.getMinutes(), now.getSeconds()].map((n) => String(n).padStart(2, '0')).join('');
  await page.screenshot({ path: join(OUTPUT, `${name}-${stamp}.png`) });
}

async function canvasPng(page: Page): Promise<PNG> {
  return PNG.sync.read(await page.getByTestId('unity-canvas').screenshot());
}

async function freshPage(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  return { page, close: () => context.close() };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  mkdirSync(OUTPUT, { recursive: true });
});

// ---------------------------------------------------------------------------------------------

test('art: Today, with no lot pinned, has no lantern anywhere', async ({ browser }) => {
  test.setTimeout(300_000);
  const { page, close } = await freshPage(browser);
  try {
    await page.goto('/explorer');
    await expect
      .poll(
        async () => {
          const text = (await page.getByTestId('view').getAttribute('data-eras-loaded')) ?? '';
          return ['today', '1947', '1935', '1911'].every((id) => text.split(',').includes(id));
        },
        { timeout: 150_000, intervals: [500, 1000] },
      )
      .toBe(true);
    await expect(page.getByTestId('view')).toHaveAttribute('data-camera', /viewProjection/);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    await shoot(page, 'art-today');
    const png = await canvasPng(page);
    // Shell chrome over the canvas may use `lantern` for its focus ring (design.md, "Controls"): the landing
    // field takes focus on load. That ring is excluded by geometry: only the band just outside a focusable Shell
    // control's border box is allowed. The control's own box and everything else on the canvas must have none, so a
    // `lantern` pixel from the scene, or one inside a control, still fails. Nothing is hidden with CSS.
    const canvasBox = (await page.getByTestId('unity-canvas').boundingBox()) as { x: number; y: number };
    const controls = await page.evaluate(() =>
      [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom })),
    );
    const RING_BAND_PX = 6; // 2 px outline + 2 px offset, with room for rounding
    const inRingBand = (p: Pixel): boolean =>
      controls.some((r) => {
        const x = p.x + canvasBox.x;
        const y = p.y + canvasBox.y;
        const inOuter = x >= r.left - RING_BAND_PX && x < r.right + RING_BAND_PX && y >= r.top - RING_BAND_PX && y < r.bottom + RING_BAND_PX;
        const inBox = x >= r.left && x < r.right && y >= r.top && y < r.bottom;
        return inOuter && !inBox;
      });
    const lantern = lanternPixels(png);
    const outsideChrome = lantern.filter((p) => !inRingBand(p));
    writeFileSync(
      join(OUTPUT, 'art-today-lantern.json'),
      JSON.stringify({ lanternPixels: lantern.length, inShellFocusRing: lantern.length - outsideChrome.length, onCanvas: outsideChrome.length, controls }, null, 2),
    );
    expect(outsideChrome.length, 'lantern pixels on the canvas at Today with no lot pinned, outside Shell focus rings').toBe(0);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------------------------

/**
 * Profile contrast across a roof edge, as in look.spec.ts: the WCAG ratio between the brightest and
 * the darkest pixel within 4 px either side of the edge. The share of points along an edge where it is
 * at least ON_CONTRAST is how much of the edge is drawn.
 */
const ON_CONTRAST = 2.4;

function edgeShare(png: PNG, camera: Camera, ring: Ring, roofM: number): { share: number; samples: number } {
  let on = 0;
  let samples = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = projectToPixels(camera, (ring[i] as number[])[0] as number, (ring[i] as number[])[1] as number, roofM);
    const b = projectToPixels(camera, (ring[i + 1] as number[])[0] as number, (ring[i + 1] as number[])[1] as number, roofM);
    if (a.w <= 0 || b.w <= 0) continue;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 40) continue;
    const d = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
    const n = { x: -d.y, y: d.x };
    for (let s = 4; s < length - 4; s += 2) {
      const px = a.x + d.x * s;
      const py = a.y + d.y * s;
      if (underOverlay(png, { x: px, y: py })) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (let k = -4; k <= 4; k++) {
        const l = wcagLuminance(pixel(png, px + n.x * k, py + n.y * k));
        lo = Math.min(lo, l);
        hi = Math.max(hi, l);
      }
      samples++;
      if ((hi + 0.05) / (lo + 0.05) >= ON_CONTRAST) on++;
    }
  }
  return { share: samples === 0 ? NaN : on / samples, samples };
}

test('art: documented, estimated and unknown ghosts differ in their edge pattern', async ({ browser }) => {
  test.setTimeout(300_000);
  const { page, close } = await freshPage(browser);
  try {
    // The nearest buildings to the documented one with room to read an edge on: one stays estimated and
    // one is served as unknown (the committed evidence has none of that class).
    const documented = evidence1911.features.find((f) => f.properties.confidence === 'documented') as EvidenceFeature;
    expect(documented, 'a documented building on the 1911 plate').toBeDefined();
    const here = centroidOf(exteriorOf(documented));
    const near = evidence1911.features
      .filter((f) => f.id !== documented.id && areaOf(exteriorOf(f)) >= 120)
      .map((f) => ({ f, d: Math.hypot(centroidOf(exteriorOf(f))[0] - here[0], centroidOf(exteriorOf(f))[1] - here[1]) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3)
      .map((x) => x.f);
    expect(near.length).toBe(3);
    const [estimated, unknown, other] = near as [EvidenceFeature, EvidenceFeature, EvidenceFeature];
    expect(estimated.properties.confidence).toBe('estimated');
    expect(unknown.properties.confidence).toBe('estimated');

    const served: EvidenceFile = JSON.parse(JSON.stringify(evidence1911)) as EvidenceFile;
    for (const f of served.features) if (f.id === unknown.id || f.id === other.id) f.properties.confidence = 'unknown';
    await page.route('**/data/evidence/fip_v3_1911_229.geojson', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(served) }),
    );

    await openScene(page, 'era=1911&debug=1&markers=0');
    const centres = [documented, estimated, unknown].map((f) => centroidOf(exteriorOf(f)));
    const target: [number, number] = [
      centres.reduce((s, c) => s + c[0], 0) / centres.length,
      centres.reduce((s, c) => s + c[1], 0) / centres.length,
    ];
    const camera = await flyDebugCamera(page, { target, distanceM: 95, pitchDeg: 52, headingDeg: 20 });
    await shoot(page, 'art-estimated-close');
    const png = await canvasPng(page);

    const roof = (f: EvidenceFeature): number => (f.properties.attributes.storeys ?? 1) * 3.5;
    const measured = {
      documented: edgeShare(png, camera, exteriorOf(documented), roof(documented)),
      estimated: edgeShare(png, camera, exteriorOf(estimated), roof(estimated)),
      unknown: edgeShare(png, camera, exteriorOf(unknown), roof(unknown)),
    };
    writeFileSync(join(OUTPUT, 'art-edge-patterns.json'), `${JSON.stringify({ onContrast: ON_CONTRAST, measured }, null, 2)}\n`);
    console.log(
      `edge share (points along the roof edge with contrast >= ${ON_CONTRAST}): documented ${measured.documented.share.toFixed(2)} (${measured.documented.samples}), ` +
        `estimated ${measured.estimated.share.toFixed(2)} (${measured.estimated.samples}), unknown ${measured.unknown.share.toFixed(2)} (${measured.unknown.samples})`,
    );

    for (const [name, m] of Object.entries(measured)) expect(m.samples, `${name}: points measured`).toBeGreaterThanOrEqual(40);
    // A solid line is drawn nearly all along; a dashed one part of the way; no line, hardly at all.
    expect(measured.documented.share, 'documented: solid').toBeGreaterThanOrEqual(0.85);
    expect(measured.estimated.share, 'estimated: dashed, not solid').toBeLessThan(measured.documented.share - 0.15);
    expect(measured.estimated.share, 'estimated: dashed, not absent').toBeGreaterThan(measured.unknown.share + 0.15);
    expect(measured.unknown.share, 'unknown: no outline').toBeLessThan(0.35);
    expect(lanternPixels(png).length, 'lantern pixels with no lot pinned').toBe(0);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------------------------

type LotFeature = { id?: string | number; geometry: { type: string; coordinates: unknown }; properties?: Record<string, unknown> };

test('art: a pinned lot in 1911 is the only lantern, the sheet is lit and its line work reads', async ({ browser }) => {
  test.setTimeout(300_000);
  const { page, close } = await freshPage(browser);
  try {
    // The lot that holds the first 1911 building.
    const building = evidence1911.features.find((f) => f.id === 'bld_fip_v3_1911_229_0001') as EvidenceFeature;
    expect(building, 'bld_fip_v3_1911_229_0001').toBeDefined();
    const where = centroidOf(exteriorOf(building));
    const lots = readJson<{ features: LotFeature[] }>('present', 'present_toronto_property_boundaries_2026.geojson').features;
    const lot = lots.find((l) => (l.geometry.type === 'Polygon' || l.geometry.type === 'MultiPolygon') && ringsOf(l).some((r) => contains(r, where)));
    expect(lot, 'a City lot holds the building').toBeDefined();
    const lotId = String((lot as LotFeature).id ?? ((lot as LotFeature).properties?.PARCELID as string));
    const lotRings = ringsOf(lot as LotFeature);
    const lotBox = lotRings.flat().reduce<[number, number, number, number]>(
      (b, p) => [Math.min(b[0], p[0] as number), Math.min(b[1], p[1] as number), Math.max(b[2], p[0] as number), Math.max(b[3], p[1] as number)],
      [Infinity, Infinity, -Infinity, -Infinity],
    );
    const lotCentre: [number, number] = [(lotBox[0] + lotBox[2]) / 2, (lotBox[1] + lotBox[3]) / 2];

    await openScene(page, `era=1911&lot=${encodeURIComponent(lotId)}&debug=1&markers=0`);

    // The camera flies to the lot (eased, 900 ms): wait until it is centred on it.
    await expect
      .poll(
        async () => {
          const camera = await debugCamera(page);
          return camera ? Math.hypot(camera.target.easting - lotCentre[0], camera.target.northing - lotCentre[1]) : 1e9;
        },
        { timeout: 20_000 },
      )
      .toBeLessThan(1.5);
    await page.waitForTimeout(2500);
    await shoot(page, 'art-1911-pinned');
    const png = await canvasPng(page);
    const camera = await currentCamera(page);

    // The outline, projected onto the canvas.
    const segments: Array<[Pixel, Pixel]> = [];
    for (const ring of lotRings) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = projectToPixels(camera, (ring[i] as number[])[0] as number, (ring[i] as number[])[1] as number, 0);
        const b = projectToPixels(camera, (ring[i + 1] as number[])[0] as number, (ring[i + 1] as number[])[1] as number, 0);
        segments.push([a, b]);
      }
    }
    const nearOutline = (p: Pixel): number => Math.min(...segments.map(([a, b]) => distanceToSegment(p, a, b)));

    // 1. The pinned outline is lantern: along it, a lantern pixel is within 2 px nearly everywhere.
    let along = 0;
    let lit = 0;
    for (const [a, b] of segments) {
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      for (let s = 0; s <= length; s += 3) {
        const p = { x: a.x + ((b.x - a.x) * s) / Math.max(length, 1e-6), y: a.y + ((b.y - a.y) * s) / Math.max(length, 1e-6) };
        if (underOverlay(png, p)) continue;
        along++;
        let found = false;
        for (let dy = -2; dy <= 2 && !found; dy++) {
          for (let dx = -2; dx <= 2 && !found; dx++) found = isNear(pixel(png, p.x + dx, p.y + dy), tokens.lantern, LANTERN_TOLERANCE);
        }
        if (found) lit++;
      }
    }
    // 2. It is the only lantern in the canvas: every lantern pixel is on the outline or at the lamp beside it
    //    (the lamp stands 2.5 m outside the lot with a 4 m post), and none is anywhere else.
    const lantern = lanternPixels(png);
    const stray = lantern.filter((p) => nearOutline(p) > 50);
    // 3. The sheet is lit and its line work reads. In a window around the lot, away from the lantern pixels:
    //    paper is the 80th percentile of luminance, line work the 2nd, and the WCAG ratio is at least 4.5.
    const centre = projectToPixels(camera, lotCentre[0], lotCentre[1], 0);
    const luminances: number[] = [];
    for (let y = Math.max(120, Math.round(centre.y) - 90); y < Math.min(png.height - 80, Math.round(centre.y) + 90); y++) {
      for (let x = Math.max(10, Math.round(centre.x) - 160); x < Math.min(png.width - 200, Math.round(centre.x) + 160); x++) {
        const p = pixel(png, x, y);
        if (isNear(p, tokens.lantern, 40)) continue;
        luminances.push(wcagLuminance(p));
      }
    }
    luminances.sort((a, b) => a - b);
    const at = (q: number): number => luminances[Math.min(luminances.length - 1, Math.floor(q * luminances.length))] as number;
    const paper = at(0.8);
    const line = at(0.02);
    const ratio = (paper + 0.05) / (line + 0.05);
    const inkLuminance = wcagLuminance(tokens.parchment);

    writeFileSync(
      join(OUTPUT, 'art-pinned.json'),
      `${JSON.stringify(
        {
          lotId,
          outlineSamples: along,
          outlineSamplesLantern: lit,
          lanternPixels: lantern.length,
          lanternPixelsMoreThan50pxFromOutline: stray.length,
          windowPixels: luminances.length,
          paperLuminance: paper,
          lineLuminance: line,
          lineAgainstPaper: ratio,
          inkLuminance,
        },
        null,
        2,
      )}\n`,
    );
    console.log(
      `pinned lot ${lotId}: lantern along the outline at ${lit} of ${along} points; ${lantern.length} lantern pixels, ${stray.length} more than 50 px from the outline; ` +
        `paper L ${paper.toFixed(3)}, line L ${line.toFixed(4)}, ${ratio.toFixed(2)} : 1`,
    );

    expect(along, 'points on the outline in view').toBeGreaterThanOrEqual(30);
    expect(lit / along, 'share of the outline drawn in lantern').toBeGreaterThanOrEqual(0.85);
    expect(lantern.length, 'lantern pixels').toBeGreaterThan(100);
    expect(stray, 'lantern pixels away from the pinned lot').toEqual([]);
    expect(luminances.length, 'pixels in the window').toBeGreaterThan(5000);
    expect(paper, 'the paper is lit, not the unlit grey scan').toBeGreaterThan(0.2 * inkLuminance);
    expect(ratio, 'line work against its lit paper, WCAG ratio').toBeGreaterThanOrEqual(4.5);
  } finally {
    await close();
  }
});

// ---------------------------------------------------------------------------------------------

/**
 * Frame times with all 163 buildings of the two plate eras on screen: the depth is held at 2.5, half
 * way from 1935 (63) to 1911 (100), where both eras are drawn. Measured in headless Chromium, which
 * draws WebGL in software (SwiftShader); a person's GPU is faster than this.
 */
async function frameTimes(page: Page, ms: number): Promise<{ frames: number; meanFps: number; p50Ms: number; p95Ms: number; worstMs: number }> {
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

test('art: frame times with all 163 buildings on screen', async ({ browser }) => {
  test.setTimeout(600_000);
  // The suite's Chromium draws WebGL in software (SwiftShader, see playwright.config.ts); a person's
  // browser draws it on the GPU. Both are measured. The software numbers are recorded, not judged; the
  // GPU numbers are held to the brief: 60 fps, and 30 fps under 4x CPU throttling.
  const software = await measureFrameTimes(browser, 'software');
  let gpu: Record<string, FrameStats> | null = null;
  let gpuProblem = '';
  const hardware = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu'] });
  try {
    gpu = await measureFrameTimes(hardware, 'gpu');
  } catch (error) {
    gpuProblem = error instanceof Error ? error.message.split('\n')[0] ?? 'failed' : String(error);
  } finally {
    await hardware.close();
  }
  writeFileSync(join(OUTPUT, 'art-frame-times.json'), `${JSON.stringify({ software, gpu, gpuProblem }, null, 2)}\n`);
  for (const [label, results] of [['software GL', software], ['GPU', gpu]] as const) {
    if (!results) continue;
    for (const [name, m] of Object.entries(results)) {
      console.log(`${label} ${name}: ${m.meanFps.toFixed(1)} fps mean, p50 ${m.p50Ms.toFixed(1)} ms, p95 ${m.p95Ms.toFixed(1)} ms, worst ${m.worstMs.toFixed(1)} ms (${m.frames} frames)`);
    }
  }
  if (gpuProblem) console.log(`GPU run: ${gpuProblem}`);
  expect(gpu, `the GPU run: ${gpuProblem}`).not.toBeNull();
  const results = gpu as Record<string, FrameStats>;
  expect((results.both_eras_163_throttle_1x as FrameStats).meanFps, 'fps with 163 buildings drawn').toBeGreaterThanOrEqual(60);
  expect((results.both_eras_163_throttle_4x as FrameStats).meanFps, 'fps with 163 buildings drawn under 4x CPU throttling').toBeGreaterThanOrEqual(30);
});

type FrameStats = { frames: number; meanFps: number; p50Ms: number; p95Ms: number; worstMs: number };

async function measureFrameTimes(browser: Browser, label: string): Promise<Record<string, FrameStats>> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, baseURL: 'http://127.0.0.1:4173' });
  const page = await context.newPage();
  try {
    await openScene(page, 'era=1911&debug=1&markers=0');
    const top = await page.getByTestId('era-today').boundingBox();
    const bottom = await page.getByTestId('era-1911').boundingBox();
    if (!top || !bottom) throw new Error(`${label}: the gauge stops are not on screen`);
    const x = top.x + 12;
    const y0 = top.y + top.height / 2;
    const y3 = bottom.y + bottom.height / 2;

    const results: Record<string, FrameStats> = {};
    const cdp = await context.newCDPSession(page);
    for (const rate of [1, 4]) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      // At rest on 1911 (100 buildings), then held half way from 1935 to 1911 (both eras: 163 buildings).
      await page.waitForTimeout(1500);
      results[`rest_1911_throttle_${rate}x`] = await frameTimes(page, 4000);
      await page.mouse.move(x, y0 + ((y3 - y0) * 2) / 3);
      await page.mouse.down();
      await page.mouse.move(x, y0 + ((y3 - y0) * 2.5) / 3, { steps: 6 });
      await expect
        .poll(async () => JSON.parse((await page.getByTestId('debug-state').textContent()) as string).depth as number, { timeout: 10_000 })
        .toBeCloseTo(2.5, 1);
      await page.waitForTimeout(1500);
      results[`both_eras_163_throttle_${rate}x`] = await frameTimes(page, 4000);
      await page.mouse.up();
      await page.getByTestId('depth-gauge').focus();
      await page.keyboard.press('End');
      await page.waitForTimeout(1500);
    }
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    return results;
  } finally {
    await context.close();
  }
}
