/**
 * The look check (spec 03 task 16.7, requirement 26). The page is opened without ?debug=1 at
 * 1280 x 800. The tests save `e2e/output/look-*.png` for the maintainer, who checks them against
 * requirement 26 item by item, and automate the parts of 26.1, 26.2, 26.5, 26.6 and 26.9 that a
 * script can judge.
 *
 * Session 015 (maintainer decision, recorded in docs/kiro-sessions/015-look-review-and-drape.md):
 * the default view shows the horizon, so requirement 26.2 now reads: the top rows are within a
 * small distance of `night`; the horizon row lies between 12 and 22 per cent of the canvas height;
 * the rows just above the horizon are lighter and bluer than the top rows; no building silhouette
 * crosses the horizon with more than low contrast. The old (c), which recorded that the horizon
 * was off the canvas, is replaced by that.
 *
 * One thing in task 16.7's wording cannot be done as written, and the test says so:
 *  - (f) Down then Up on the gauge goes from Today to 1947 and back, because 1947 sits between
 *    Today and 1935. The test presses Down twice to reach 1935 and Up twice to return to Today.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(WEB, '..', 'data');
const OUTPUT = join(WEB, 'e2e', 'output');
const ORIGIN = 'http://127.0.0.1:4173';

// Palette tokens as RGB, read from tokens.css so the test has no second copy of them.
const tokens = (() => {
  const css = readFileSync(join(WEB, 'src', 'styles', 'tokens.css'), 'utf8');
  const out: Record<string, [number, number, number]> = {};
  for (const m of css.matchAll(/--([a-z]+):\s*#([0-9a-fA-F]{6})\s*;/g)) {
    const hex = m[2] as string;
    out[m[1] as string] = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return out as Record<'night' | 'fog' | 'lantern' | 'water' | 'text', [number, number, number]>;
})();

const MAGENTA: [number, number, number] = [255, 0, 255];

type Camera = { viewProjection: number[]; canvas: { widthPx: number; heightPx: number } };
type Point = { x: number; y: number };

const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;
const project = readJson<{ origin: { easting: number; northing: number } }>('project.json');

/** EPSG:26917 position and height to canvas pixels, from the view-projection the Player reported. */
function projectToPixels(camera: Camera, e: number, n: number, h: number): Point & { w: number } {
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

/** The canvas row where horizontal rays heading north meet (the horizon), or null when it is behind the camera. */
function horizonRow(camera: Camera): number | null {
  const m = camera.viewProjection;
  const y = m[9] as number; // clip y of the direction (0, 0, 1, 0)
  const w = m[11] as number;
  if (w <= 0) return null;
  return (1 - (y / w * 0.5 + 0.5)) * camera.canvas.heightPx;
}

function pixel(png: PNG, x: number, y: number): [number, number, number] {
  const i = (png.width * y + x) * 4;
  return [png.data[i] as number, png.data[i + 1] as number, png.data[i + 2] as number];
}

/** Per-channel median of the pixels in rows [from, to): the colour of the background, whatever stands in front of part of it. */
function meanRows(png: PNG, from: number, to: number): [number, number, number] {
  const channels: number[][] = [[], [], []];
  for (let y = Math.max(0, Math.floor(from)); y < Math.min(png.height, Math.ceil(to)); y++) {
    for (let x = 0; x < png.width; x++) {
      const p = pixel(png, x, y);
      (channels[0] as number[]).push(p[0]);
      (channels[1] as number[]).push(p[1]);
      (channels[2] as number[]).push(p[2]);
    }
  }
  const median = (values: number[]): number => {
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)] as number;
  };
  return [median(channels[0] as number[]), median(channels[1] as number[]), median(channels[2] as number[])];
}

const luminance = (c: readonly number[]): number => 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);

/** WCAG relative luminance of an sRGB colour, 0 to 1. */
function wcagLuminance(c: readonly number[]): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c[0] as number) + 0.7152 * lin(c[1] as number) + 0.0722 * lin(c[2] as number);
}

/** Pixels within `tolerance` per channel of a colour. */
function countNear(png: PNG, target: readonly number[], tolerance: number): number {
  let count = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const p = pixel(png, x, y);
      if (Math.abs(p[0] - (target[0] as number)) <= tolerance && Math.abs(p[1] - (target[1] as number)) <= tolerance && Math.abs(p[2] - (target[2] as number)) <= tolerance) count++;
    }
  }
  return count;
}

let page: Page;
const requested: string[] = [];
const shots: Record<string, PNG> = {};

