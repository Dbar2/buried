/**
 * The Nov 14 gate (spec 03 requirement 24.4, design.md "Gate verification").
 *
 * Test 1 needs no building: three ground control points drawn by the Player as debug markers must
 * stay within 2 px between the 1911 and 1935 eras and within 2 px of where this test projects them
 * from the camera's reported view-projection matrix. Pixel deltas are written to
 * e2e/output/gate-deltas.json together with a screenshot of each era.
 *
 * Test 2 needs the gate building (data/evidence/fip_v3_1911_229.geojson, tasks.md 1.11): it projects
 * the building's roof centroid, clicks it, and checks the DOM card. It skips with a message when the
 * evidence file is not there yet.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { positionPhrase } from '../src/evidence/position';
import { eraOrder } from '../src/explorer/eraOrder';
import { pickGateMarkers } from '../src/explorer/gateMarkers';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const DATA = join(WEB, '..', 'data');
const OUTPUT = join(WEB, 'e2e', 'output');
const TOLERANCE_PX = 2;

type Camera = {
  viewProjection: number[];
  canvas: { widthPx: number; heightPx: number };
};
type DebugState = {
  depth: number;
  ready: boolean;
  running: boolean;
  eraLoaded: string[];
  markersSent: Array<{ id: string; position: [number, number] }>;
  cameraSeq: number;
  camera: Camera | null;
  errors: string[];
};
type Point = { x: number; y: number };

const readJson = <T>(...parts: string[]): T => JSON.parse(readFileSync(join(DATA, ...parts), 'utf8')) as T;

const project = readJson<{
  origin: { easting: number; northing: number };
  eras: Array<{ id: string; label: string; year_from: number; year_to: number }>;
}>('project.json');
const order = eraOrder(project.eras);
const depthOf = (id: string): number => {
  const era = order.find((e) => e.id === id);
  if (!era) throw new Error(`the project has no era ${id}`);
  return era.index;
};

async function debugState(page: Page): Promise<DebugState> {
  const text = await page.getByTestId('debug-state').textContent();
  return JSON.parse(text ?? '{}') as DebugState;
}

async function failIfPlayerUnavailable(page: Page): Promise<void> {
  const message = page.locator('.stage-message');
  if ((await message.count()) > 0) {
    const text = (await message.first().textContent()) ?? '';
    if (/did not load|cannot show|could not be loaded/.test(text)) throw new Error(`The 3D view is not available: ${text}`);
  }
}

async function waitFor(page: Page, what: string, predicate: (s: DebugState) => boolean): Promise<DebugState> {
  let last: DebugState | null = null;
  await expect
    .poll(
      async () => {
        await failIfPlayerUnavailable(page);
        last = await debugState(page);
        return predicate(last);
      },
      { message: `waiting for ${what}`, timeout: 150_000, intervals: [250, 500, 1000] },
    )
    .toBe(true);
  return last as unknown as DebugState;
}

async function openGate(page: Page): Promise<DebugState> {
  await page.goto('/?debug=1');
  // The Shell's overlays (gauge, hint, attribution bar) sit over the canvas. They are hidden here so
  // that a marker near an edge of the canvas is measured, not the panel in front of it.
  await page.addStyleTag({ content: '.attribution, .view-hint { visibility: hidden; } .depth-gauge { opacity: 0; }' });
  return waitFor(
    page,
    'the Player to be ready with both gate eras loaded and the markers sent',
    (s) => s.ready && s.running && s.eraLoaded.includes('1911') && s.eraLoaded.includes('1935') && s.markersSent.length === 3,
  );
}

/**
 * The default pose frames the block around the building (requirement 16.8), which is smaller than
 * the area the three control points span. Zoom out with the mouse wheel (the interim mapping,
 * requirement 16.6) until all of them are inside the canvas.
 */
async function zoomOutToShow(page: Page, positions: Array<[number, number]>): Promise<void> {
  const box = await page.getByTestId('unity-canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let attempt = 0; attempt < 16; attempt++) {
    const camera = (await debugState(page)).camera;
    if (camera) {
      const inside = positions.every(([e, n]) => {
        const p = projectToPixels(camera, e, n, 0);
        return p.x > 30 && p.x < camera.canvas.widthPx - 30 && p.y > 30 && p.y < camera.canvas.heightPx - 30;
      });
      if (inside) return;
    }
    const before = (await debugState(page)).cameraSeq;
    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await debugState(page)).cameraSeq, { timeout: 10_000 }).toBeGreaterThan(before);
  }
  throw new Error('could not zoom out far enough to show the three control points');
}

