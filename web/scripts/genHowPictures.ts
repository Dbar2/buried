/**
 * Writes the four pictures of the How page (spec 08 requirement 6.1, task 8) to `public/lotcheck/how-*.jpg`, from
 * the committed tiles and evidence. Nothing is drawn by hand: the crops are cut from the untouched tiles, the
 * outlines are the evidence's own geometry through the tile's sheet transform, and today's lines are the City's
 * building outlines. Colours come from tokens.css. Run `npm run gen:how-pictures` and commit the files.
 *
 *   how-1-plan.jpg      the lettering "Coal & Wood Yard" on the 1911 plan, as scanned
 *   how-2-outline.jpg   the yard on the same plan with its outline from the evidence
 *   how-3-placed.jpg    the plan left of a line, today's building outlines right of it, the outline on both
 *   how-4-lettering.jpg the lettering of the 1931-35 plan, as scanned
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { makeSheetTransform, worldToPixel } from '../src/block/sheetTransform';
import { loadData } from '../src/data/loadData';
import { diskFetch, REPOSITORY_DATA } from '../src/explorer/testing/diskFetch';
import { PRESENT_SOURCES } from '../src/report/buildReport';
import { ringsOf } from '../src/report/cropPlan';
import { landingFact } from '../src/lotcheck/landing';
import { readCropOf } from '../src/lotcheck/lettering';

const WEB = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = join(WEB, 'public', 'lotcheck');
const MAX_BYTES = 90_000;

const tokens = readFileSync(join(WEB, 'src', 'styles', 'tokens.css'), 'utf8');
const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens);
  if (!m) throw new Error(`token --${name} missing`);
  return m[1] as string;
};

type Op = { pts: Array<[number, number]>; stroke: string; width: number; dash?: number[]; rightOnly?: boolean };
type Job = { name: string; source: string; sx: number; sy: number; sw: number; sh: number; outW: number; outH: number; ops: Op[]; split?: number };

const data = await loadData(diskFetch(REPOSITORY_DATA));
const fact = landingFact(data.evidence, data.presentLayers.get(PRESENT_SOURCES.addresses), data.registry);
if (!fact) throw new Error('no landing fact, so no yard to show');

const tileOf = (id: string) => {
  const t = data.tiles.find((x) => x.source === id);
  if (!t) throw new Error(`no tile for ${id}`);
  return t;
};
const sheetOf = (id: string) => {
  const t = tileOf(id);
  return makeSheetTransform(t.corners, t.width_px, t.height_px);
};

const featureById = new Map(data.evidence.flatMap((c) => c.features).map((f) => [f.id, f]));
const readOf = (featureId: string) => {
  const f = featureById.get(featureId);
  if (!f) throw new Error(`no feature ${featureId}`);
  const crop = readCropOf(f, data.tiles, 'the plan');
  if (!crop) throw new Error(`no lettering crop for ${featureId}`);
  return crop;
};

/** A window of `w` by `h` tile pixels about (cx, cy), kept on the tile. */
function window(id: string, cx: number, cy: number, w: number, h: number) {
  const t = tileOf(id);
  const sx = Math.min(Math.max(cx - w / 2, 0), t.width_px - w);
  const sy = Math.min(Math.max(cy - h / 2, 0), t.height_px - h);
  return { sx, sy, sw: w, sh: h };
}

const jobs: Job[] = [];
const first1911 = fact.areas.find((a) => a.sourceId === 'fip_v3_1911_229');
const first1935 = fact.areas.find((a) => a.sourceId === 'fip_v3_1935_229');
if (!first1911 || !first1935) throw new Error('the yard is not on both plans');

// 1: the lettering on the 1911 plan, with some of the sheet around it.
{
  const c = readOf(first1911.featureId);
  const w = c.sw * 1.6;
  const win = window('fip_v3_1911_229', c.sx + c.sw / 2, c.sy + c.sh / 2, w, w * 0.62);
  jobs.push({ name: 'how-1-plan', source: 'fip_v3_1911_229', ...win, outW: 640, outH: Math.round(640 * (win.sh / win.sw)), ops: [] });
}