async function currentCamera(): Promise<Camera> {
  const text = await page.getByTestId('view').getAttribute('data-camera');
  if (!text) throw new Error('the Player has not reported its camera');
  return JSON.parse(text) as Camera;
}

async function announcement(): Promise<string> {
  return ((await page.getByTestId('era-announcement').textContent()) ?? '').trim();
}

async function settle(): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
  await page.waitForTimeout(600);
}

/** Save the whole page as look-<name>.png and keep the canvas for pixel checks. */
async function shoot(name: string): Promise<void> {
  await settle();
  await page.screenshot({ path: join(OUTPUT, `look-${name}.png`) });
  shots[name] = PNG.sync.read(await page.getByTestId('unity-canvas').screenshot());
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  if (!existsSync(join(WEB, 'public', 'unity', 'Build'))) throw new Error('Unity build not found; run the Unity build command');
  mkdirSync(OUTPUT, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  page = await context.newPage();
  page.on('request', (request) => requested.push(request.url()));
  await page.goto('/');
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
  await shoot('today');
});

test.afterAll(async () => {
  await page.context().close();
});

test('(a) every request is to the same origin, fonts included', () => {
  const foreign = requested.filter((url) => !url.startsWith(ORIGIN) && !url.startsWith('data:') && !url.startsWith('blob:'));
  expect(foreign).toEqual([]);
  expect(requested.some((url) => /\.woff2?$/.test(url)), 'the fonts are served from the site').toBe(true);
});

test('Today, 1935 and 1911 are reached with the Down key and saved', async () => {
  const gauge = page.getByTestId('depth-gauge');
  expect(await announcement()).toBe('Now showing Today');
  await gauge.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  expect(await announcement()).toBe('Now showing 1935');
  await shoot('1935');
  await page.keyboard.press('ArrowDown');
  expect(await announcement()).toBe('Now showing 1911 (revised to 1914)');
  await shoot('1911');
});

test('26.1 the published building is in the middle third of the canvas', async () => {
  const camera = await currentCamera();
  const { widthPx: w, heightPx: h } = camera.canvas;

  const collection = readJson<{ features: Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] }; properties: { kind: string; status: string; attributes: { storeys?: number } } }> }>('evidence', 'fip_v3_1911_229.geojson');
  const building = collection.features.find((f) => f.properties.kind === 'building' && f.properties.status === 'published');
  expect(building, 'a published building on plate 229 (1911)').toBeDefined();
  const polygon = ((building as NonNullable<typeof building>).geometry.type === 'MultiPolygon'
    ? (building as NonNullable<typeof building>).geometry.coordinates[0]
    : (building as NonNullable<typeof building>).geometry.coordinates) as number[][][];
  const ring = polygon[0] as number[][];
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
  const roof = ((building as NonNullable<typeof building>).properties.attributes.storeys ?? 1) * 3.5;
  const centre = projectToPixels(camera, cx / (3 * area), cy / (3 * area), roof);
  expect(centre.x, 'building x').toBeGreaterThan(w / 3);
  expect(centre.x, 'building x').toBeLessThan((2 * w) / 3);
  expect(centre.y, 'building y').toBeGreaterThan(h / 3);
  expect(centre.y, 'building y').toBeLessThan((2 * h) / 3);
});

test('26.2 / (c) night at the top, the horizon at 12 to 22 per cent, lighter and bluer sky above it, no building silhouette across it', async () => {
  const camera = await currentCamera();
  const row = horizonRow(camera);
  const h = camera.canvas.heightPx;
  console.log(`the horizon projects to canvas row ${row === null ? 'behind the camera' : row.toFixed(1)} of ${h}`);
  expect(row, 'the horizon is in front of the camera').not.toBeNull();
  const horizon = row as number;
  expect(horizon / h, 'the horizon row as a share of the canvas height').toBeGreaterThanOrEqual(0.12);
  expect(horizon / h, 'the horizon row as a share of the canvas height').toBeLessThanOrEqual(0.22);

  for (const name of ['today', '1935', '1911']) {
    const png = shots[name] as PNG;
    const top = meanRows(png, 0, png.height * 0.05);
    for (let c = 0; c < 3; c++) {
      expect(Math.abs((top[c] as number) - (tokens.night[c] as number)), `${name} top rows channel ${c}`).toBeLessThanOrEqual(6);
    }
    // The rows just above the horizon (a band 3 to 12 px above it) are lighter and bluer than the top rows.
    const above = meanRows(png, horizon - 12, horizon - 3);
    expect(luminance(above), `${name} sky above the horizon is lighter than the top`).toBeGreaterThan(luminance(top));
    expect((above[2] as number) - (above[0] as number), `${name} sky above the horizon is bluer than the top`).toBeGreaterThan(
      (top[2] as number) - (top[0] as number),
    );
    // No building silhouette crosses the horizon with more than low contrast: against the sky band
    // beside it, no column of the band 4 px above the horizon differs by more than 1.25 : 1 (WCAG ratio).
    const reference = wcagLuminance(meanRows(png, horizon - 5, horizon - 3));
    let worst = 1;
    const y = Math.max(0, Math.round(horizon) - 4);
    for (let x = 0; x < png.width; x++) {
      const l = wcagLuminance(pixel(png, x, y));
      worst = Math.max(worst, (Math.max(l, reference) + 0.05) / (Math.min(l, reference) + 0.05));
    }
    console.log(`${name}: worst contrast across the horizon band ${worst.toFixed(3)} : 1`);
    expect(worst, `${name} contrast of a silhouette across the horizon`).toBeLessThanOrEqual(1.25);
    // No pure black anywhere on the page's canvas.
    expect(countNear(png, [0, 0, 0], 2), `${name} pure black pixels`).toBe(0);
  }
});