/** EPSG:26917 position and height to canvas pixels, from the view-projection the Player reported. */
function projectToPixels(camera: Camera, e: number, n: number, h: number): Point {
  const x = e - project.origin.easting; // double precision, before anything is narrowed
  const y = h;
  const z = n - project.origin.northing;
  const m = camera.viewProjection;
  const clip = [0, 1, 2, 3].map((r) => (m[r] as number) * x + (m[4 + r] as number) * y + (m[8 + r] as number) * z + (m[12 + r] as number));
  const w = clip[3] as number;
  const ndcX = (clip[0] as number) / w;
  const ndcY = (clip[1] as number) / w;
  return {
    x: (ndcX * 0.5 + 0.5) * camera.canvas.widthPx,
    y: (1 - (ndcY * 0.5 + 0.5)) * camera.canvas.heightPx,
  };
}

/** Centroid of the #FF00FF pixels within `radius` px of `near`, or null when there are too few. */
function findMarker(png: PNG, near: Point, radius = 8): Point | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  const x0 = Math.max(0, Math.floor(near.x - radius));
  const x1 = Math.min(png.width - 1, Math.ceil(near.x + radius));
  const y0 = Math.max(0, Math.floor(near.y - radius));
  const y1 = Math.min(png.height - 1, Math.ceil(near.y + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (png.width * y + x) * 4;
      const r = png.data[i] as number;
      const g = png.data[i + 1] as number;
      const b = png.data[i + 2] as number;
      if (r >= 250 && g <= 8 && b >= 250) {
        sumX += x + 0.5; // a pixel's centre
        sumY += y + 0.5;
        count++;
      }
    }
  }
  return count >= 10 ? { x: sumX / count, y: sumY / count } : null;
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  if (!existsSync(join(WEB, 'public', 'unity', 'Build'))) {
    throw new Error('Unity build not found; run the Unity build command');
  }
  mkdirSync(OUTPUT, { recursive: true });
});

test('three ground control points stay put between the 1911 and 1935 eras', async ({ page }) => {
  const opened = await openGate(page);

  // The markers the Shell sent are the ones the design picks from the two control files.
  const first = readJson<Parameters<typeof pickGateMarkers>[0]>('control', 'fip_v3_1911_229.json');
  const second = readJson<Parameters<typeof pickGateMarkers>[0]>('control', 'fip_v3_1935_229.json');
  const expected = pickGateMarkers(first, second);
  expect(opened.markersSent).toEqual(expected);
  expect(expected).toHaveLength(3);
  await zoomOutToShow(page, expected.map((m) => m.position));

  const shots: Record<string, { centroids: Array<Point | null>; projected: Point[] }> = {};

  for (const eraId of ['1911', '1935']) {
    const before = (await debugState(page)).cameraSeq;
    await page.getByTestId(`era-${eraId}`).click();
    await waitFor(page, `the Player to report its camera after switching to ${eraId}`, (s) => s.depth === depthOf(eraId) && s.cameraSeq > before);
    // Two frames, so the switch is on screen before the screenshot.
    await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

    const state = await debugState(page);
    const camera = state.camera;
    expect(camera, 'the camera report').not.toBeNull();
    const png = PNG.sync.read(await page.getByTestId('unity-canvas').screenshot());
    writeFileSync(join(OUTPUT, `gate-${eraId}.png`), PNG.sync.write(png));

    // The screenshot is in CSS pixels and the canvas in device pixels; with a device scale factor of 1 they match.
    const scale = png.width / (camera as Camera).canvas.widthPx;
    expect(scale, 'screenshot width / canvas width').toBeCloseTo(1, 3);

    const projected = expected.map((m) => projectToPixels(camera as Camera, m.position[0], m.position[1], 0));
    shots[eraId] = { projected, centroids: projected.map((p) => findMarker(png, p)) };
  }

  const deltas = expected.map((m, i) => {
    const a = shots['1911'];
    const b = shots['1935'];
    const ca = a?.centroids[i] ?? null;
    const cb = b?.centroids[i] ?? null;
    return {
      id: m.id,
      reference: m.position,
      projected1911: a?.projected[i] ?? null,
      projected1935: b?.projected[i] ?? null,
      centroid1911: ca,
      centroid1935: cb,
      betweenErasPx: ca && cb ? distance(ca, cb) : null,
      from1911ProjectionPx: ca && a ? distance(ca, a.projected[i] as Point) : null,
      from1935ProjectionPx: cb && b ? distance(cb, b.projected[i] as Point) : null,
    };
  });
  writeFileSync(join(OUTPUT, 'gate-deltas.json'), `${JSON.stringify(deltas, null, 2)}\n`);
  console.log(`gate pixel deltas:\n${JSON.stringify(deltas, null, 2)}`);

  for (const d of deltas) {
    expect(d.centroid1911, `${d.id} is visible in the 1911 screenshot`).not.toBeNull();
    expect(d.centroid1935, `${d.id} is visible in the 1935 screenshot`).not.toBeNull();
    expect(d.betweenErasPx as number, `${d.id} between eras`).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(d.from1911ProjectionPx as number, `${d.id} from the 1911 projection`).toBeLessThanOrEqual(TOLERANCE_PX);
    expect(d.from1935ProjectionPx as number, `${d.id} from the 1935 projection`).toBeLessThanOrEqual(TOLERANCE_PX);
  }
});