// 2: the yard with its outline.
const t1911 = sheetOf('fip_v3_1911_229');
const yardPx = ringsOf(first1911.geometry).flatMap((r) => r.map((p) => worldToPixel(t1911, p)));
const cx = (Math.min(...yardPx.map((p) => p[0])) + Math.max(...yardPx.map((p) => p[0]))) / 2;
const cy = (Math.min(...yardPx.map((p) => p[1])) + Math.max(...yardPx.map((p) => p[1]))) / 2;
const spanX = Math.max(...yardPx.map((p) => p[0])) - Math.min(...yardPx.map((p) => p[0]));
const view = window('fip_v3_1911_229', cx, cy, spanX * 1.5, spanX * 1.5 * 0.66);
const toOut = (job: { sx: number; sy: number; sw: number; outW: number }, p: [number, number]): [number, number] => [((p[0] - job.sx) / job.sw) * job.outW, ((p[1] - job.sy) / job.sw) * job.outW];
const outline = (job: { sx: number; sy: number; sw: number; outW: number }, rightOnly = false): Op[] =>
  ringsOf(first1911.geometry).flatMap((ring) => {
    const pts = ring.map((p) => toOut(job, worldToPixel(t1911, p) as [number, number]));
    return [
      { pts, stroke: token('ink'), width: 5, rightOnly },
      { pts, stroke: token('lantern'), width: 3, rightOnly },
    ];
  });
{
  const job = { name: 'how-2-outline', source: 'fip_v3_1911_229', ...view, outW: 640, outH: Math.round(640 * (view.sh / view.sw)), ops: [] as Op[] };
  job.ops = outline(job);
  jobs.push(job);
}

// 3: the plan, and today's building outlines placed by the same transform.
{
  const job: Job = { name: 'how-3-placed', source: 'fip_v3_1911_229', ...view, outW: 640, outH: Math.round(640 * (view.sh / view.sw)), ops: [], split: 0.5 };
  const buildings = data.presentLayers.get(PRESENT_SOURCES.buildings)?.features ?? [];
  const ops: Op[] = [];
  for (const f of buildings) {
    if (f.geometry.type !== 'Polygon' && f.geometry.type !== 'MultiPolygon') continue;
    for (const ring of ringsOf(f.geometry)) {
      const pts = ring.map((p) => toOut(job, worldToPixel(t1911, p) as [number, number]));
      if (pts.some(([x, y]) => x > -20 && x < job.outW + 20 && y > -20 && y < job.outH + 20)) ops.push({ pts, stroke: token('ink'), width: 1, rightOnly: true });
    }
  }
  job.ops = [...ops, ...outline(job)];
  jobs.push(job);
}

// 4: the lettering on the 1931-35 plan.
{
  const c = readOf(first1935.featureId);
  const w = c.sw * 1.6;
  const win = window('fip_v3_1935_229', c.sx + c.sw / 2, c.sy + c.sh / 2, w, w * 0.62);
  jobs.push({ name: 'how-4-lettering', source: 'fip_v3_1935_229', ...win, outW: 640, outH: Math.round(640 * (win.sh / win.sw)), ops: [] });
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto('about:blank');
  for (const job of jobs) {
    const b64 = readFileSync(join(REPOSITORY_DATA, 'tiles', tileOf(job.source).image)).toString('base64');
    let jpeg = '';
    for (let q = 0.72; q >= 0.3; q -= 0.05) {
      jpeg = await page.evaluate(
        async ({ b64: image64, job: j, q: quality, paper, ink }) => {
          const image = new Image();
          image.src = `data:image/jpeg;base64,${image64}`;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = j.outW;
          canvas.height = j.outH;
          const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(image, j.sx, j.sy, j.sw, j.sh, 0, 0, j.outW, j.outH);
          const splitX = j.split === undefined ? 0 : j.split * j.outW;
          if (j.split !== undefined) {
            ctx.fillStyle = paper;
            ctx.fillRect(splitX, 0, j.outW - splitX, j.outH);
          }
          for (const op of j.ops) {
            ctx.save();
            if (op.rightOnly) {
              ctx.beginPath();
              ctx.rect(splitX, 0, j.outW - splitX, j.outH);
              ctx.clip();
            }
            ctx.strokeStyle = op.stroke;
            ctx.lineWidth = op.width;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            op.pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
          }
          if (j.split !== undefined) {
            ctx.fillStyle = ink;
            ctx.fillRect(splitX - 1, 0, 2, j.outH);
          }
          return canvas.toDataURL('image/jpeg', quality).split(',')[1] as string;
        },
        { b64, job, q, paper: token('parchment'), ink: token('ink') },
      );
      if (Buffer.from(jpeg, 'base64').length <= MAX_BYTES) break;
    }
    const file = join(OUT_DIR, `${job.name}.jpg`);
    writeFileSync(file, Buffer.from(jpeg, 'base64'));
    console.log(`wrote ${job.name}.jpg (${statSync(file).size} bytes, ${job.outW} x ${job.outH})`);
  }
} finally {
  await browser.close();
}