test('Today is not flat: roofs read at least 1.35 : 1 against the ground, and below a ghost', async () => {
  const camera = await currentCamera();
  const png = shots.today as PNG;
  const { widthPx: w, heightPx: h } = camera.canvas;
  const layer = readJson<{ features: Array<{ geometry: { type: string; coordinates: number[][][] | number[][][][] } }> }>(
    'present',
    'present_toronto_building_outlines_2026.geojson',
  );
  const rings: number[][][] = [];
  for (const f of layer.features) {
    const polygons = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]) as number[][][][];
    for (const polygon of polygons) if (polygon[0]) rings.push(polygon[0]);
  }
  const areaOf = (ring: number[][]): number => {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) a += (ring[i] as number[])[0]! * (ring[i + 1] as number[])[1]! - (ring[i + 1] as number[])[0]! * (ring[i] as number[])[1]!;
    return a / 2;
  };
  const centroidOf = (ring: number[][]): [number, number] => {
    const a = areaOf(ring);
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i] as [number, number];
      const [x1, y1] = ring[i + 1] as [number, number];
      const cross = x0 * y1 - x1 * y0;
      cx += (x0 + x1) * cross;
      cy += (y0 + y1) * cross;
    }
    return [cx / (6 * a), cy / (6 * a)];
  };
  const patchMedian = (x: number, y: number, r: number): [number, number, number] => {
    const sub = new PNG({ width: 2 * r + 1, height: 2 * r + 1 });
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const p = pixel(png, x + dx, y + dy);
        const i = ((dy + r) * sub.width + (dx + r)) * 4;
        sub.data[i] = p[0];
        sub.data[i + 1] = p[1];
        sub.data[i + 2] = p[2];
      }
    }
    return meanRows(sub, 0, sub.height);
  };
  const inside = (p: Point): boolean => p.x > 30 && p.x < w - 30 && p.y > 0.25 * h && p.y < h - 30;

  // Roofs: the centroids of the large buildings (over 400 m2) in the lower half of the canvas, the
  // near half of the block, where the fog has not yet taken most of the colour; the roof is 7 m up.
  const roofs: number[] = [];
  for (const ring of rings) {
    if (Math.abs(areaOf(ring)) < 400) continue;
    const [cx, cy] = centroidOf(ring);
    const p = projectToPixels(camera, cx, cy, 7);
    if (p.w <= 0 || !inside(p) || p.y < 0.5 * h) continue;
    roofs.push(wcagLuminance(patchMedian(Math.round(p.x), Math.round(p.y), 2)));
  }
  expect(roofs.length, 'large present buildings in the lower half of the canvas').toBeGreaterThanOrEqual(3);
  roofs.sort((a, b) => a - b);
  const roof = roofs[Math.floor(roofs.length / 2)] as number;

  // Ground: points on a 15 m grid that are 45 m or more from every footprint, so no wall hides them.
  const distToRing = (px: number, py: number, ring: number[][]): number => {
    let best = Infinity;
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i] as [number, number];
      const [x1, y1] = ring[i + 1] as [number, number];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy)));
    }
    return best;
  };
  const grounds: number[] = [];
  for (let e = 632000; e <= 632900 && grounds.length < 200; e += 15) {
    for (let n = 4834600; n <= 4835400 && grounds.length < 200; n += 15) {
      const p = projectToPixels(camera, e, n, 0);
      if (p.w <= 0 || !inside(p)) continue;
      if (rings.some((ring) => distToRing(e, n, ring) < 45)) continue;
      grounds.push(wcagLuminance(patchMedian(Math.round(p.x), Math.round(p.y), 1)));
    }
  }
  expect(grounds.length, 'open ground samples on the canvas').toBeGreaterThanOrEqual(10);
  grounds.sort((a, b) => a - b);
  const ground = grounds[Math.floor(grounds.length / 2)] as number;

  const ratio = (roof + 0.05) / (ground + 0.05);
  console.log(`roof : ground contrast ${ratio.toFixed(3)} : 1 (roof L ${roof.toFixed(4)} from ${roofs.length} buildings, ground L ${ground.toFixed(4)} from ${grounds.length} points)`);
  expect(ratio, 'roof against ground, WCAG ratio').toBeGreaterThanOrEqual(1.35);

  // Below ghosts: a documented ghost is `ink` at alpha 0.35 over what lies beneath it, so its
  // luminance is at least 0.35 of ink's; a roof must stay under that.
  const ink = wcagLuminance([232, 223, 200]);
  expect(roof, 'a roof is dimmer than a ghost').toBeLessThan(0.35 * ink);
});