type GateFeature = {
  id: string;
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
  properties: {
    kind: string;
    status: string;
    attributes: { storeys?: number };
    provenance: { origin_source: string; confirmed_by: string; confirmed_at: string };
    position_error_m: number;
  };
};

test('clicking the gate building shows its provenance in a DOM card', async ({ page }) => {
  const evidencePath = join(DATA, 'evidence', 'fip_v3_1911_229.geojson');
  test.skip(
    !existsSync(evidencePath),
    'No gate building yet: data/evidence/fip_v3_1911_229.geojson does not exist (tasks.md 1.11). Add one hand-traced footprint, then run this test again.',
  );

  const collection = JSON.parse(readFileSync(evidencePath, 'utf8')) as { features: GateFeature[] };
  const building = collection.features.find((f) => f.properties.kind === 'building' && f.properties.status === 'published');
  test.skip(!building, 'data/evidence/fip_v3_1911_229.geojson has no published building.');
  const feature = building as GateFeature;

  // The first exterior ring's area-weighted centroid, in EPSG:26917.
  const polygon = (feature.geometry.type === 'MultiPolygon'
    ? (feature.geometry.coordinates as number[][][][])[0]
    : (feature.geometry.coordinates as number[][][])) as number[][][];
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
  const centroid: [number, number] = [cx / (3 * area), cy / (3 * area)];
  const roof = (feature.properties.attributes.storeys ?? 1) * 3.5; // the display height the Shell sends

  await openGate(page);
  const before = (await debugState(page)).cameraSeq;
  await page.getByTestId('era-1911').click();
  const state = await waitFor(page, 'the camera report after switching to 1911', (s) => s.depth === depthOf('1911') && s.cameraSeq > before);
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

  const camera = (await debugState(page)).camera ?? state.camera;
  expect(camera).not.toBeNull();
  const target = projectToPixels(camera as Camera, centroid[0], centroid[1], roof);
  const box = await page.getByTestId('unity-canvas').boundingBox();
  expect(box).not.toBeNull();
  expect(target.x).toBeGreaterThan(0);
  expect(target.x).toBeLessThan((camera as Camera).canvas.widthPx);
  expect(target.y).toBeGreaterThan(0);
  expect(target.y).toBeLessThan((camera as Camera).canvas.heightPx);

  // A real click: move, press, hold for a few frames, release.
  const at = { x: (box as { x: number }).x + target.x, y: (box as { y: number }).y + target.y };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();

  const card = page.getByTestId('evidence-card');
  await expect(card).toBeVisible({ timeout: 30_000 });

  const sources = readJson<{ sources: Array<{ id: string; title: string; attribution_line: string }> }>('sources.json').sources;
  const origin = sources.find((s) => s.id === feature.properties.provenance.origin_source);
  expect(origin, 'the origin source is registered').toBeDefined();

  await expect(page.getByTestId('card-feature')).toHaveText(feature.id);
  await expect(page.getByTestId('card-read-from')).toContainText(feature.properties.provenance.origin_source);
  await expect(page.getByTestId('card-position')).toHaveText(positionPhrase(feature.properties.position_error_m));
  await expect(page.getByTestId('card-confirmed-by')).toHaveText(feature.properties.provenance.confirmed_by);
  await expect(page.getByTestId('card-confirmed-at')).toHaveAttribute('title', feature.properties.provenance.confirmed_at);
  await expect(page.getByTestId('card-attribution')).toHaveText((origin as { attribution_line: string }).attribution_line);

  await page.screenshot({ path: join(OUTPUT, 'gate-card.png') });
});
