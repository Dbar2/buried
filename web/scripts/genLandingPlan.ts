/**
 * Writes the Landing's plan picture (spec 08 design "Load weight"): a crop of the untouched 1911 tile around
 * the area `landingFact` counts in, as `public/lotcheck/landing-plan.jpg` (at most 200 KB), with
 * `landing-plan.json` holding the crop's corners in EPSG:26917 so the page draws the outline from the evidence
 * with the same sheet transform. Run `npm run gen:landing-plan` and commit both files. The crop is cut from
 * the tile as it is: no tone, no sharpening.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { makeSheetTransform, pixelToWorld, worldToPixel } from '../src/block/sheetTransform';
import { loadData } from '../src/data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../src/explorer/testing/diskFetch';
import { PRESENT_SOURCES } from '../src/report/buildReport';
import { landingFact } from '../src/lotcheck/landing';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(WEB, 'public', 'lotcheck');
const SOURCE = 'fip_v3_1911_229';
const MARGIN_M = 28;
const ASPECT = 1.1;
const LONG_EDGE_PX = 960;
const MAX_BYTES = 200_000;

const data = await loadData(diskFetch(REPOSITORY_DATA));
const fact = landingFact(data.evidence, data.presentLayers.get(PRESENT_SOURCES.addresses), data.registry);
if (!fact) throw new Error('the landing fact is empty, so there is no yard to frame');
const areas = fact.areas.filter((a) => a.sourceId === SOURCE);
if (areas.length === 0) throw new Error(`no counted area is read from ${SOURCE}`);
const sidecar = data.tiles.find((t) => t.source === SOURCE);
if (!sidecar) throw new Error(`no tile sidecar for ${SOURCE}`);

const t = makeSheetTransform(sidecar.corners, sidecar.width_px, sidecar.height_px);
const pts = areas.flatMap((a) => (a.geometry.type === 'Polygon' ? a.geometry.coordinates : a.geometry.coordinates.flat()).flat()) as Array<[number, number]>;
const px = pts.map((p) => worldToPixel(t, p));
const pixelM = Math.hypot(t.u[0], t.u[1]);
const pad = MARGIN_M / pixelM;
let minX = Math.min(...px.map((p) => p[0])) - pad;
let maxX = Math.max(...px.map((p) => p[0])) + pad;
let minY = Math.min(...px.map((p) => p[1])) - pad;
let maxY = Math.max(...px.map((p) => p[1])) + pad;
let w = maxX - minX;
let h = maxY - minY;
if (w / h < ASPECT) w = h * ASPECT;
else h = w / ASPECT;
const cx = (minX + maxX) / 2;
const cy = (minY + maxY) / 2;
minX = Math.max(0, Math.min(sidecar.width_px - w, cx - w / 2));
minY = Math.max(0, Math.min(sidecar.height_px - h, cy - h / 2));
maxX = minX + w;
maxY = minY + h;
const scale = LONG_EDGE_PX / Math.max(w, h);
const outW = Math.round(w * scale);
const outH = Math.round(h * scale);

const tile = readFileSync(join(REPOSITORY_DATA, 'tiles', sidecar.image)).toString('base64');
const browser = await chromium.launch();
let jpeg = '';
let quality = 0.7;
try {
  const page = await browser.newPage();
  await page.goto('about:blank');
  for (; quality >= 0.3; quality -= 0.05) {
    jpeg = await page.evaluate(
      async ({ b64, sx, sy, sw, sh, ow, oh, q }) => {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${b64}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = ow;
        canvas.height = oh;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, ow, oh);
        return canvas.toDataURL('image/jpeg', q).split(',')[1] as string;
      },
      { b64: tile, sx: minX, sy: minY, sw: w, sh: h, ow: outW, oh: outH, q: quality },
    );
    if (Buffer.from(jpeg, 'base64').length <= MAX_BYTES) break;
  }
} finally {
  await browser.close();
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'landing-plan.jpg'), Buffer.from(jpeg, 'base64'));
const corner = (x: number, y: number): [number, number] => pixelToWorld(t, [x, y]).map((v) => Math.round(v * 1000) / 1000) as [number, number];
writeFileSync(
  join(OUT_DIR, 'landing-plan.json'),
  `${JSON.stringify(
    {
      schema_version: '1.0.0',
      source: SOURCE,
      image: 'landing-plan.jpg',
      width_px: outW,
      height_px: outH,
      corners: { top_left: corner(minX, minY), top_right: corner(maxX, minY), bottom_right: corner(maxX, maxY), bottom_left: corner(minX, maxY) },
      attribution_line: sidecar.attribution_line,
    },
    null,
    2,
  )}\n`,
);
console.log(`wrote landing-plan.jpg (${statSync(join(OUT_DIR, 'landing-plan.jpg')).size} bytes, quality ${quality.toFixed(2)}) and landing-plan.json`);