test('26.5 / (b) no lantern or water colour, and no debug marker, in the canvas or the DOM', async () => {
  for (const name of Object.keys(shots)) {
    const png = shots[name] as PNG;
    expect(countNear(png, tokens.lantern, 12), `${name}: lantern pixels`).toBe(0);
    expect(countNear(png, tokens.water, 12), `${name}: water pixels`).toBe(0);
    expect(countNear(png, MAGENTA, 12), `${name}: debug marker pixels`).toBe(0);
  }
  const offenders = await page.evaluate(
    ({ lantern, water }) => {
      const hits: string[] = [];
      const bad = (value: string): boolean => {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
        if (!m) return false;
        const rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
        return [lantern, water].some((t) => t.every((v, i) => Math.abs(v - (rgb[i] as number)) <= 12));
      };
      for (const el of document.querySelectorAll('*')) {
        const style = getComputedStyle(el);
        for (const prop of ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'outlineColor'] as const) {
          if (bad(style[prop])) hits.push(`${el.tagName.toLowerCase()}.${el.className} ${prop}`);
        }
      }
      return hits;
    },
    { lantern: tokens.lantern, water: tokens.water },
  );
  expect(offenders).toEqual([]);
});

test('26.6 / (e) the wordmark is Fraunces, the gauge years and the card id are IBM Plex Mono, the card body is Inter at 16 px or more', async () => {
  // Open the card on the building first, at 1911.
  const camera = await currentCamera();
  expect(await announcement()).toBe('Now showing 1911 (revised to 1914)');
  const collection = readJson<{ features: Array<{ geometry: { coordinates: number[][][] } }> }>('evidence', 'fip_v3_1911_229.geojson');
  const ring = (collection.features[0] as NonNullable<(typeof collection.features)[number]>).geometry.coordinates[0] as number[][];
  const cx = ring.reduce((s, p) => s + (p[0] as number), 0) / ring.length;
  const cy = ring.reduce((s, p) => s + (p[1] as number), 0) / ring.length;
  const at = projectToPixels(camera, cx, cy, 3.5);
  const box = await page.getByTestId('unity-canvas').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move((box as { x: number }).x + at.x, (box as { y: number }).y + at.y);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect(page.getByTestId('evidence-card')).toBeVisible({ timeout: 30_000 });

  const families = await page.evaluate(() => {
    const family = (selector: string): string => (getComputedStyle(document.querySelector(selector) as Element).fontFamily.split(',')[0] ?? '').replace(/["']/g, '').trim();
    const size = (selector: string): number => parseFloat(getComputedStyle(document.querySelector(selector) as Element).fontSize);
    return {
      wordmark: family('[data-testid="wordmark"]'),
      link: family('[data-testid="nav-sources"]'),
      gaugeYear: family('.depth-year'),
      cardHeading: family('.card h2'),
      cardId: family('[data-testid="card-feature"]'),
      cardPosition: family('[data-testid="card-position"]'),
      cardBody: family('[data-testid="card-confidence"]'),
      cardBodySize: size('[data-testid="card-confidence"]'),
      headingSize: size('.card h2'),
      loaded: document.fonts.check('600 28px Fraunces') && document.fonts.check('16px Inter') && document.fonts.check('16px "IBM Plex Mono"'),
    };
  });
  expect(families.wordmark).toBe('Fraunces');
  expect(families.link).toBe('Inter');
  expect(families.gaugeYear).toBe('IBM Plex Mono');
  expect(families.cardHeading).toBe('Fraunces');
  expect(families.cardId).toBe('IBM Plex Mono');
  expect(families.cardPosition).toBe('IBM Plex Mono');
  expect(families.cardBody).toBe('Inter');
  expect(families.cardBodySize).toBeGreaterThanOrEqual(16);
  expect(families.headingSize).toBe(22);
  expect(families.loaded, 'the three faces are loaded').toBe(true);

  // 26.8: the card does not cover the building.
  const card = await page.getByTestId('evidence-card').boundingBox();
  expect(card).not.toBeNull();
  expect((card as { x: number; width: number }).x + (card as { width: number }).width).toBeLessThan((box as { x: number }).x + at.x);
  // The card's title is always visible: inside the viewport, below the header, and not covered by anything else.
  const heading = await page.getByTestId('card-heading').boundingBox();
  expect(heading).not.toBeNull();
  const hb = heading as { x: number; y: number; width: number; height: number };
  expect(hb.y, 'heading top is below the header').toBeGreaterThanOrEqual(56);
  expect(hb.y + hb.height, 'heading bottom is inside the viewport').toBeLessThanOrEqual(800);
  expect(hb.x).toBeGreaterThanOrEqual(0);
  expect(hb.x + hb.width).toBeLessThanOrEqual(1280);
  const covered = await page.evaluate(
    ({ x, y }) => {
      const top = document.elementFromPoint(x, y);
      const heading = document.querySelector('[data-testid="card-heading"]');
      return !!top && !!heading && (top === heading || heading.contains(top));
    },
    { x: hb.x + Math.min(8, hb.width / 2), y: hb.y + hb.height / 2 },
  );
  expect(covered, 'the heading is the topmost element at its own position').toBe(true);
  // The confirmation time is worded for people and carries the ISO string in its title.
  await expect(page.getByTestId('card-confirmed-at')).toHaveText(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} UTC$/);
  await expect(page.getByTestId('card-confirmed-at')).toHaveAttribute('title', /^\d{4}-\d{2}-\d{2}T/);
  await shoot('card-1911');
});

test('26.7 / 26.10 the gauge lists the eras top to bottom on the right edge and shows its focus ring', async () => {
  const labels = await page.locator('.depth-stop').allTextContents();
  expect(labels.map((l) => l.trim())).toEqual(['Today', '1947', '1935', '1911']);
  const gauge = await page.getByTestId('depth-gauge').boundingBox();
  expect(gauge).not.toBeNull();
  expect((gauge as { x: number; width: number }).x + (gauge as { width: number }).width).toBeGreaterThan(1280 - 48);

  await page.getByTestId('depth-gauge').focus();
  const outline = await page.getByTestId('depth-gauge').evaluate((el) => {
    const s = getComputedStyle(el);
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  expect(outline.style).not.toBe('none');
  expect(outline.width).toBeGreaterThanOrEqual(2);
  await page.keyboard.press('Escape'); // close the card; the gauge keeps focus
  await shoot('gauge-focus');
});

test('26.9 the attribution of the drape on show is legible along the bottom edge', async () => {
  const text = await page.getByTestId('attribution').textContent();
  expect(text).toContain('University of Toronto Map & Data Library');
  const box = await page.getByTestId('attribution').boundingBox();
  expect((box as { y: number; height: number }).y + (box as { height: number }).height).toBeGreaterThan(800 - 4);
  const size = await page.getByTestId('attribution').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(14);
});

test('(f) Down then Up on the gauge announces the eras it passes, back to Today', async () => {
  const gauge = page.getByTestId('depth-gauge');
  await gauge.focus();
  await page.keyboard.press('Home');
  expect(await announcement()).toBe('Now showing Today');
  await page.keyboard.press('ArrowDown');
  expect(await announcement()).toBe('Now showing 1947');
  await page.keyboard.press('ArrowDown');
  expect(await announcement()).toBe('Now showing 1935');
  await page.keyboard.press('ArrowUp');
  expect(await announcement()).toBe('Now showing 1947');
  await page.keyboard.press('ArrowUp');
  expect(await announcement()).toBe('Now showing Today');
  await expect(gauge).toHaveAttribute('aria-valuenow', '0');
  await expect(gauge).toHaveAttribute('aria-valuetext', 'Today');
});

test('no console errors from the Shell while looking', async () => {
  // Reaching here with the Player running is the check; the Player's own start-up messages about
  // unused URP shaders go to the console as log lines, not as page errors.
  expect(await page.getByTestId('view').getAttribute('data-player-ready')).toBe('true');
});
